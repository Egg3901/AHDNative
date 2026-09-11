# Phase order depth

Date: 2026-09-10

This slice compares the Native turn registry with AHDGame at pinned commit
`e364c0495` and corrects one causal edge. It does not reorder the whole
pipeline or make a parity claim for the remaining deferred clusters.

## Corrected dependency

AHDGame executes `corporationTurn` before `macroCountryTurn` in
`src/simulation/phases/turnPhaseRegistry.ts`. The corporation phase updates
the per-country revenue snapshot, and the macro phase uses that snapshot as its
realized growth signal.

Native previously ran `macroCountryTurnPhase` near the start of the registry
and `corporationTurnPhase` near the tail. On the first advance, macro therefore
read the bootstrap snapshot where `current` equaled `previous`; corporate
output reached macro growth on the following turn.

The registry now places `corporationTurnPhase` immediately before
`macroCountryTurnPhase`. This is the smallest change that restores the direct
reference dependency while leaving the other Native tail placements intact.
`corporationTurnPhase` does not accept or call the shared RNG. The move itself
does not consume or shift the RNG stream. Later state-dependent phases can of
course observe the intended current-turn economy values.

The public `advanceTurn` observation for seed `phase-order-depth` now records
the corporation snapshot before macro reads it:

```text
corporationTurn, turn 1: current 8554944062.5, previous 8546250000
macroCountryTurn, turn 1: current 8554944062.5, previous 8546250000
US growth after macro: 0.0488
US output gap after macro: 0.077
```

The numeric values are fixture evidence for that seed. The contract is the
same-turn ordering and the snapshot relationship, not a balance target.

## Focused contract tests

`packages/engine/src/phaseOrderDepth.test.ts` uses only the public world
creation, `advanceTurn`, and save APIs. It proves that current corporate
revenue is visible at the macro phase and that advancing a live world after a
serialize/deserialize round trip produces byte-identical state. The test was
red before the registry move because macro observed the bootstrap snapshot.

Focused commands:

```text
npx vitest run --config packages/engine/vitest.config.ts src/phaseOrderDepth.test.ts
npm run typecheck --workspace @ahdclient/engine
git diff --check
```

## Dependency map and remaining limits

| Area | AHDGame order at `e364c0495` | Native status after this slice |
|---|---|---|
| Corporation and macro economy | `corporationTurn` precedes `macroCountryTurn` | Direct revenue snapshot edge aligned. Absolute placement still differs because Native retains its append-only tail strategy for other systems. |
| Macro, commodity, and fiscal growth | Macro runs before commodity pricing; fiscal growth consumes settled economic factors in its documented slot | Native macro now sees corporate output first. Trade and fiscal phases remain in their existing bounded order. |
| Campaign and election tally | `campaignTurn` precedes `voteAccumulation`; `campaignSpendReset` follows vote accumulation | Aligned by the M04 move: the campaign cluster precedes `voteAccumulation` with the reset after, same turn (see [campaign order](CAMPAIGN-ORDER-DEPTH.md)). Absolute tail placement of the block is otherwise retained. |
| Election timers and resolution | Vote accumulation, spend reset, timers, snapshots, and resolution have a strict sequence | Native retains its existing relative election sequence, with no broad reordering in this slice. |

Known gaps remain: campaign operations are still a partial port, the Native
economy and metric clusters are not in AHDGame absolute positions, several
tail phases intentionally preserve historical replay vectors, and no
differential whole-turn oracle exists. This correction therefore supports the
specific corporate revenue to macro growth dependency only.

## Sources

- AHDGame `e364c0495`, `src/simulation/phases/turnPhaseNames.ts` and
  `src/simulation/phases/turnPhaseRegistry.ts`, especially the
  `corporationTurn`, `macroCountryTurn`, `campaignTurn`,
  `voteAccumulation`, and `campaignSpendReset` registrations.
- AHDNative `packages/engine/src/corporation/corporationTurn.ts`, which writes
  `corpRevenueSnapshots`.
- AHDNative `packages/engine/src/phases/macroCountryTurn.ts`, which reads
  `corpRevenueSnapshots` for `computeRealizedRevenueGrowthRate`.
