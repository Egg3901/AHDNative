# Law rows reviewed for #285

Reference pin: AHDGame `6f8b083beffbc79b8c9974b80d93dbd19d6d56a6` (the
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
| `ie_corporate_tax_rate` | IE's statutory domestic-corporate tax: 11 authored rates (0–33%), source effect targets map through `ADAPTER_TIER1`, and the baseline rate is 12.5%. | Public IE HoS sponsor moves 12.5%→13.5% in the source one-point enactment step; the source/native domestic profit base is the same 75% of the authored 22%-of-GDP total corporate base, receipts are recomputed at the in-force rate, replacement at 15% replaces the first posture, repeal ramps back toward 12.5%, and save/reload/ordinary turns preserve each state. This qualifies only this receipt line, not full IE budget parity. |
| `de_government_ethics` | DE ethics seed: governance transparency, trust, and turnout targets; seven source policy options, no budget-cost model | Source-authored 7-option national law, public HOS sponsor, policy ledger, national metric-decay consumer, save/reload and ordinary-turn continuation. |
| `ie_electoral_reform` | IE ethics/electoral seed: turnout, civic participation, public trust, and transparency targets; seven source options, no budget-cost model | Source-authored 7-option national law, public HOS sponsor, policy ledger, national metric-decay consumer, save/reload and ordinary-turn continuation. |
| `ie_gender_equality` | IE equality seed: equality, mobility, civic participation, and cohesion targets; seven source options, no budget-cost model | Source-authored 7-option national law, public HOS sponsor, policy ledger, national metric-decay consumer, save/reload and ordinary-turn continuation. |
| `ie_government_ethics` | IE ethics seed: transparency, trust, and civic participation targets; seven source options, no budget-cost model | Source-authored 7-option national law, public HOS sponsor, policy ledger, national metric-decay consumer, save/reload and ordinary-turn continuation. |

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

The unavailable inventory retains 238 matched rows plus 5 source-unmatched IDs (243 total): 25 tax rows, 209 rows with at
least one named unsupported political-metric target, 3 JP rows whose authored
metrics and per-capita prices are now retained but cannot be reached by a player
because Native marks JP economy-only/nonplayable and does not seed JP regions into
player worlds, one matched income-cost law (`us.economy.mobility.primary`), and 5 source-unmatched IDs. Each matched
row records its exact source path, scope, prerequisites, authored targets and blocker in
`catalogUnavailableInventory.ts`. Tax rows with regional scope stay blocked
when their revenue base or option-specific metric effect is absent (for
example DE `tradeTax` has no Native state-tax revenue factor; JP
`fixedAssetTax`/`residentTax` are not Native state-tax rate keys; CN
`cn_provincial_resource_tax` additionally has source metric effects beyond its
sales-tax budget leg).

### Tax-row source and consumer audit

The exact 26-row starting inventory is reconciled here; `ie_corporate_tax_rate`
is the one released row above. In every remaining row, the named metric or tax
base gap is why the source ladder stays unavailable. `calculateBudgetRevenue`
only consumes Native's current federal keys (`incomeTax`, `domesticCorporateTax`,
`foreignCorporateTax`, `payrollTax`, `tariffs`, `salesTax`); `applyStateTaxToRegionalRevenue`
is limited to its existing state keys. A matching rate name alone is not a
complete source tax implementation.

