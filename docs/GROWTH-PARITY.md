# Growth / TFP parity slice (M04 bounded)

Date: 2026-09-10. Worktree `fix/growth-parity` based on `main` `b4892fee8a05e155cf9c511264bfdba0c33f996a`. No commit.

## Source pins

- Upstream authority: AHDGame `src/lib/metricEngine/potentialGrowth.ts` and `src/lib/metricEngine/phase.ts` at `e364c04954ed628beef73a993a8e9e156650a31e` (`e364c0495`). Read only. Not edited.
- This engine: AHDNative worktree at `b4892fe` plus the local TFP slice. Formula copied, not rebalanced.

## Gap (independently verified)

`packages/engine/src/phases/macroCountryTurn.ts` computed Solow potential with live labor (`computeLaborForce` / `annualizedGrowthRate`) and lagged capital (`world.capitalGrowth`) but set `const tfp = TFP_BASELINE` (1.2). AHDGame `tfpBasket` at the pin is a deviation-from-reference mix of six prev-turn metrics, clamped to `[0.2, 2.6]`. Reference inputs yield exactly 1.2.

## What landed

- Pure `tfpBasket`, `agglomeration`, `TFP_REFERENCE_INPUTS` in `packages/engine/src/demographics/laborForce.ts`, byte-matching the AHDGame formula at the pin.
- `macroCountryTurnPhase` reads last turn's `world.nationalMetrics[countryId]` at the exact AHDGame `phase.ts` paths:
  - `economic.rdIntensity`
  - `education.workforceSkill`
  - `infrastructure.transportEfficiency`
  - `infrastructure.broadbandAccess`
  - `infrastructure.powerGridReliability`
  - `population.urbanizationRate`
- Absent or non-finite leaves stay `undefined`. `tfpBasket` then uses `TFP_REFERENCE_INPUTS` (`orRef`). Default worlds therefore keep the previous flat 1.2 TFP.
- `nationalMetricsPhase` runs later in `registry.ts`, so the macro read is a prev-turn lag (same C3 shape as AHDGame).

No other metric names were mapped. No new stores. `packages/engine/src/index.ts` untouched.

## Independently computed vectors (not copied from AHDGame tests)

Closed form at the pin, `tfpBasket` annual %:

| Inputs | TFP |
|---|---|
| `{}` or `TFP_REFERENCE_INPUTS` | `1.2` |
| `rdIntensity: 4.5` | `1.45` |
| `rdIntensity: 0.5` | `0.95` |
| `workforceSkill: 90` / `30` | `1.7` / `0.7` |
| THRESHOLDS-worst joint (0.5 / 30 / 20 / 50 / 97 / 25) | `0.2` (floor) |
| THRESHOLDS-best joint (4.5 / 90 / 90 / 99 / 99.9 / 92) | `2.5231407725164536` |
| `agglomeration(92)` / `agglomeration(25)` | `92/132` / `25/65` (concave) |

`potentialGrowth(0.4, 2.0, tfpBasket(ref)) = 2.144`.

## Missing-input gate (still open for default worlds; aggregation path live)

`computeNationalMetricsForCountry` writes `economic.gdpGrowth`, `economic.inflationRate`, `economic.unemploymentRate`, and budget governance mirrors, and additionally aggregates the six exact TFP leaves from the recorded per-region rows in `WorldState.regionalMetrics` (schema v45): population-weighted, era-gated via `isMetricActive` (e.g. `broadbandAccess` is 1998+, so a pre-1998 world never aggregates it). No synthetic seeds and no national stand-in: when no region records a leaf it stays absent and `macroCountryTurn` falls back to `TFP_REFERENCE_INPUTS` (TFP 1.2).

Seed audit 2026-09-18: the authoritative Native packs (`packages/content/src/packs/`, all four eras) contain no values for any of the six leaves — pack grep matches only unrelated voter-group labels (`urban_progressives`, `urban_professional`) and tax-line names, never the `economic.rdIntensity` / `education.workforceSkill` / `infrastructure.*` / `population.urbanizationRate` metric paths. There is therefore no source-backed seed slice to implement; inventing time series from spending shares or group labels is explicitly out of scope. After `createWorld` plus `advanceTurn` on a default 1953/1979/1991/2019 US world (see `packages/engine/src/metrics/tfpInputs.sim.test.ts`) those six keys are absent and the basket stays at baseline.

The only live progression contract is the real regional-scope policy store: `policyEffects` / `ministerialOrders` regional effects record rows in `world.regionalMetrics[regionId]`, the tail `nationalMetricsPhase` aggregates them, and `macroCountryTurn` reads the aggregated row one turn later (C3 lag). Both stores persist through `serializeSave` / `deserializeSave` at the current schema; v42 projection refuses a save with non-empty `regionalMetrics` rather than silently dropping TFP state (`packages/engine/src/save.ts`).

Do not claim full AHDGame TFP effects from the helper plus aggregation alone. Education, infrastructure, and urbanization still do not move growth on a default world, and the remaining prerequisites (per-region sector revenue, state education/infrastructure spending, registry dependency chain, full region coverage, downstream inflation/revenue effects) are recorded in `docs/TFP-REMAINDER-AUDIT.md`. Keep #40 open.

## Tests

```
npx vitest run --config packages/engine/vitest.config.ts \
  packages/engine/src/demographics/tfpBasket.test.ts \
  packages/engine/src/phases/tfpGrowthParity.test.ts
```

Public contract (`createWorld` / `advanceTurn` / `serializeSave` / `deserializeSave`):

- Absent metrics and injected `TFP_REFERENCE_INPUTS` produce the same first-turn US growth, output gap, unemployment, and GDP.
- Injected `rdIntensity` 4.5 vs 0.5: first-turn `growthRate` matches (output gap starts at 0, so `gdpGrowth` equals the sector signal); higher TFP lowers `outputGap` and raises `unemploymentRate` via Okun (growth further below a higher potential). Turn 2 `growthRate` is higher for 4.5 because of that gap carry. `nationalMetricsPhase` has already dropped the TFP keys, so turn 2 is not a second basket hit.
- Injected metrics round-trip through save/load and yield the same first-turn US economy.

## Out of scope

- Phase-order re-golden (rest of M04).
- Inventing urbanization/education from demographics or region population.
- Seeding the six TFP leaves from pack data that does not contain them; inventing metric time series.
- Rebalancing coefficients.
- Commit, push, merge, cherry-pick.
