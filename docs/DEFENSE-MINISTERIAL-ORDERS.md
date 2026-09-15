# Defense ministerial order inventory

Pinned source: AHDGame `e364c04954ed628beef73a993a8e9e156650a31e`.
Native source catalog: `packages/engine/src/ministerialOrders/catalogData.ts`.

The pinned authored defense-position catalogs contain 12 orders. None targets
the separate AHDGame military appropriation, unit readiness, delivery, refit,
nuclear-production, or combat stores. Native therefore does not substitute a
public-safety metric for a military consequence. It applies the two authored
regional unemployment effects through the existing regional metric store and
keeps every national effect unavailable until its exact consumer exists.

| Country | Position | Order | Source effect | Native disposition |
| --- | --- | --- | --- | --- |
| US | `secretary_of_defense` | `national_guard_deployment` | `publicSafety.crimeRate` | Unavailable: `nationalMetrics.publicSafety.crimeRate` is absent |
| US | `secretary_of_defense` | `defense_modernization` | `publicSafety.publicSafetyConfidence` | Unavailable: `nationalMetrics.publicSafety.publicSafetyConfidence` is absent |
| UK | `defence_secretary` | `national_defence_review` | `governmentApproval` | Unavailable: `governmentApprovals` is absent |
| UK | `defence_secretary` | `veterans_support_programme` | Regional `unemploymentRate` | Live after a valid target resolves to `regionalMetrics.<region>.economic.unemploymentRate` |
| DE | `defense_minister` | `de_national_defence_review` | `governmentApproval` | Unavailable: `governmentApprovals` is absent |
| DE | `defense_minister` | `de_veterans_support_programme` | Regional `unemploymentRate` | Live after a valid target resolves to `regionalMetrics.<region>.economic.unemploymentRate` |
| IE | `minister_for_defence` | `ie_defence_forces_review` | `publicSafetyConfidence` | Unavailable: `nationalMetrics.publicSafetyConfidence` is absent |
| IE | `minister_for_defence` | `ie_veterans_support_programme` | `governmentApproval` | Unavailable: `governmentApprovals` is absent |
| JP | `defense_minister` | `disaster_readiness_drill` | `publicSafetyConfidence` | Unavailable: `nationalMetrics.publicSafetyConfidence` is absent |
| JP | `defense_minister` | `defense_white_paper` | `publicTrust` | Unavailable: `nationalMetrics.publicTrust` is absent |
| CN | `minister_of_defense` | `civil_defense_drill` | `publicSafetyConfidence` | Unavailable: `nationalMetrics.publicSafetyConfidence` is absent |
| CN | `minister_of_defense` | `defense_white_paper` | `publicTrust` | Unavailable: `nationalMetrics.publicTrust` is absent |

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
