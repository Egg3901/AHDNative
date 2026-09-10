# Engine adaptations after import

The source manifest retains hashes from AHDClient `568c0c039efcca2db17c52b2920747ff05fbd794`. It records the imported baseline, not a claim that the current engine is unchanged. Intentional changes follow here, with reference pins and validation.

| Files | Change | Evidence and limits |
|---|---|---|
| `packages/engine/src/index.ts` | Export existing action refresh constants and read-only membership eligibility to display queries | No formula change; resource/session tests use real action behavior |
| `packages/engine/src/referendum/{seededVariance,lifecycle,phases}.ts` | Match AHDGame per-record FNV variance; remove divergent shared RNG draw | [Referendum evidence](REFERENDUM-PARITY.md). RNG shifts downstream in worlds with polling referendums. Full lifecycle remains incomplete |
| `packages/engine/src/referendum/lifecycle.test.ts` | Move the short referendum suite from the `.sim.test.ts` exclusion into routine CI and add reference vectors/public replay cases | 14 short tests; no long simulation generator |
| `packages/engine/src/demographics/laborForce.ts`, `packages/engine/src/phases/macroCountryTurn.ts` | Reference TFP basket and exact prior-turn national metric inputs with fallback | [Growth evidence](GROWTH-PARITY.md). No full state-metric or phase-order parity claim |

| `packages/engine/src/referendum/{cohort,lifecycle,types}.ts` | Campaign window, baseline/poll snapshot, canonical cohort/spend calculation before resolution | [Lifecycle evidence](REFERENDUM-LIFECYCLE.md). Exact source math and source fallback for absent substrate; request/grant, granular electorate, consent and actuation remain open |

AHDGame reference for the mechanics corrections: `e364c04954ed628beef73a993a8e9e156650a31e`. Expected vectors come from those source formulas, independently calculated. New targeted tests live alongside each changed system. The historical 21-world replay evidence predates these corrections; it must not be represented as fresh whole-engine parity with current AHDGame.