| Remaining source row | Required source behavior still absent |
| --- | --- |
| `br_corporate_tax` | Domestic-corporate receipt key exists; source `economic.economicFreedom` and `economic.smallBusinessFormation` targets are not produced. |
| `br_ivc` | Sales-tax receipt key exists; source `economic.costOfLiving` target is not produced. |
| `br_iap_contribution` | Payroll receipt key exists; source `economic.economicFreedom` target is not produced. |
| `br_customs_tariff` | Tariff receipt key exists; source `economic.tradeBalance` and `economic.costOfLiving` targets are not produced. |
| `cn_land_value_added_tax` | Source LVAT base/rate is absent from Native federal revenue; targets `social.housingAffordability`, `social.incomeInequality`, and `social.wohnungsBauRate` are not produced. |
| `cn_urban_maintenance_construction_tax` | Source surcharge-on-VAT receipt is absent; targets `infrastructure.transportEfficiency`, `economic.costOfLiving`, and `economic.ruralRevitalization` are not produced. |
| `cn_stamp_duty` | Source transactions-proxy base/receipt is absent; targets `economic.smallBusinessFormation` and `social.incomeInequality` are not produced. |
| `cn_provincial_resource_tax` | Source is a regional natural-resource tax, not Native's generic regional sales-tax base; `environment.carbonEmissions`, `economic.ruralRevitalization`, and `economic.manufacturingCompetitiveness` are not produced. |
| `de_trade_tax` | Source is municipal trade/assessment tax; Native has no regional trade-tax receipt factor, and `economic.mittelstandHealth`/`economic.smallBusinessFormation` are not produced. |
| `ie_foreign_corporate_tax_rate` | Foreign-corporate receipt key exists; `economic.tradeBalance`, `fdiPipelineStrength`, and `mncDependency` targets are not produced. |
| `ie_income_tax_rate` | Income receipt key exists; `economic.medianIncome` and `economic.povertyRate` targets are not produced (income inequality maps to Native social mobility). |
| `ie_usc` | Source universal-social-charge receipt key is absent; `economic.medianIncome` and `economic.povertyRate` targets are not produced. |
| `ie_prsi` | Payroll receipt key exists; `economic.medianIncome` target is not produced (other targets have consumers). |
| `ie_customs_tariff_rate` | Tariff receipt key exists; `tradeBalance`, cost-of-living, manufacturing-competitiveness, FDI, and MNC targets are not produced. |
| `ie_local_property_tax` | Source is national/federal scope; Native property tax is regional only, and housing-affordability, vacant-property, and homelessness targets are not produced. |
| `ie_stamp_duty` | Source stamp-duty receipt key is absent; small-business, housing-affordability, vacant-property, and rental-pressure targets are not produced. |
| `ie_capital_gains_tax` | Source capital-gains base/receipt key is absent; source small-business and FDI targets are not produced. |
| `ie_excise_duty` | Source excise base/receipt key is absent; carbon/agri-emissions and cost-of-living targets are not produced. |
| `jp_income_tax_rate` | Income receipt key exists; source median-income, poverty, and GDP-growth targets are not produced for JP in Native player worlds. |
| `jp_domestic_corporation_tax` | Domestic receipt key exists; source small-business-formation and unemployment targets are not produced for JP in Native player worlds. |
| `jp_foreign_corporation_tax` | Foreign receipt key exists; source small-business-formation and cost-of-living targets are not produced for JP in Native player worlds. |
| `jp_social_insurance` | Payroll receipt key exists; source elder-care and mental-health targets are not produced for JP in Native player worlds. |
| `jp_customs_tariff` | Tariff receipt key exists; source food-security and small-business-formation targets are not produced for JP in Native player worlds. |
| `jp_resident_tax` | Source regional resident-income-tax basis is not a Native regional tax key; source education/public-safety targets and JP player eligibility are absent. |
| `jp_fixed_asset_tax` | Source regional property-value basis is not a Native regional tax key; source cost-of-living/business-formation targets and JP player eligibility are absent. |

For IE corporate tax, the narrower domestic-receipt vector is independently
checked against the source's authored 75/25 corporate-base split, one-point
`advanceTaxRatePhaseIn`, and `calculateFederalRevenue` at identical budget inputs
(private source oracle under `/root/misc/archive/2026-10-03-ahdnative-law285-tax-oracle`).
The unrelated IE extra receipt lines remain missing: Native's baseline total
revenue is not claimed to match the source total, and issue #101's wider fiscal
substrate work remains separate.

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
- The four DE/IE metric-only rows were emitted by `generateCatalogs.ts` from
  the clean pinned Game source checkout at `96831835fb6b28983aa14fe66cb6eae9ecfde84c`.
  The source option ladder, target weights, descriptions, and level directions
  remain generator-derived. Focused generator/catalog tests passed 14/14.

- The DE/IE decay consumer is independently replayed against pinned Game
  `policyEffects.ts:calculateMetricTarget` and
  `shared/constants/formulas.ts:applyPolicyDecay` using each exact source option
  `*_opt_2`, its authored weighted target, baseline 50, national decay scope
  0.21, turn 1, and year 2019. Source targets for the primary target are 51.0464
  for DE ethics, IE equality, and IE ethics, and 50.6278 for IE electoral
  reform; after one source decay step the Native public ordinary-turn values are
  50.008, 50.008, 50.008, and 50.005 respectively. The independent source
  vectors and command are retained under the dated private
  `ahdnative-law285-metric-oracle` archive. This verifies the existing
  `effectTargetsWeighted`/decay path, not unmodeled direct `metricEffects` tick
  tables.
- For DD worker security, the pinned Game 968 generated political runtime's
  `lawTargets` uses the actual level-3 baseline and all other authored DD law
  baselines: the `economy.workerSecurity` target is 45.5. Selecting level 4
  produces 58, a source delta of 12.5. The focused source test checks these
  values from that runtime separately from the public Native bill/save journey;
  the metric-only DE/IE rows use the separate legacy `calculateMetricTarget`
  decay consumer above.
- The JP regional cost fixture uses the actual authored Hokkaido 2019 seed and
  only charges while a matching active regional policy-ledger row exists. This
  matches the source regional-budget cost basis (annual option cost times the
  real region population); no row or a repeal tombstone contributes zero. Game's
  JP-specific regional processor is separate from its UK-only generic regional
  budget processor. Native has no player-selectable JP world or JP regions, so
  this is consumer evidence, not a reachable JP public sponsor flow. The source
  JP region/world writer and Native playability/region seeding remain
  prerequisites before these rows can be released to players.

This is a source review and executable slice, not full #285/#101 acceptance:
the catalog still has unavailable rows listed above and the full package gate
has not been run. The five unmatched IDs remain synthetic Native stubs, not
aliases: `us.tariff.primary`, `us.subsidy.industry.primary`,
`us.union.law.primary`, `us.electoral.law.primary`, and
`us.centralBank.independence.primary`.
