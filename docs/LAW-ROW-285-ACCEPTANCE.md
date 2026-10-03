# Law rows reviewed for #285

Reference pin: AHDGame `6f8b083beffbc79b8c9974b80d93dbd19d6d56a` (the
country law files and generic policy project/effect files below are byte
identical to source pin `96831835fb6b28983aa14fe66cb6eae9ecfde84c`). The current
source bill-enactment delta in this range only adds analytics capture.

## Released rows

| Law | Source effect | Native producer and continuation |
| --- | --- | --- |
| `ru.economy.stability.primary` | `RU_LAWS`: `economy.stability`, L3 baseline, five authored levels, GDP costs | Same-country 1953 HoS can sponsor the selected level; bill/policy ledger records it, budget delta and ordinary policy-effect phase consume it, and save/reload preserves the ledger and next-turn metric. |
| `dd.economy.workerSecurity.primary` | `DD_LAWS`: `economy.workerSecurity`, both national/regional scope, L3 baseline, five levels and source reform title | Public HOS action witnesses national and actual-region scope; regional ledger and ordinary metric destination survive save/reload. |
| `us.defense.diplomacy.primary` | `US_LAWS`: `defense.diplomacy`, L2 baseline and GDP-cost ladder | Source row only targets the scalar metric; no alliance records are authored by the law. Native budget and metric policy consumers handle its authored channels. |
| `us.defense.armedForces.primary` | `US_LAWS`: `defense.armedForces`, L4 baseline and GDP-cost ladder | Source row only targets the scalar metric; it does not directly create units or mutate conflict state. Native budget and metric policy consumers handle its authored channels. |
| `us.environment.conservation.primary` | `US_LAWS`: `environment.conservation`, both scope, L1 baseline and GDP-cost ladder | Native policy ledger, environmental metric destination, and budget delta path consume the authored target and costs. |
| `uk.defense.security.primary` | `UK_LAWS`: `defense.security`, L2 baseline and GDP-cost ladder | Source row only targets the scalar metric; Native budget and metric policy consumers handle it. |
| `us.tax.tariffs` | `US_LAWS`: federal `tariffs`, 0–15%, 0.5-point rate step, zero baseline | Existing sponsor, import-value tariff revenue, budget surplus reconciliation, rate phase-in and save/reload continuation. The current turn books receipts at its in-force rate before advancing the next rate step. This is distinct from unmatched synthetic `us.tariff.primary`. |

Focused tests use real `createWorld`, `executeAction`, `advanceTurn`,
`serializeSave`, and `deserializeSave` seams. They use source HOS creation as
the player authority and make no claim about a chamber-vote career. The
player query and legislation panel expose the source baseline and selector for
authored discrete levels. Both-scope laws expose national or an actual
same-country region; region IDs flow through `sponsorBill`, whose engine
validation and policy-ledger consumer retain the requested scope. Sponsor
eligibility, office, country and action costs remain on the existing gates.

## Still unavailable

The remaining Native hand-authored stubs are:

| Row | Current source finding | Named missing behavior |
| --- | --- | --- |
| `us.economy.mobility.primary` | Source law exists and targets `economy.mobility`, but each funded option uses `incomeCostFraction`. | Native policy-budget rebuild currently prices GDP fractions only; it has no source-equivalent income anchor or transfer/grant settlement for this law. |
| `us.tariff.primary` | No exact law ID exists in the pinned Game catalog. | Keep blocked as `tariff/customs`; use the source-backed `us.tax.tariffs` row for the federal tariff slider. |
| `us.subsidy.industry.primary` | No exact law ID exists in the pinned Game catalog. | Keep blocked as `subsidy/corporation`; no source law contract exists to alias. |
| `us.union.law.primary` | No exact law ID exists in the pinned Game law catalogs. | Keep blocked as `labour/union`; union rules/actions remain their separate source family. |
| `us.electoral.law.primary` | No exact law ID exists in the pinned Game catalog. | Keep blocked as `elections/electoralLaw`; election-law actions are not a source bill row. |
| `us.centralBank.independence.primary` | No exact law ID exists in the pinned Game catalog. | Keep blocked as `centralBank/governance`; central-bank appointment/governance is not a source bill row. |

The unavailable inventory retains 248 rows: 26 tax rows, 209 rows with at
least one named unsupported political-metric target, 7 rows whose metrics are
mapped but whose effect descriptor is not ported, one matched income-cost
law (`us.economy.mobility.primary`), and 5 source-unmatched IDs. Each matched
row records its exact source path, scope, prerequisites, authored targets and blocker in
`catalogUnavailableInventory.ts`. Tax rows with regional scope stay blocked
when their revenue base or option-specific metric effect is absent (for
example DE `tradeTax` has no Native state-tax revenue factor; JP
`fixedAssetTax`/`residentTax` are not Native state-tax rate keys; CN
`cn_provincial_resource_tax` additionally has source metric effects beyond its
sales-tax budget leg).

## Focused evidence

- The first `sourceMetricExecutableSlice.test.ts` run was red: both RU/DD catalog rows
  were unavailable and exposed only a dummy metric. After porting exact source
  rows, the targeted source producer/save/turn tests pass 7/7, including regional scope.
- Targeted `catalogUnavailableInventory.test.ts` and `policyLevel.test.ts`
  passed with them; total was 17/17 across those three files.
- `usTariffExecutableSlice.test.ts` verifies phase-in, matched save/reload,
  import-value receipts and budget surplus reconciliation.
- `LegislationDetailsPanel.test.tsx` passed 19/19, including level `l3` and an
  actual same-country region passed through the sponsor action callback.
- `legislationDetails.test.ts` passed 16/16, including actual-region projection
  and national/regional action parameters.
- The generator CLI could not run in this sandbox because its `tsx` IPC socket
  and Node child-process Git revision probe return `EPERM`. The generated
  unavailable inventory was mechanically filtered to match the generator's
  `STUBBED_CATALOG` output, and the inventory parity test verifies every
  remaining unavailable catalog entry exactly once.

This is a source review and executable slice, not full #285/#101 acceptance:
the catalog still has unavailable rows listed above and the full package gate
has not been run. The five unmatched IDs remain synthetic Native stubs, not
aliases: `us.tariff.primary`, `us.subsidy.industry.primary`,
`us.union.law.primary`, `us.electoral.law.primary`, and
`us.centralBank.independence.primary`.
