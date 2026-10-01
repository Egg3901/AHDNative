# China national tax-law acceptance (#286)

## Current correction, 2026-10-01

#286 is reopened. Game `96831835fb6b28983aa14fe66cb6eae9ecfde84c`
uses `mayRuleByDecree` and `enactSingleplayerDecree` for local same-country
SP head-of-state proposals, signing and applying effects immediately. The prior
Native HoS vote/signing browser path below diverged from that source contract.
Its closure statement is superseded. Source-authored options and bounded career
engine tests remain evidence for their stated scope; corrected real CN SP costs,
effects, replacement and save/resume are pending. A fresh source sample at
`cb66acdf0129616b8a09902727e9b58715c8bacb` leaves these authority paths unchanged.

## Prior bounded delivery evidence

The bounded executable slice contains VAT, enterprise income tax, individual
income tax, social-insurance contributions and customs tariff. Their exact
option identifiers, rate ladders, economic/social axes, political effect directions and legal defaults
come from Game `954f1c21781e6e767455a15eed40f73993d89a8b`; the source paths were
refreshed through `01797b27082b098fdf3929bb498215c94c8dda24`. Budget defaults and
legal defaults are separate source contracts, including their differences.

Every selected law has a public proposal, recorded legislative vote, enactment,
fiscal effect, supported replacement and save/reload test. The proposal costs
10 AP and 5 national influence; source tariff provisions are exempt from the
influence charge. Rejected affordability checks preserve the complete save.
Passed proposals refund their recorded cost once, subject to the source Energy
action cap. The rendered proposal discloses both amounts and eligibility.

The enactment applies one percentage point, corporation revenue records fiscal
receipts at that rate, and the pending rate advances one point on each subsequent turn. Newly enacted
rates never take a second step in the signing turn.
Game runs `treasuryTurn` before `billLifecycle`. Its `billEnactment.ts` then
steps the rate once and immediately recalculates revenue. Native preserves that
first-step result without consuming the new ramp again in the fiscal tail.
Expected enactment revenue comes from independently executing Game's actual
`calculateFederalRevenue` with source-seeded 2019 bases:

| Law | Base | Revenue-stage rate | Revenue |
| --- | ---: | ---: | ---: |
| VAT | 55,440,000,000,000 | 14 | 7,761,600,000,000 |
| Enterprise income | 13,230,000,000,000 | 26 | 3,439,800,000,000 |
| Individual income | 3,780,000,000,000 | 44 | 1,663,200,000,000 |
| Social insurance | 13,860,000,000,000 | 29 | 4,019,400,000,000 |
| Customs tariff | 22,680,000,000,000 | 1 | 226,800,000,000 |

The 83-option independent source fixture also checks every authored CN, IE, JP
and BR political direction, separately from fiscal rate movement.

`cnExecutableSlice.test.ts` verifies both playable CN presets, all five
lifecycles/replacements, source revenue and persisted convergence. The actual
browser journey creates CN/2019/HoS, proposes a tariff through Legislature,
waits for voting/enactment, observes the live budget, saves, reloads and resumes
the signed bill and exact rate. Both 320px/390px checks pass without overflow
or page errors. Four ordinary taxes also have rendered influence-affordability
coverage. A fresh HoS has no automatic influence grant, so the browser uses
the source-exempt tariff through actual player actions.

The remaining 57 CN catalog entries retain their named subsystem/metric
blockers in `catalogUnavailableInventory.ts`; the inventory test checks them.
Game's newer generic `economic_system_reform` provision is outside this bounded
catalog slice and still needs its target, marketization and regime consumers.
#101 and wider country-mechanics issues remain open. Repeal, whole CN law
coverage, current Client interchange and physical-device proof are not claimed.
Full hosted verification passed at exact PR #710 head `50d29f5083f788237a56a58008249efea4349e38`
([run](https://github.com/Egg3901/AHDNative/actions/runs/36865271074)).
Merged as `748f74f24f6277596b0a3f4e1c0154849e4c4090`. The original closure
claim is superseded by the SP decree correction above. #286 and #101 remain open.
