# Engine adaptations after import

The source manifest retains hashes from AHDClient `568c0c039efcca2db17c52b2920747ff05fbd794`. It records the imported baseline, not a claim that the current engine is unchanged. Intentional changes follow here, with reference pins and validation.

| Files | Change | Evidence and limits |
|---|---|---|
| `packages/engine/src/index.ts` | Export existing action refresh constants and read-only membership eligibility to display queries | No formula change; resource/session tests use real action behavior |
| `packages/engine/src/referendum/{seededVariance,lifecycle,phases}.ts` | Match AHDGame per-record FNV variance; remove divergent shared RNG draw | [Referendum evidence](REFERENDUM-PARITY.md). RNG shifts downstream in worlds with polling referendums. Full lifecycle remains incomplete |
| `packages/engine/src/referendum/lifecycle.test.ts` | Move the short referendum suite from the `.sim.test.ts` exclusion into routine CI and add reference vectors/public replay cases | 14 short tests; no long simulation generator |
| `packages/engine/src/demographics/laborForce.ts`, `packages/engine/src/phases/macroCountryTurn.ts` | Reference TFP basket and exact prior-turn national metric inputs with fallback | [Growth evidence](GROWTH-PARITY.md). No full state-metric or phase-order parity claim |
| `packages/engine/src/save.ts`, `packages/engine/src/index.ts`, `packages/engine/src/save.v42Projection.test.ts`, `src/game/saveCompatibility.ts`, `scripts/export-save-v42.ts` | Public `projectSaveToV42`: drop reconstructable `countryPolitics`, keep a string `homeRegionId` as an opaque extra the historical v42 reader preserves. App module re-exports the engine projector; the local CLI uses that same writer | [Interchange depth](V42-INTERCHANGE-DEPTH.md). Native-fresh pre-turn export is the keep-home extension document, not the authentic mint. Progressed national-mood history still refused. Not a schema-number rewrite |

| `packages/engine/src/referendum/{cohort,lifecycle,types}.ts` | Campaign window, baseline/poll snapshot, canonical cohort/spend calculation before resolution | [Lifecycle evidence](REFERENDUM-LIFECYCLE.md). Exact source math and source fallback for absent substrate; request/grant, granular electorate, consent and actuation remain open |

| `packages/engine/src/{world,initialization/ukHistorical}.ts` | Explicit synthetic UK historical bootstrap for 1953/1979, preserving founding default | [UK evidence](UK-CAREER-DEPTH.md). Opt-in changes shared creation RNG; no existing save reseeding or full UK career parity |
| `packages/engine/src/phases/registry.ts`, `packages/engine/src/corporation/corporationTurn.ts`, `packages/engine/src/phases/macroCountryTurn.ts` | Register `corporationTurnPhase` immediately before `macroCountryTurnPhase` so current-turn corporate revenue is the macro growth signal | [Phase order evidence](PHASE-ORDER-DEPTH.md). RNG-free does not mean no behavior change. Same-turn macro signal is intended. See the integration note below |

AHDGame reference for the mechanics corrections: `e364c04954ed628beef73a993a8e9e156650a31e`. Expected vectors come from those source formulas, independently calculated. New targeted tests live alongside each changed system. The historical 21-world replay evidence predates these corrections; it must not be represented as fresh whole-engine parity with current AHDGame.

## Corporation and macro order (M04 slice)

Native copied the completed M04 registry move from the `feat/phase-order-depth` worktree onto `f21da25`. AHDGame `e364c0495` runs `corporationTurn` (index 5) before `macroCountryTurn` (index 17) in `src/simulation/phases/turnPhaseNames.ts`. The corporation phase writes `corpRevenueSnapshots`; macro reads that snapshot as `sectorSignal`. Native previously ran macro near the head and corporation after central-bank, so turn 1 macro saw the bootstrap snapshot (`current === previous`).

`corporationTurnPhase` draws no RNG. The move does not add or reorder stream draws: `macroCountryTurn` still takes one inflation shock per country, and `commodityPrices` still takes two jitter draws per commodity independent of GDP. Later numeric state still changes because the intended growth path is different.

Direct corp-write consumer in the moved-over window:

- `macroCountryTurn` reads `corpRevenueSnapshots`. Intended same-turn signal. Source-backed.

No other moved-over phase reads `corp.revenue`, `liquidCapital`, `earningsHistory`, or `corpRevenueSnapshots`. `subsidyBudget` remains a PORT-STUB cost of 0. `contractSettlement` still uses corporationId test hooks and does not debit `liquidCapital`. `tradeGrowth` reads tariff and foreign-corporate tax rates, not corp books. `fiscalBaseGrowth` grows seeded `budget.economicFactors`, not `country.economy.growthRate`.

Source-aligned cascade, not a separate consumer of corp fields:

- `centralBankChairTurn` already ran after macro and now sees current-turn corp-driven `growthRate`. AHDGame keeps central bank at indices 116-121, after both corporation and macro. `inflationRecalc`, `nationalMetrics` (`economic.gdpGrowth`), `economicVitalSigns`, `recordWorldHistory`, and `countryPolitics` remain after both phases and inherit the same intended growth values.

Corporation reads that now precede same-turn writers, matching AHDGame rather than the old Native tail:

- `billLifecycle` can write `taxRates` on enactment. `fiscalBaseGrowth` can step `taxRatePhaseIn`. Corporation now taxes at the pre-bill, pre-phase-in rate this turn. AHDGame places `corporationTurn` at index 5 and `billLifecycle` at index 50, with fiscal processing later. Default no-action worlds typically have no pending phase-in or same-turn tax enactment.

Share-price, unowned-sector growth, economic-model, banking, and history phases still run after corporation and still see this turn's corp writes. Nothing between the new corporation slot and `recomputeSharePrices` mutates `earningsHistory`.

The explicit phase-order assertion in `engine.sim.test.ts` now places
`corporationTurn` before `macroCountryTurn`, matching the documented source
edge. Its single weekly-date/timing test passes; world-hash goldens were not
regenerated. Campaign spend still reaches the tally next turn. Absolute Native
tail placement is otherwise unchanged. Full pipeline parity remains open.

## Party founding accounting

`packages/engine/src/actions/execute.ts` now checks founding eligibility before
shared mutations and lets membership debit the single catalog price of 100k.
Previously the dispatcher debited first and membership checked another 100k,
so players needed twice the advertised funds. The formula and actual successful
charge are unchanged. Public action tests exercise the 100k-200k band, exact
100k boundary and no-charge rejection. [Party evidence](PARTY-MANAGEMENT.md)
records the still-divergent single-founder charter lifecycle.

## Campaign timing

The campaign tick and its existing subsidy/investment producers now precede
vote accumulation; reset follows the tally before timers/resolution. The
relative source edge matches AHDGame `e364c0495`. No moved phase draws RNG,
but changed election outcomes can affect later state-dependent RNG use.
The prior end-of-turn spend in an imported save is retained, not discarded.
[Campaign evidence](CAMPAIGN-ORDER-DEPTH.md) records the final-tick and resume
contracts, the still-missing decaying stock, and existing non-reference NPC
algorithms. Earlier lag statements above describe previous checkpoints.
