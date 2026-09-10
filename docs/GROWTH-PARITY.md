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

## Missing-input gate (unresolved)

`computeNationalMetricsForCountry` still writes only `economic.gdpGrowth`, `economic.inflationRate`, `economic.unemploymentRate`, and budget governance mirrors. It does not seed the six TFP leaves (`E01_PER_STATE_METRICS`). After `advanceTurn` on a default 1953 US world those six keys are absent.

`policyEffects` / `ministerialOrders` can write those exact dotted keys when a law or order targets them. Those writes survive until the next `nationalMetricsPhase` rebuild, so `macroCountryTurn` on the following turn can see them as real prior-turn values. That path is not a substitute for a stateMetrics store.

Do not claim full AHDGame TFP effects from the helper alone. Education, infrastructure, and urbanization do not move growth on a default world.

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
- Seeding or persisting the six TFP leaves inside `nationalMetricsPhase`.
- Rebalancing coefficients.
- Commit, push, merge, cherry-pick.
