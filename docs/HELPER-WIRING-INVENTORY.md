# Helper versus wiring inventory

Issue: [#35](https://github.com/Egg3901/AHDNative/issues/35).

Source check: Native `3eb836727f4493eac52add9b249b7a3a1c6f2cdf`, 2026-10-01.
Game spot checks use `88199e778e5a0e73425362023fc9f98189525aa7` for the
sampled action catalog, command-economy surface and country/regional sources.
This is a static reachability inventory, not a numeric or whole-game parity certificate.

Paths in the tables are relative to `packages/engine/src/` unless prefixed
with `src/`. **H** means an implementation exists. **W** means the named
production action, session command, world initializer or registered phase
calls it. **Player** means a rendered flow can supply its input or expose its
result, subject to the stated role/country conditions. A phase caller and a
helper test alone do not establish player reachability. Yes does not certify
all acceptance on the linked issue.

## Required inventory

| Capability | Helper/source path | Production caller and source evidence | H | W | Player | Disposition |
| --- | --- | --- | :-: | :-: | :-: | --- |
| Sector subsidy cost | `budget/subsidyBudget.ts`, `calculateSubsidyCostForCountry` | `budget/phases.ts` `subsidyBudgetPhase` calls it; `phases/registry.ts` registers the phase. `actions/execute.ts` `setSubsidyRate` writes `world.subsidies`. | Yes | Yes | No | Cost consumer delivered in #39. The national action is callable, but `src/game/session.ts` `HOS_ACTIONS` omits it and no rendered subsidy input supplies its parameters. Player flow and wider scope remain #94. |
| TFP basket | `demographics/laborForce.ts`, `tfpBasket` | `phases/macroCountryTurn.ts` calls the basket; `metrics/nationalMetrics.ts` aggregates recorded regional leaves; both phases are registered. `world.ts` initializes `regionalMetrics: {}` and `nationalMetrics: {}`. | Yes | Yes | No | Default worlds lack the six regional input leaves and their progression. Injection/aggregation is not default-world reachability. #40 and #106 remain partial. |
| Ministerial metric effects | `ministerialOrders/phases.ts`, `runMinisterialOrders`; `ministerialOrders/issue.ts`, `issueMinisterialOrder` | Registered `ministerialOrdersPhase` precedes `policyEffectsPhase`. `src/game/session.ts` `issueCabinetOrder` calls the issuer; `src/App.tsx`, `src/ui/GameScreen.tsx` and `src/ui/CabinetOfficePanel.tsx` connect the cabinet control. The initially empty seed is populated by the command. | Yes | Yes | Yes | Holder/executive gates and supported metric orders are reachable. Statecraft, defense and complete downstream/default-region acceptance remain #105/#263. No generic action-catalog entry is required for this session command. |
| Electoral votes from apportioned seats | `electionEngine/resolution/apportionment.ts`, `electoralVotesFromSeats` | `elections/presidentialElectoralCollege.ts` `electoralVotesByState` calls the helper with live seats, era and year; the registered election-resolution path consumes its result. | Yes | Yes | Yes | Players observe the election result. #98 is the implementation reference. DC and ME/NE district entities are still absent from the modeled geography; coverage remains #118/#96. Do not infer those entities from helper math. |
| Referendum outcome variance | `referendum/seededVariance.ts`, `seededVariance` | `referendum/lifecycle.ts` `runReferendumLifecycle` calls it in polling; registered `referendumLifecyclePhase` drives it. `actions/execute.ts` dispatches available `requestReferendum`; `src/game/politics.ts` and `src/ui/PoliticsPanel.tsx` expose the eligible UK request. | Yes | Yes | Yes | #42/#70 are implementation references for the shipped UK request/campaign/lifecycle. The seed helper is reached after eligibility, campaign and polling transitions. Wider country/office coverage remains #72/#118. |
| Poll projections | `actions/polling.ts`, `computePollData`/`commissionPoll` | `actions/execute.ts` commissions `poll`/`pollLarge`, persists the result and returns it through `GameView.polls`; the Actions page reads it. `smoke/polling.spec.ts` is integrated flow evidence. | Yes | Yes | Yes | Delivered slice: #38. This is an action caller and rendered result, not just a helper test. |
| Subsidy-rate player lever | `budget/subsidyBudget.ts`, `enactNationalSubsidy`/`endNationalSubsidy` | Available `ACTION_CATALOG.setSubsidyRate`; `actions/execute.ts` validates HoS mode, national scope and sector, writes the composite-key record, then `subsidyBudgetPhase` charges it next turn. | Yes | Yes | No | Engine action exists. The rendered HoS hub, state scope/strategy coverage and complete reference flow remain #94. Do not label this W=No because the UI is missing. |
| Command-economy directive | `commandEconomy/phases.ts` automatic model; no player directive writer | `actions/catalog.ts` marks `commandEconomyDirective` unavailable; `actions/execute.ts` rejects before dispatch. The automatic phase uses ruling-party stance and default credit settings. | Partial | No | No | #94. Current Game has player plan quotas and credit controls; the existing automatic Native model does not supply that flow. |
| Unknown/unhandled action ID | No helper; `actions/execute.ts` fallback | Dispatch returns `ok: false` with `No effect for` an unhandled ID. | No | No | No | Explicitly inapplicable as a capability: a defensive dispatch failure. Every new action still needs a production branch. |

## Additional named stubs and adjacent cuts

Each row has the same source/caller/player/disposition columns. Former stub
comments are identified separately from still-missing behavior.

| Capability or marker | Helper/source path | Production caller or blocker | H | W | Player | Disposition |
| --- | --- | --- | :-: | :-: | :-: | --- |
| Foreign-currency/corporate bond issuance | `actions/catalog.ts` issuance comments; no issuance dispatch | `buyBond`/`sellBond` settle existing sovereign float. The comments do not create an unavailable issuance row or command. | Partial | No | No | #110, with market surfaces #77. |
| `investInfluence` | `actions/catalog.ts`; `party/partyInfluence.ts` passive model | Catalog unavailable; `actions/execute.ts` rejects before dispatch. Passive party-influence processing is a different caller. | Partial | No | No | Explicitly inapplicable as the proposed AP exchange: sampled Game `src/lib/actions.ts` has no such action. Party-influence parity stays #95. |
| Candidacy eligibility | `elections/candidacy.ts`, `declareCandidacy` | `actions/execute.ts` declares/withdraws candidacy; catalog has zero filing fee. | Yes | Yes | Yes | #99 is the eligibility implementation reference. Country/era coverage remains #96/#118. A zero reference fee is not an unwired cost helper. |
| Party leadership tenure/cooldown | `intraparty/leadershipTenure.ts`; leadership branches in `actions/execute.ts` | Party contest/vote/committee actions enforce tenure and membership/region/method gates; parliamentary holder actions remain unavailable. | Yes | Yes | Yes | #102 is the supported-party implementation reference; broader organization lifecycle remains #95. |
| Regional extraction/issuer authority | `extraction/prospecting.ts` and extraction branches in `actions/execute.ts` | National HoS prospect/contract actions and resolution phase are wired; no regional issuer command supplies equivalent state. | Yes | Partial | Yes | National flow exists; regional scope remains #115. |
| Cross-border wires | `finance/wireTransfer.ts`, `wireTransfer` | Available action dispatches the currency-wallet path. `src/game/session.ts` projects currency choices; `src/ui/FinancePanel.tsx` sends the selected currency. Foreign-exchange-off mode refuses cross-border transfers. | Yes | Yes | Yes | Prefunded applicable currency balances and feature conditions are required. Full settlement/finance acceptance remains #111/#76. The old claim that no per-character wallets exist is obsolete. |
| Extra inflation drivers | `phases/macroCountryTurn.ts`, `computeInflation` | Fiscal/monetary terms are live; tariff, wage, commodity, FX, savings, housing, policy and money-supply inputs are neutral zero. | Partial | Partial | No | #106. The remaining zero inputs are not wired by calling the aggregate function. |
| Ministerial defense consumers | `ministerialOrders/catalog.ts`, `unavailableDefenseOrderEffects`; `ministerialOrders/phases.ts` | Issuer/phase rejects unsupported defense consumers. No unit-level combat/intelligence/navair implementation is registered. | No | No | No | #263/#41. Missing Native substrate is a parity dependency, not an inapplicable Game feature. |
| Ministerial regional effects/statecraft | `ministerialOrders/issue.ts`; `ministerialOrders/phases.ts` | Issuer validates a recorded regional target; phase accumulates and writes regional metrics. Source statecraft multiplier remains absent. | Partial | Partial | Yes | Regional writes are live. Default input coverage and source magnitude/downstream behavior remain #105/#263. |
| Referendum Layer-1 cohort fallback | `referendum/cohortProfiles.ts`; `referendum/lifecycle.ts` | Shipped UK profiles supply cohorts; content without one uses the source `_all` fallback. | Yes | Yes | Yes | Explicitly applicable fallback, not an unwired helper. #42 is the implementation reference; country coverage stays #118. |
| Referendum consent/actuation | `referendum/consent.ts`; `referendum/actuation.ts` | `runReferendumLifecycle` opens consent bills, waits for signed/failed consent and applies completion/cancellation. | Yes | Yes | Yes | #42/#70 are implementation references. Completion is bill-gated; the engine does not park all passed votes forever. This inventory adds no new end-to-end certificate. |
| Player war/peace verbs | `actions/catalog.ts`, `declareWar`/`offerPeace`/`acceptPeace`; `wars/settlement.ts` | Named blockers refuse new player war/peace actions; existing conflicts still use `gdpMargin`. | Partial | No | No | #41. The occupation ramp is live, but unit combat, logistics, intelligence and naval/air flows remain required. |
| Unavailable authored law row | `actions/execute.ts` legislative dispatch; `legislation/catalog.ts` | An unavailable catalog row returns its named blocker before sponsorship/execution. | Partial | No | No | #101 and its country slices #283-#287. Availability refusal is a guard, not completed enactment. |
| Party member seed reconciliation | `world.ts` member-count initialization | `createWorld` counts generated Native politicians; there is no second Native NPP membership collection to call. | Yes | Yes | No | Explicitly inapplicable to a second-collection caller in this representation. Full party accounting/lifecycle remains #95. |
| UK historical party lean | `world.ts` historical region-lean marker | UK initialization calls the local coarse defaults. | Partial | Yes | No | Outside helper reachability: authored-content fidelity remains #118/#28. A called fallback is not source-data parity. |
| UK minor-party defaults | `world.ts` minor-party organization/registration marker | UK initialization returns the local coarse defaults. | Partial | Yes | No | Outside helper reachability: #118/#28. |
| Former random-walk/labor stub notes | `phases/macroCountryTurn.ts` replaced-stub comments | Registered macro now reads the corporation revenue snapshot and calls `computeLaborForce`. | Yes | Yes | No | Explicitly inapplicable as dormant helpers: the comments describe removed baselines. Remaining macro inputs/effects are #106. |
| Catalog's generic unavailable convention | `actions/catalog.ts` file header | Recognized unavailable actions fail before dispatch. | Yes | Yes | No | Explicitly inapplicable as a separate missing capability; each concrete blocked action has its row above. |

## Reproduction and interpretation

Read the source at the pinned Native revision, then search the exact named
functions in `actions/execute.ts`, `phases/registry.ts`, `world.ts`, session
and UI files. Inspect `actions/catalog.ts`, `actions/execute.ts`, `world.ts`,
`budget/phases.ts`, `budget/subsidyBudget.ts`, `phases/macroCountryTurn.ts`,
`ministerialOrders/phases.ts`, `referendum/lifecycle.ts` and
`elections/presidentialElectoralCollege.ts` for adjacent `PORT-STUB` markers.
A removed historical stub is not a current missing helper.

A table update needs a production caller for W, and a rendered route with
its role/country inputs for Player. Numeric equivalence and saved downstream
consequences require separate source-backed behavioral evidence. No
helper-only test, synthetic role fixture or Native replay closes a linked
feature gap. This inventory task requires accurate rows and dispositions,
not implementation of every child.
