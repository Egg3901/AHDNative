# Helper versus wiring inventory

Issue: [#35](https://github.com/Egg3901/AHDNative/issues/35)

This inventory is fixed to Native `eb72daab63201f76674ed54dab4ff83404b9cee9`
and AHDGame `d4baf899fd8bd529099f03d7410807143604e2e5`. It distinguishes
code that can calculate a result from code that a real world turn or player
action can reach.

- **H** means the helper or downstream implementation exists.
- **W** means a named production caller reaches it through `executeAction`,
  `TURN_PHASES`, or `createWorld` state.
- **Player** means a normal player flow can supply the input and observe the
  result. An automatic phase alone is not player reachability.

## Required inventory

| Capability | Helper path | Wired caller and evidence | H | W | Player | Disposition |
| --- | --- | --- | :-: | :-: | :-: | --- |
| Sector subsidy cost | `packages/engine/src/budget/subsidyBudget.ts` `calculateSubsidyCostForCountry` | `subsidyBudgetPhase` calls it, and [`TURN_PHASES`](../packages/engine/src/phases/registry.ts) contains `subsidyBudgetPhase`. | Yes | Yes | No | The former `cost = 0` defect is fixed and [#39](https://github.com/Egg3901/AHDNative/issues/39) is closed. No player action creates or changes `world.subsidies`; that distinct gap is [#94](https://github.com/Egg3901/AHDNative/issues/94). |
| TFP basket | `packages/engine/src/demographics/laborForce.ts` `tfpBasket` | `macroCountryTurnPhase` calls `tfpBasket(tfpInputsFromNationalMetrics(...))`, and `TURN_PHASES` contains the phase. | Yes | Yes | No | Default worlds do not seed or derive all six exact metric paths, so the reference fallback dominates. Tracked by [#40](https://github.com/Egg3901/AHDNative/issues/40). |
| Ministerial metric effects | `packages/engine/src/ministerialOrders/phases.ts` `runMinisterialOrders` | `ministerialOrdersPhase` calls it, and `TURN_PHASES` contains the phase before `policyEffectsPhase`. `createWorld` seeds `ministerialOrders: []`. | Yes | Yes | No | No action or AI issues an order. Issuance, eligibility, expiry, regional effects, and source lifecycle are [#105](https://github.com/Egg3901/AHDNative/issues/105). |
| Electoral votes from apportioned seats | `packages/engine/src/electionEngine/resolution/apportionment.ts` `electoralVotesFromSeats` | No caller imports the helper. Live presidential resolution calls `electoralVotesByState` in `presidentialElectoralCollege.ts`, which directly uses `houseSeats + 2`. | Yes | No | Yes | Players observe the separate live formula. The dormant helper is inapplicable to modeled 1953 states because the direct formula is equivalent there. DC and Maine/Nebraska era rules lack Native entities and remain under [#98](https://github.com/Egg3901/AHDNative/issues/98). Do not claim the helper itself is wired. |
| Referendum outcome variance | `packages/engine/src/referendum/seededVariance.ts` `seededVariance` | `runReferendumLifecycle` calls it for polling records, and `TURN_PHASES` contains `referendumLifecyclePhase`. | Yes | Yes | No | Fixtures can reach it, but no player request creates a granted record. Request and final actuation are [#42](https://github.com/Egg3901/AHDNative/issues/42). |
| Poll projections | `packages/engine/src/electionEngine/resolution/buildPollingData.ts` `buildPollingData` | No `executeAction` case. `ACTION_CATALOG.poll` and `pollLarge` are `unavailable` with blocker `polling/election polling`. | Yes | No | No | Payload creation, cost, persistence, and UI result flow are [#38](https://github.com/Egg3901/AHDNative/issues/38). |
| Subsidy-rate player lever | Subsidy records are consumed by `calculateSubsidyCostForCountry`; no writer helper is exposed. | `ACTION_CATALOG.setSubsidyRate` is `unavailable`; execution stops before dispatch. | Partial | No | No | Player-authored subsidy enactment is [#94](https://github.com/Egg3901/AHDNative/issues/94). |
| Command-economy directive | `packages/engine/src/commandEconomy/phases.ts` contains the automatic model. | `ACTION_CATALOG.commandEconomyDirective` is `unavailable`; execution stops before dispatch. | Partial | No | No | Player directive state and mutation are [#94](https://github.com/Egg3901/AHDNative/issues/94). |
| Unknown or unhandled action ID | No helper. | `executeAction` returns `No effect for ${actionId}` after recognized actions fail to dispatch. | No | No | No | Explicitly inapplicable: this is a defensive exhaustiveness failure, not a capability. A new catalog action is incomplete until it has a tested dispatch branch. |

## Other named PORT-STUBs in the inspected files

These rows prevent adjacent comments from being mistaken for wired behavior.

| Stub | Current production path | Player | Disposition |
| --- | --- | :-: | --- |
| Foreign-currency sovereign and corporate bond issuance | Buy and sell actions are live, but no issuance action calls the blocked paths named beside the bond catalog entries. | No | [#110](https://github.com/Egg3901/AHDNative/issues/110), with broader FX surfaces in [#77](https://github.com/Egg3901/AHDNative/issues/77). |
| `investInfluence` | Catalog entry is deliberately `unavailable`; passive `partyInfluenceTurn` is the reference-supported caller. | No | Explicitly inapplicable: AHDGame has no action exchanging party influence for AP. Retain the rejection for legacy callers. |
| Candidacy eligibility | `declareCandidacy` is available with `fundCost: 0`; AHDGame also charges no filing fee. Native lacks several reference eligibility inputs. | Yes | Reachable but incomplete. Tracked by [#99](https://github.com/Egg3901/AHDNative/issues/99). |
| Leadership tenure and entry cooldown | Party leadership contest/vote and committee actions enforce the 24-turn tenure, founding/founder, state-residency, status, and committee-method gates; rejected attempts refund accounting. | Yes | Complete for Native's supported party-leadership surface. Congressional chamber leadership remains explicitly unavailable because Native has no elected-official holder model. |
| Regional extraction and issuer authority | National Head-of-State prospect and contract actions are live; regional/state issuer paths are absent. | Yes | National path is reachable; regional scope is [#115](https://github.com/Egg3901/AHDNative/issues/115). |
| Cross-border wires | Same-country `wireTransfer` is live. Cross-border settlement lacks per-character currency wallets. | Yes | Same-country path is reachable; cross-border scope is [#111](https://github.com/Egg3901/AHDNative/issues/111). |
| Inflation tariff, wage, commodity, FX, savings, housing, policy, and money-supply drivers | `computeInflation` supplies neutral zero values; only demand, fiscal, and monetary terms are live. | No | [#106](https://github.com/Egg3901/AHDNative/issues/106). |
| Ministerial defense sub-pipeline | Metric orders run. Unit combat, deliveries, refit, and related defense processing have no Native substrate. | No | Explicitly inapplicable to the current engine boundary; Native has no unit-level military model. Any future expansion belongs under parent parity tracker [#28](https://github.com/Egg3901/AHDNative/issues/28), not #105's metric-order lifecycle. |
| Ministerial regional effects and statecraft multiplier | The phase skips regional effects and no issuance path applies the minister's statecraft multiplier. | No | [#105](https://github.com/Egg3901/AHDNative/issues/105). |
| Referendum Layer-1 cohorts | Lifecycle uses AHDGame's `_all` fallback because Native has no Layer-1 bucket substrate. | No | Explicitly applicable fallback, not an unwired helper. Full cohort substrate remains part of [#42](https://github.com/Egg3901/AHDNative/issues/42). |
| Referendum actuation | Passed votes park in `actuating`; no consent-bill or territory-transfer engine completes them. | No | [#42](https://github.com/Egg3901/AHDNative/issues/42). |
| Party member seed reconciliation | `createWorld` counts generated Native politicians. The comment notes that AHDGame also counts NPP documents, which Native does not model separately. | Yes | Explicitly inapplicable: Native politicians are the local NPP representation, so there is no second collection to wire. |
| UK historical party-region lean and minor-party defaults | `createWorld` calls the local seed function; the values are intentionally coarse content fallbacks, not dormant helpers. | Yes | Explicitly outside helper reachability. Content fidelity remains under parent parity tracker [#28](https://github.com/Egg3901/AHDNative/issues/28). |

## Verification rules

A future row may move to W=Yes only with all three forms of evidence:

1. The production caller is named and linked in this table.
2. A public `createWorld` plus `executeAction` or `advanceTurn` test observes
   the mutation. A helper-only unit test is insufficient.
3. The input exists in an ordinary world or is created by an available player
   action. A fixture-only seed does not make a feature player-reachable.

The authoritative AHDGame samples for this audit are
`src/lib/actions.ts`, `src/lib/actions/commands/executeAction.ts`,
`src/lib/turn/subsidyBudgetTurn.ts`, `src/lib/metricEngine/phase.ts`,
`src/lib/turn/ministerialOrderProcessing.ts`,
`src/lib/elections/apportionment.ts`, and
`src/lib/referendum/processReferendumLifecycle.ts` at the revision above.
No unsampled API route is inferred from a pure helper.
