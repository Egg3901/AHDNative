# Referendum parity note (M02 bounded correction)

Base: `b4892fe`. AHDGame reference: `e364c04954ed628beef73a993a8e9e156650a31e`. Scope: `packages/engine/src/referendum/*` plus this note only.

## What changed

`runReferendumLifecycle` now resolves the `polling` vote with
`seededVariance(ref.id, world.meta.turn)`, a verbatim port of AHDGame
`src/lib/referendum/processReferendumLifecycle.ts:seededVariance`
(FNV-1a 32-bit over `${id}:${turn}`, mapped to `[-1, 1]`).
`resolveReferendumVote` was already verbatim and is untouched.
The old `rng.next() * 2 - 1` draw is removed. New unit:
`packages/engine/src/referendum/seededVariance.ts`.

## RNG policy (explicit, verified)

The referendum lifecycle phase is now rng-free: it neither draws from nor
writes to the shared world RNG. Evidence:

- Probe with `advanceTurn` plus an `afterPhase` hook: with the old code the
  RNG state after `referendumLifecycle` differed between a plain world and
  one carrying a `polling` referendum, so every downstream phase drew from
  shifted state. After this change the post-phase RNG states are identical.
- The old `docs/MECHANICS-PARITY.md` suggestion that this change "does not
  shift any other phase's RNG draw" is wrong for referendum-bearing worlds
  and must not be repeated: `engine.ts` threads one shared RNG through all
  phases in registry order, and `referendumLifecyclePhase` sits mid-tail
  (before the metric, wars, ministerial, and other clusters), so removing
  its draw shifts downstream draws for worlds with a `polling` record.
  That shift is the intended parity fix: the old draw was the divergence.
- Worlds with no `polling` referendum are bit-identical before and after:
  sha256 of full world JSON after 3 no-action `advanceTurn` turns matches
  base `b4892fe` exactly in US and UK probes. The loop body never executes, so no draw existed
  to remove. Existing historical goldens, which contain no referendums,
  are unaffected by construction.

## Reference vectors (independently obtained)

Computed from the AHDGame algorithm read at its source commit, corroborated
by a second implementation in Python:

- `seededVariance("SCO-1953-0", 10)` = `-0.6077080130595034`
- `seededVariance("SCO-1953-0", 11)` = `-0.6155207007228212`
- `seededVariance("WAL-1953-0", 10)` = `-0.8706948011812509`
- `seededVariance("ref-test-1", 0)` = `0.22314065769853553`
- Seam: `resolveReferendumVote({yesShare: 50, varianceRoll: 0})` gives
  `{50, 55, false}`; roll `1` gives `{54, 57.4, true}`; roll `-1` gives
  `{46, 57.4, false}`.
- End to end: fresh 1953 world plus one `polling` fixture at `yesShare 52`
  resolves at turn 1 to `50.29910150410121` for id `SCO-1953-0` and
  `55.74570027174095` for id `WAL-1953-0` (same input, divergent by id,
  byte-identical on replay across a JSON save/load round trip).

Tests: `packages/engine/src/referendum/lifecycle.test.ts` (14 tests,
all passing; included in the ordinary CI suite) plus `npm run typecheck` clean in `packages/engine`.

## Remaining lifecycle gaps (not claimed)

- No `requestReferendum` player action; no `granted -> campaigning` or
  `campaigning -> polling` transitions (need the Layer-1 cohort engine and
  poll-history tracking); no `actuating -> completed | cancelled` consent
  gate or secession actuation. Passed votes park in `actuating`.
- `yesShare` is denormalized fixture input, not the cohort aggregate
  (`referendumYesShare`) mainline votes on.
- End-to-end referendum playability is still not claimed.

## Next-step judgment

The remaining gaps are additive phases and actions behind the same seam,
completable next without rebalancing: none of them change existing numbers
because no live path creates referendum records today. The cohort port is
the load-bearing piece and the only one that can move vote outcomes once
`yesShare` becomes computed rather than fixture input.
