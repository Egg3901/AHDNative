# Referendum lifecycle note (M02 campaign edges + cohort snapshot/recompute)

Base: `b1cedbf`. AHDGame reference: `e364c04954ed628beef73a993a8e9e156650a31e`.
Scope: `packages/engine/src/referendum/lifecycle.ts`, `packages/engine/src/referendum/types.ts`,
`packages/engine/src/referendum/cohort.ts` (new), `packages/engine/src/referendum/cohort.test.ts` (new),
`packages/engine/src/referendum/campaignWindow.test.ts`, plus this note only.

## Omission closed

`runReferendumLifecycle` parked every `granted` and `campaigning` record forever:
both statuses hit the old `if (ref.status !== "polling") continue` guard, so the
only live edge was `polling -> actuating | settled`. Against the reference
(`src/lib/referendum/processReferendumLifecycle.ts`), the two campaign edges are
pure timer gates, and they now run with the data writes that keep outcomes off
stale data:

- `granted -> campaigning` unconditionally on the next turn, snapshotting the
  cohort baseline and seeding the opening poll point.
- `campaigning -> polling` when `campaignCloseTurn != null && currentTurn >= campaignCloseTurn`.
  A null/missing close never fires, matching the source guard. Every
  campaigning turn recomputes the canonical Yes share and upserts the poll
  snapshot; the final reading folds into the transition write.
- `polling` resolves on the canonical aggregate, never the stored scalar.
- Each record advances at most one edge per turn, matching the source
  per-record `continue` after each branch.

## What was ported verbatim, what was stubbed

Ported (new `cohort.ts`):

- Campaign/soft-cap tunables (`GG_TURNOUT_MOD_CAP = 20`, `GG_LEAN_MOD_CAP = 25`,
  `CAMPAIGN_SPEND_YESSHARE_PER_UNIT = 0.5`, `CAMPAIGN_SPEND_HALF_LIFE_UNITS = 20`,
  `POLL_HISTORY_CAP = 64`; all `src/lib/constants/referendum.ts`).
- `saturate` / `effLean` / `effTurnout` / `leanFromUnits` /
  `cumulativeCampaignEffect` / `deriveCampaignYesShare` / `aggregateYesShare`
  (`cohortEngine.ts` + constants), `referendumYesShare` (`resolveYesShare.ts`),
  `upsertPollPoint` (`pollSnapshot.ts`).
- `CAMPAIGN_WINDOW_TURNS = 48`.
- New optional record fields (`cohortBaseline`, `cohortModifiers`,
  `campaignSpendUnits`, `pollHistory`, plus the earlier window fields): the
  lifecycle writes the baseline/history and reads the window, never invents it.
  Fixtures stand in for the missing grant action and must carry the window.

Baseline substrate decision: mainline builds the baseline from the Layer-1
bucket profile (`age:young`-style vocabulary). AHDNative demographics are voter
archetypes (`post_industrial_workers`, ...), and the affinity table's own doc
(`referendumCohorts.ts`) states projecting archetypes onto buckets is
"arithmetically faithful and historically wrong", so no such mapping was built.
Regions with no Layer-1 substrate take mainline's own verbatim fallback
(`buildCohortBaseline`): one `{ groupId: "_all", share: 1, turnout: 60 }`
cohort with yesLean = opening desire, so the aggregate equals the opening
desire by construction. While no spend/ground-game writers exist the canonical
share is numerically identical to the baseline; the seam is live (spend folds
in via `leanFromUnits`) and no partially computed outcome can activate: every
resolution path runs the full `referendumYesShare` recompute first.

Still stubbed (unchanged, documented in `lifecycle.ts` / `cohort.ts`):

- `buildReferendumCohorts` / affinity table / bucket profile: no Layer-1
  substrate to feed them.
- Wire events (`opened`, `swing`): AHDClient has no wire; mainline treats them
  as best-effort `.catch(() => {})`, display-only.
- No `requestReferendum` / grant / decline actions, no consent-bill gate, no
  secession actuation. Passed votes still park in `actuating`.

## RNG and determinism

All campaign edges are rng-free except the pre-existing seeded vote variance.
Worlds with empty `referendums` never enter the new branches and are unaffected
by construction. The full world state replays byte-identically from a mid-campaign save through polling resolution, comparing each complete serialized checkpoint. The boundary chain advances one edge per turn.

Tests: `cohort.test.ts` (21 tests, vectors mirrored from mainline's
`cohortEngine.test.ts` / `resolveYesShare.test.ts` / `pollSnapshot.test.ts`),
`campaignWindow.test.ts` (9 tests: window gates, one-edge-per-turn pin,
null/missing close, 4-turn boundary chain to resolution, stale-scalar
resolution on the canonical aggregate both directions, save/load round trip),
plus the existing `lifecycle.test.ts` (14 tests, unmodified). After: 44/44 pass across pure reference vectors and public `advanceTurn`/save checks, and `tsc -p packages/engine/tsconfig.json`
is clean. No full-suite run, no 48-turn simulation: boundary coverage uses
small-window fixtures (close on turn 1/3) plus the verbatim `48` constant pin.

`Math.tanh` is newly used by the reference soft-cap formula. Exact cross-language float behavior remains part of the conditional Rust parity gate; these tests establish JavaScript reference behavior only. Native worlds still lack the granular UK electorate substrate, so the fallback path is not proof of full UK referendum parity.
