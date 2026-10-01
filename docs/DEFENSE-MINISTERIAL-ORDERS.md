# Defense ministerial order inventory

Catalog source: AHDGame `e364c04954ed628beef73a993a8e9e156650a31e`.
Current consumer source: `96831835fb6b28983aa14fe66cb6eae9ecfde84c`,
refreshed unchanged at `cb66acdf0129616b8a09902727e9b58715c8bacb`.
Native source catalog: `packages/engine/src/ministerialOrders/catalogData.ts`.

The pinned authored defense-position catalogs contain 12 orders. None targets
the separate AHDGame military appropriation, unit readiness, delivery, refit,
nuclear-production, or combat stores. Native therefore does not substitute a
public-safety metric for a military consequence. It applies the two authored
regional unemployment effects through the existing regional metric store and
keeps the political effects unavailable until the source snapshot and regional
residual consumers exist. Current Game deliberately leaves `governmentApproval`
unmapped as an outcome; this is recorded separately from a missing consumer.
The previous legacy `governmentApprovals`/national metric assumptions are
superseded by the source's `politicalCabinetContribution` orders channel.

| Country | Position | Order | Source effect | Native disposition |
| --- | --- | --- | --- | --- |
| US | `secretary_of_defense` | `national_guard_deployment` | `publicSafety.crimeRate` | Unavailable: political `orders` contribution to `order.safety` |
| US | `secretary_of_defense` | `defense_modernization` | `publicSafety.publicSafetyConfidence` | Unavailable: political `orders` contribution to `order.communityTrust` / `order.safety` |
| UK | `defence_secretary` | `national_defence_review` | `governmentApproval` | Guarded: source outcome `governmentApproval` is deliberately unmapped |
| UK | `defence_secretary` | `veterans_support_programme` | Regional `unemploymentRate` | Live after a valid target resolves to `regionalMetrics.<region>.economic.unemploymentRate` |
| DE | `defense_minister` | `de_national_defence_review` | `governmentApproval` | Guarded: source outcome `governmentApproval` is deliberately unmapped |
| DE | `defense_minister` | `de_veterans_support_programme` | Regional `unemploymentRate` | Live after a valid target resolves to `regionalMetrics.<region>.economic.unemploymentRate` |
| IE | `minister_for_defence` | `ie_defence_forces_review` | `publicSafetyConfidence` | Unavailable: political `orders` contribution to `order.communityTrust` / `order.safety` |
| IE | `minister_for_defence` | `ie_veterans_support_programme` | `governmentApproval` | Guarded: source outcome `governmentApproval` is deliberately unmapped |
| JP | `defense_minister` | `disaster_readiness_drill` | `publicSafetyConfidence` | Unavailable: political `orders` contribution to `order.communityTrust` / `order.safety` |
| JP | `defense_minister` | `defense_white_paper` | `publicTrust` | Unavailable: political `orders` contribution to `governance.integrity` / `governance.participation` |
| CN | `minister_of_defense` | `civil_defense_drill` | `publicSafetyConfidence` | Unavailable: political `orders` contribution to `order.communityTrust` / `order.safety` |
| CN | `minister_of_defense` | `defense_white_paper` | `publicTrust` | Unavailable: political `orders` contribution to `governance.integrity` / `governance.participation` |

Source paths are `src/lib/constants/usCabinetOrders.ts`,
`ukCabinetOrders.ts`, `deCabinetOrders.ts`, `ieCabinetOrders.ts`,
`jpCabinetOrders.ts`, and `cnCabinetOrders.ts`. Turn modifier strength, cap,
aggregation, and lifecycle ordering remain sourced from
`src/lib/turn/ministerialOrderProcessing.ts` and
`src/lib/cabinet/ministerialOrderLifecycle.ts`.

Unavailable defense orders are rejected by the turn consumer without creating
metric rows or stamping `lastAppliedTurn`. Their public inventory entries use
the stable `defenseUnavailable:<orderId>` classification and list every missing
consumer explicitly.


The actual immutable Game `processMinisterialOrders` was executed against its
offline database test boundary. A combined source vector with crime -0.03,
safety confidence +0.03 and public trust +0.02 recorded political contributions
`order.safety` +0.78, `order.communityTrust` +0.42, `governance.integrity` +0.24
and `governance.participation` +0.16, with no macro write for those effects.
Adding government approval +0.03 added no family. A separate Statecraft10 UK
veterans order produced London macro delta -0.059 and regional worker security
contribution +0.944. These are actual source outputs, not Native calculations.

The classified missing consumer is now `politicalCabinetContribution`; the
source deliberately unmapped approval outcome is
`unmappedSourceOutcome:governmentApproval`. The source dynamics also require
regional `cabinetResidualsBySource.orders` with one-turn snapshot consumption.
Native's guard remains until the whole source consequence is supported.
#263 remains open for those consumers and the integrated player paths.
