# Phase order depth

Date: 2026-09-11

This document compares Native `eb72daab63201f76674ed54dab4ff83404b9cee9`
with AHDGame `d4baf899fd8bd529099f03d7410807143604e2e5`. It records the full
phase map. It does not reorder the whole pipeline or claim that Native engine
goldens establish AHDGame parity.

## Current bounded dependency checkpoint, 2026-10-01

Checked against Native `3eb8367` production callers. The full map below
retains its pinned Game comparison and historical audit scope; it is not a
fresh whole-engine trace at current Game. Current differential evidence stays
under #117/#281.

- Registry order is `corporationTurnPhase`, `unionsTurnPhase`,
  `nppUnionBehaviorPhase`, `pensionTurnPhase`, `macroCountryTurnPhase`.
  Macro consumes the same-turn corporate revenue snapshot; the phases between
  those two do not turn it into a prior-turn snapshot.
- The campaign cluster precedes `voteAccumulationPhase`, with
  `campaignSpendResetPhase` after the tally. No phase changes in this audit.
- `bankingTurnPhase` services interbank and margin; adjacent
  `discountWindowTurnPhase` services the window. Bond/credit and share-price
  writers precede `bankSolvencyTurnPhase`. #109 retains player and downstream
  acceptance; [banking evidence](BANKING-LIFECYCLE.md) records the partial batch.
- Ministerial issuance is wired through the cabinet session/UI command and
  registered apply phase, before policy effects. #105/#263 retain magnitude,
  defense and full downstream/default-region scope.
- Referendum request, hash variance, consent and actuation have production
  callers. The earlier missing-call claims are historical; office/country
  coverage remains #72/#118. See [helper inventory](HELPER-WIRING-INVENTORY.md).

## Corrected dependency

AHDGame executes `corporationTurn` before `macroCountryTurn` in
`src/simulation/phases/turnPhaseRegistry.ts`. The corporation phase updates
the per-country revenue snapshot, and the macro phase uses that snapshot as its
realized growth signal.

Native previously ran `macroCountryTurnPhase` near the start of the registry
and `corporationTurnPhase` near the tail. On the first advance, macro therefore
read the bootstrap snapshot where `current` equaled `previous`; corporate
output reached macro growth on the following turn.

The original move placed `corporationTurnPhase` immediately before
`macroCountryTurnPhase`. The later union/pension insertion preserves the
same-turn snapshot edge in the current order shown above.
`corporationTurnPhase` does not accept or call the shared RNG. The move itself
does not consume or shift the RNG stream. Later state-dependent phases can of
course observe the intended current-turn economy values.

The public `advanceTurn` observation for seed `phase-order-depth` now records
the corporation snapshot before macro reads it:

```text
corporationTurn, turn 1: current 8554944062.5, previous 8546250000
macroCountryTurn, turn 1: current 8554944062.5, previous 8546250000
US growth after macro: 0.0488
US output gap after macro: 0.077
```

The numeric values are fixture evidence for that seed. The contract is the
same-turn ordering and the snapshot relationship, not a balance target.

## Focused contract tests

`packages/engine/src/phaseOrderDepth.test.ts` uses only the public world
creation, `advanceTurn`, and save APIs. It proves that current corporate
revenue is visible at the macro phase and that advancing a live world after a
serialize/deserialize round trip produces byte-identical state. The test was
red before the registry move because macro observed the bootstrap snapshot.

Focused commands:

```text
npx vitest run --config packages/engine/vitest.config.ts src/phaseOrderDepth.test.ts
npm run typecheck --workspace @ahdclient/engine
git diff --check
```

## Classification

### Current dependency summary

| Area | AHDGame order at `e364c0495` | Native status after this slice |
|---|---|---|
| Corporation and macro economy | `corporationTurn` precedes `macroCountryTurn` | Direct revenue snapshot edge aligned. Absolute placement still differs because Native retains its append-only tail strategy for other systems. |
| Macro, commodity, and fiscal growth | Macro runs before commodity pricing; fiscal growth consumes settled economic factors in its documented slot | Native macro now sees corporate output first. Trade and fiscal phases remain in their existing bounded order. |
| Campaign and election tally | `campaignTurn` precedes `voteAccumulation`; `campaignSpendReset` follows vote accumulation | Aligned by the M04 move: the campaign cluster precedes `voteAccumulation` with the reset after, same turn (see [campaign order](CAMPAIGN-ORDER-DEPTH.md)). Absolute tail placement of the block is otherwise retained. |
| Election timers and resolution | Vote accumulation, spend reset, timers, snapshots, and resolution have a strict sequence | Native retains its existing relative election sequence, with no broad reordering in this slice. |

### Map terms

- **same-edge**: a Native phase owns the behavior and preserves its direct
  producer/consumer edge. Absolute position may still differ.
- **combined-into**: Native deliberately performs the work inside the named
  phase. The dependency was checked in that implementation.
- **missing**: neither a registered phase nor an equivalent production caller
  exists. Each row points to an open issue.
- **inapplicable**: the phase is Native-only, Mongo/server-only, or depends on
  a subsystem that Native intentionally does not model. This is not a parity
  claim about the rest of that subsystem.

## AHDGame base phase map

Every member of AHDGame's `BASE_TURN_PHASE_NAMES` at the pinned SHA appears
once below. Names sharing a disposition are grouped to keep the map readable.

| AHDGame phase name(s), in source order | Native disposition | Native owner and checked dependency |
| --- | --- | --- |
| `bannedShareholderRelease`, `inactiveShareholderShareRelease` | missing | No Native shareholder-status release phase. Corporation ownership lifecycle is [#107](https://github.com/Egg3901/AHDNative/issues/107). |
| `coldWarTension` | same-edge | `coldWarTensionPhase`; Native places the cold-war group at the tail. Its same-turn inputs are `nuclearProductionPhase` and `warsTurnPhase`. |
| `actionRefresh`, `fundGeneration` | same-edge | `actionRefreshPhase`, then `fundGenerationPhase`. |
| `corporationTurn` | same-edge | `corporationTurnPhase` precedes the union/NPP/pension phases and `macroCountryTurnPhase`; macro reads this turn's revenue snapshot. |
| `unionsTurn`, `nppUnionBehavior` | same-edge | `unionsTurnPhase`, then `nppUnionBehaviorPhase`; the former reversed order was corrected. Full labor and timing parity is [#114](https://github.com/Egg3901/AHDNative/issues/114). |
| `partyInfluenceTurn`, `caucusTax`, `nppFundGeneration` | same-edge | Native preserves party influence before caucus tax. `nppFundGenerationPhase` runs earlier than AHDGame and is currently a no-op. Party lifecycle gaps are [#95](https://github.com/Egg3901/AHDNative/issues/95). |
| `savingsInterestTurn` | missing helper wiring | Pure savings-interest processing exists but is absent from `TURN_PHASES`; [#111](https://github.com/Egg3901/AHDNative/issues/111). |
| `npcBankPolicyTurn` | missing | No policy phase; [#109](https://github.com/Egg3901/AHDNative/issues/109). |
| `bankingTurn` | same-edge | `bankingTurnPhase`, followed by `bankSolvencyTurnPhase`. Bank-held deposit work combined here does not replace the missing character savings phase. |
| `savingsShadowTurn` | missing | No registered equivalent; [#111](https://github.com/Egg3901/AHDNative/issues/111). |
| `pensionTurn` | same-edge | `pensionTurnPhase` follows `unionsTurnPhase` and `nppUnionBehaviorPhase`, preserving the AHDGame relative order `corporationTurn` < `unionsTurn` < `pensionTurn` (e364c0495 `turnPhaseNames.ts`): the charge sweep debits corporate `liquidCapital` settled by `corporationTurnPhase` and prices dues off the represented-sector population `unionsTurnPhase` just settled. Absolute tail placement follows this registry's append-only convention, same deviation as the unions cluster. Full lifecycle is [#315](https://github.com/Egg3901/AHDNative/issues/315); the bargaining rate writer stays [#322](https://github.com/Egg3901/AHDNative/issues/322). |
| `prospectingResolution` | same-edge | `resolveProspectsPhase`; its current tail placement differs. Regional scope remains [#115](https://github.com/Egg3901/AHDNative/issues/115). |
| `macroCountryTurn` | same-edge | `macroCountryTurnPhase` reads same-turn corporation output after union/NPP/pension processing. Remaining inputs are [#106](https://github.com/Egg3901/AHDNative/issues/106). |
| `bondTurn` | combined-into | `sovereignIssuancePhase`, `bondCouponMaturityPhase`, and `npcBondHolderPhase`, in that dependency order. Issuance/default gaps are [#110](https://github.com/Egg3901/AHDNative/issues/110). |
| `commodityPrices`, `contractSettlement` | same-edge | `commodityPricesPhase` immediately precedes `contractSettlementPhase`, so settlement reads the current price. |
| `lineOfCreditTurn` | missing helper wiring | Pure line-of-credit turn math exists but is not registered; [#111](https://github.com/Egg3901/AHDNative/issues/111). |
| `recomputeSharePrices` | same-edge | `recomputeSharePricesPhase` runs after `corporationTurnPhase`, so repricing reads current corporate writes. Order-flow parity is [#108](https://github.com/Egg3901/AHDNative/issues/108). |
| `bankSolvencyTurn` | same-edge | `bankSolvencyTurnPhase` runs immediately after `recomputeSharePricesPhase`, matching mainline, so the [#328](https://github.com/Egg3901/AHDNative/issues/328) proprietary-book leg (mark, forced liquidation, investment-bank failure) lands on fresh prices; `bankingTurnPhase` and line-of-credit servicing still settle first. Missing interbank behavior remains [#109](https://github.com/Egg3901/AHDNative/issues/109). |
| `financialSuspectScan` | inapplicable | Server anti-abuse scan over Mongo financial activity. Offline SP has no equivalent operator queue. |
| `turnoutDecay`, `partyGOTV`, `partyOrgTurn`, `regDriftDecay`, `pressureDecay`, `priorityRegionDecay`, `supportDecay`, `supportAccrual`, `partyTierTurn` | same-edge | Native preserves this complete direct support sequence. |
| `statePartyElections`, `nationalPartyElections`, `nationalCommitteeElections` | same-edge | Matching three-phase order in the Native intraparty tail cluster. Committee integration gaps are [#119](https://github.com/Egg3901/AHDNative/issues/119). |
| `partyActionGeneration`, `expireCharters`, `emptyPartyCleanup` | same-edge | Matching order in the main party cluster. |
| `coalitionDisbandVotes` | combined-into | `coalitionDisbandPhase`; coalition authority, expiry, majority, and chair synchronization are live. |
| `nppRelationshipMaintenance`, `nppBillSponsorship` | same-edge | Matching direct phases. |
| `generateChallengers` | combined-into | `runElectionTimers` calls candidate fill when an active race is empty. Country variants remain [#96](https://github.com/Egg3901/AHDNative/issues/96). |
| `nppBehavior` | same-edge | `nppBehaviorPhase`; Native additionally has `nppStanceDriftPhase`. |
| `playerEndorsementPartySweep` | same-edge | Direct Native phase, earlier in the party cluster. |
| `billLifecycle` | same-edge | `billLifecyclePhase`; country catalogs remain [#101](https://github.com/Egg3901/AHDNative/issues/101). |
| `stateBillTimers` | missing | Regional bill workflow is [#64](https://github.com/Egg3901/AHDNative/issues/64). |
| `cabinetNominations` | combined-into | `cabinetNominationLifecyclePhase`; player nomination surfaces remain [#63](https://github.com/Egg3901/AHDNative/issues/63). |
| `scotusTurn`, `ukJrSurpriseTurn` | same-edge | `scotusTurnPhase`, then `ukJrSurpriseTurnPhase`. |
| `socialAxisDrift` | missing | Character stat/action parity is [#91](https://github.com/Egg3901/AHDNative/issues/91). |
| `campaignTurn` | same-edge | Native additionally runs campaign subsidy and NPC investment before tally, then preserves campaign -> tally -> reset. |
| `playerRandomEvents`, `worldEventsMaintenance`, `worldEventsScheduler` | same-edge, locally regrouped | Native runs maintenance, scheduler, then player events in its tail event block. Event surface gaps are [#79](https://github.com/Egg3901/AHDNative/issues/79). |
| `nppActionProcessing` | same-edge | `nppActionProcessingPhase`, earlier than Native's tail events. |
| `activityLogging` | inapplicable | Mongo/server activity log. Offline SP persists game state and does not maintain a server activity collection. |
| `candidatePartySweep` | combined-into | Membership mutation performs the party-mismatch sweep synchronously; see `membership.ts`. |
| `primaryResolution` | missing | The pinned Native base has no registered primary resolver; [#97](https://github.com/Egg3901/AHDNative/issues/97). |
| `voteAccumulation`, `campaignSpendReset`, `electionTimers` | same-edge | Matching direct order. `voteAccumulation` and candidate generation consume RNG. |
| `primarySnapshots` | missing | Primary ballot snapshots and resolution are [#97](https://github.com/Egg3901/AHDNative/issues/97). |
| `electionResolution` | same-edge | `electionResolutionPhase` follows timers. |
| `clearResolvedSupport` | inapplicable | Native support is a persistent per-politician mood row, not an election-scoped support document. Deleting it at race resolution would erase input used by later races. |
| `leadershipVacate` | combined-into | Intraparty election lifecycle reconciles office terms, winners, tenure, founding exemptions, and invalid transitions. |
| `parliamentaryGovernmentFormation`, `parliamentaryGovernmentPhases` | combined-into | `governmentFormationPhase`; it seats or advances the government before vacancy checks. |
| `parliamentaryVacancyWatcher` | same-edge | `governmentVacancyWatcherPhase` follows formation. |
| `perpetualElections` | combined-into | `runElectionTimers` plans the next record per Native election series. Missing country families are [#96](https://github.com/Egg3901/AHDNative/issues/96). |
| `byElectionWatcher` | combined-into | `governorByElectionWatcherPhase` covers Native's supported special-governor path. Other country by-elections are [#96](https://github.com/Egg3901/AHDNative/issues/96). |
| `leadershipElections` | missing behavior behind registered shell | `leadershipElectionsPhase` remains explicitly unavailable pending per-chamber elected-official holder scope. Party leadership elections and persisted party whips are handled by the intraparty cluster. |
| `leadershipPartyEligibility` | combined-into | Eligibility is checked in intraparty lifecycle/action entry, including tenure, founding/founder, state residence, status, and committee-method gates. |
| `staleCandidateCleanup` | combined-into | `cullOrphanedGenerated` runs from election resolution. |
| `withdrawInactiveCandidates` | inapplicable | Native has no separate inactive Character/NPP documents. Candidacy cleanup documents this data-model difference. |
| `autoReelectionEntry` | combined-into | `runAutoReelectionEntry` is called by `runElectionTimers`; lost-race fallback remains [#97](https://github.com/Egg3901/AHDNative/issues/97). |
| `internationalOrganizations` | missing | Shapes are seeded, but no turn mechanics are registered; [#113](https://github.com/Egg3901/AHDNative/issues/113). |
| `alignment` | missing | Alignment state and pure helpers exist, but no drift phase is registered; [#112](https://github.com/Egg3901/AHDNative/issues/112). |
| `settlement` | combined-into | `warsTurnPhase` runs conflict control and creates local settlement records. Full declare/peace/unit behavior is [#41](https://github.com/Egg3901/AHDNative/issues/41). |
| `impeachmentLifecycle`, `presidentialSuccession` | same-edge | Matching direct order in the executive tail cluster. |
| `fiscalYear`, `policyEffects`, `demographicEffects` | same-edge | Direct Native phases, though absolute positions differ. Policy depth is [#104](https://github.com/Egg3901/AHDNative/issues/104). |
| `archetypeApprovalDecay` | missing helper wiring | Pure `society/approvalDecay.ts` exists but no turn phase calls it; [#106](https://github.com/Egg3901/AHDNative/issues/106). |
| `unownedSectorGrowth`, `metricDecay`, `investorConfidenceDecay`, `stateOwnershipConcentration`, `subsidyBudget`, `regionalBudgetProcessing` | same-edge | Direct Native phases in tail clusters. |
| `jpRegionalBudgetProcessing`, `deRegionalBudgetProcessing` | missing | Generic regional processing is not equivalent to these country formulas; [#103](https://github.com/Egg3901/AHDNative/issues/103). |
| `crisisTurn` | same-edge | `crisisTurnPhase`. |
| `intelligenceTurn`, `navairOperations` | missing | No Native intelligence or unit-level navair turn; [#41](https://github.com/Egg3901/AHDNative/issues/41). |
| `ministerialOrders` | same-edge | `ministerialOrdersPhase` immediately precedes `policyEffectsPhase`, so policy recomputation sees current order effects. Source magnitude and full downstream acceptance remain [#105](https://github.com/Egg3901/AHDNative/issues/105). |
| `metricEngine` | combined-into | `nationalMetricsPhase` plus `economicModelPhase`; aggregation precedes the economic model. Missing source inputs are [#40](https://github.com/Egg3901/AHDNative/issues/40) and [#106](https://github.com/Egg3901/AHDNative/issues/106). |
| `demographicFlows`, `census`, `eraCrossing` | same-edge | Direct Native phases; their absolute slots differ. |
| `metricActivation` | combined-into | `nationalMetricsPhase` calls the era-gated metric activation helper. |
| `nationalMetrics`, `fiscalBaseGrowth`, `economicModel`, `tradeGrowthMirror`, `inflationRecalc`, `commandEconomy`, `ledgerPreForexSnapshot`, `forexTurn`, `centralBankChairTurn` | same-edge | Direct Native phases. Native preserves trade growth -> mirror -> inflation and pre-FX snapshot -> FX causal edges, but splits the cluster across its registry tail. |
| `fomcMeetings`, `fomcNominations`, `nppMonetaryOperations`, `centralBankChairExecutiveRemoval` | missing | Central-bank board and nomination lifecycle is [#119](https://github.com/Egg3901/AHDNative/issues/119). |
| `centralBankChairSelection` | same-edge | `centralBankChairSelectionPhase` follows the chair turn. |
| `independenceDesireDrift`, `referendumLifecycle`, `partyMemberCountReconcile` | same-edge | Matching direct order for the first two; party reconciliation is registered earlier in Native. Request/consent/actuation are wired (#42/#70); broader country/office coverage remains #72/#118. |
| `metricHistory`, `approvalSnapshot`, `interestRateSnapshot`, `partyHistorySnapshot`, `portfolioSnapshot`, `corpPortfolioSnapshot`, `stockExchangeSnapshot`, `investorRankingSnapshot`, `wealthListSnapshot`, `gameHealthSnapshot`, `moneySupplySnapshot`, `ledgerBalanceSnapshot` | combined-into | `recordWorldHistoryPhase` stores Native's bounded offline history fields after all mutable mechanics. It does not claim Mongo collection equivalence. |
| `auditAnomalyScan`, `suspiciousDetection` | inapplicable | Server anti-abuse/operator diagnostics over shared multiplayer data. |
| `ledgerReconcile` | inapplicable | Native has no double-entry ledger collection to reconcile. `history/invariants.ts` offers explicit local conservation checks to callers, but it is not registered or represented as AHDGame ledger parity. Finance gaps remain [#111](https://github.com/Egg3901/AHDNative/issues/111). |
| `economicVitalSigns` | same-edge | `economicVitalSignsPhase`; Native records world history immediately after it rather than before it. |

## Country election phase map

`COUNTRY_ELECTION_PHASES` is appended to AHDGame's base list. Native combines
supported election spawning into `electionTimersPhase`, which calls
`electionSeriesForWorld`, rather than registering one phase name per country.

| AHDGame country phases | Native disposition | Dependency and issue |
| --- | --- | --- |
| `ukElections`, `ukRegionalCouncilElections`, `jpElections`, `jpRegionalCouncilElections`, `jpCouncillorElections`, `jpGovernorElections`, `ieElections`, `ieUachtaranElections`, `ieLocalCouncilElections`, `deElections`, `deLandtagElections`, `cnElections`, `cnPeoplesCongressElections`, `cnGovernorElections`, `brElections`, `brSenateElections`, `ruSupremeSovietElections`, `ruNationalitiesElections`, `ruRepublicSovietElections`, `ddVolkskammerElections`, `ddLandAssemblyElections` | combined-into | `electionTimersPhase` plans the corresponding Native series from content-pack regions and chamber metadata. This check covers spawning only, not reference voting-system parity. |
| `ukGovernorElections`, `deMinisterPresidentElections` | missing or non-equivalent | Native has no UK devolution institution timeline for the source's active-only SCO/WAL/NIR/LON executive races; DE's indirect minister-president family also remains unproved. [#96](https://github.com/Egg3901/AHDNative/issues/96). |
| `ieCathaoirleachElections` | missing | No corresponding Native office series; [#96](https://github.com/Egg3901/AHDNative/issues/96). |
| `plSejmElections`, `csChamberOfThePeopleElections`, `huNationalAssemblyElections`, `roGrandNationalAssemblyElections`, `bgNationalAssemblyElections`, `yuFederalAssemblyElections`, `ukrSupremeSovietElections`, `blrSupremeSovietElections`, `balSupremeSovietElections` | inapplicable to current playable packs | Those countries are not current Native playable content. Content expansion is [#118](https://github.com/Egg3901/AHDNative/issues/118); if enabled, election behavior must first be scoped in [#96](https://github.com/Egg3901/AHDNative/issues/96). |
| `ngElections`, `ngSenateElections`, `ngGovernorElections`, `ngRegionalCouncilElections`, `ngPresidentialElection`, `scoElections`, `scoGovernorElections`, `scoRegionalCouncilElections`, `walElections`, `walGovernorElections`, `walRegionalCouncilElections`, `frElections`, `frSenateElections`, `itElections`, `itSenateElections`, `esElections`, `esSenateElections`, `seElections`, `trElections`, `trSenateElections`, `grElections`, `atElections`, `fiElections` | inapplicable to current playable packs | No current Native content or scheduler series. [#118](https://github.com/Egg3901/AHDNative/issues/118) and [#96](https://github.com/Egg3901/AHDNative/issues/96). |

## Current country-election candidate checkpoint for #96, 2026-10-03

Authority is AHDGame `283fa48a53e0efa856510e44acb9714ec43875c2` and
AHDClient `799a992054609d231930bbf062251b93590ccf68`. Native candidate
`3c30bfdfd853ce2229c14678d128d09a4a05fa38` contains the bounded changes
below. They are not in accepted main or internal iOS 0.1.10 (1.23).
Schema 65 remains unpublished and unqualified as a combined family.
This section supersedes the historical country classifications above.

Game's country phases spawn elections; its shared timer, tally and resolution
phases then consume them. Native combines country spawning into
`electionTimersPhase`, followed by `voteAccumulationPhase` and
`electionResolutionPhase`. A matching phase seam alone does not prove the
source input, gates, result or persisted office.

| Country | Source phases and applicability | Native candidate and evidence boundary |
| --- | --- | --- |
| UK | `ukElections`, `ukRegionalCouncilElections`, `ukGovernorElections`; regional Commons, staggered council cohorts and policy-driven devolved offices | Twelve Commons series retain era seat maps; five council cohorts retain their anchors. Devolution and the separate NIR conflict producer suspend/restore institutions through real decisions and ordinary expiry. The recorded 1953 NIR campaign matches all 24 immutable-source distributor inputs and the 12-seat allocator, resigns a three-seat office, wins its weighted special and persists the replacement. This does not qualify every era or office. |
| RU | `ruSupremeSovietElections`, `ruNationalitiesElections`, `ruRepublicSovietElections`, `ruGovernorElections`; source playable-or-NPP-v1 and era anchors | National/republic assemblies and First Secretary races use the combined timer. The recorded 1953 RU/DD replay contains 960 tally inputs across 20 races; the immutable Game `0a68fee4` distributor matches every captured turn and final tally, and office results survive reload. Other eras and whole country mechanics remain unqualified. |
| DD | `ddVolkskammerElections`, `ddLandAssemblyElections`, `ddGovernorElections`; source playable-or-NPP-v1 and era anchors | Volkskammer, Land assemblies and First Secretary races use the combined timer, with the same bounded 1953 source replay and saved-office evidence as RU. |
| PL | `plSejmElections`; background satellite assembly, no player creation | Source beta-gated background series, region population/GDP, electoral capacity and exact Layer 1 groups are present. Five focused cases include a nonzero resolved Mazovia tally, 65 weighted regional seats, 460-seat Poland composition and reload. The resolving case explicitly advances the clock to lifecycle boundaries; natural calendar continuation and regional-party treasury remain open. |
| CS | `csChamberOfThePeopleElections`; background satellite assembly, no player creation | Background series and exact source Layer 1 groups are present, with 200-seat capacity in both Cold War eras. The country is not selectable; no cycle is produced outside the applicable era roster. |
| HU | `huNationalAssemblyElections`; background satellite assembly, no player creation | Background series and exact source Layer 1 groups are present under the Cold War beta gate. The country is not selectable; full natural-calendar resolution remains open. |
| RO | `roGrandNationalAssemblyElections`; background satellite assembly, no player creation | Background series and exact source Layer 1 groups are present under the Cold War beta gate. The country is not selectable; full natural-calendar resolution remains open. |
| BG | `bgNationalAssemblyElections`; background satellite assembly, no player creation | Background series and exact source Layer 1 groups are present under the Cold War beta gate. The country is not selectable; full natural-calendar resolution remains open. |
| YU | `yuFederalAssemblyElections`; background satellite assembly, no player creation | Background series and exact source Layer 1 groups are present under the Cold War beta gate. The country is not selectable; full natural-calendar resolution remains open. |
| UKR | `ukrSupremeSovietElections`; latent Union Republic, no player creation | Background series and source Layer 1 groups are present. The latent country runs only at NPP autonomy v1 or higher, using the RU republic anchor; it is not selectable. |
| BLR | `blrSupremeSovietElections`; latent Union Republic, no player creation | Background series and source Layer 1 groups are present under the same latent NPP-v1 gate and RU republic anchor as UKR; it is not selectable. |
| BAL | `balSupremeSovietElections`; latent Union Republic, no player creation | Background series and source Layer 1 groups are present under the same latent NPP-v1 gate and RU republic anchor as UKR; it is not selectable. |

None of those nine eastern countries is selectable at reference character
creation. This does not exempt its source-live background simulation.
PL/CS/HU/RO/BG/YU are economy-preview in 1953 and NPP in 1979, both seeded
as beta with player creation disabled. Their assembly phases use the DD
anchor in 1953/1979. UKR/BLR/BAL are latent seed entries and use the RU
republic anchor, with their separate NPP-v1 access prerequisite. Canonical
anchors are null outside the Cold War presets even where a later roster
still includes the country, so no cycle is created there. The candidate adds background data and consumers without widening player
creation. Electoral capacity remains separate from historical occupied seats:
1953 vacancies are preserved, and only explicit historical initialization seeds
the authored officeholders. See [the Layer 1 provenance](eastern-bloc-layer1-provenance.md).

These conditions were read at the immutable source pin in
[`eraRoster.ts`](https://github.com/Egg3901/AHDGame/blob/093daeae41b152c61bb22ad352054ff8cd5cef2a/src/lib/world/eraRoster.ts),
[`countryAccess.ts`](https://github.com/Egg3901/AHDGame/blob/093daeae41b152c61bb22ad352054ff8cd5cef2a/src/lib/countryAccess.ts),
[`easternBloc.ts`](https://github.com/Egg3901/AHDGame/blob/093daeae41b152c61bb22ad352054ff8cd5cef2a/src/lib/turn/perpetualElections/countries/easternBloc.ts)
and [`canonicalCycle.ts`](https://github.com/Egg3901/AHDGame/blob/093daeae41b152c61bb22ad352054ff8cd5cef2a/src/lib/elections/canonicalCycle.ts).
Client supplies no independent creation gate that makes those countries playable.


Current Game adds opt-in ranked PR-STV to IE Dail and local-council tallies at
`countingMethod === "pr_stv"`. It persists ranked ballots and transfer/count
history and refuses incomplete field/preference evidence before vacating offices.
The Native candidate does not implement this path. The absent-method aggregate
allocator remains source-supported and must retain its existing behavior.

The full earned US governor-to-presidential endorsement journey is retained in
`src/game/governorPublicEndorsement.journey.test.ts`. Run
`npm run test:extended:elections` to create all three public milestones and all
six matched sixteen-turn continuations from their actual saves. The separate
required CI job runs one worker and retains every original assertion, source
clock, full history and RNG. Ordinary public-action and engine regressions run
in the main verification job. Individual checkpoint probes do not replace the
whole extended gate. The independent retained turn-178 Game distributor replay
is a separate bounded source proof; it does not complete the missing public
presidential-primary, later-pack district or VP journeys in #97/#98.

### Commons vacancy watcher and entry qualification

The source [watcher and shared gate](https://github.com/Egg3901/AHDGame/blob/093daeae41b152c61bb22ad352054ff8cd5cef2a/src/lib/turn/commonsByElections.ts)
freeze a live special's claimed seats and electorate. Later vacancies wait;
a general closing within the same 48-turn window covers the vacancy; every
finished special, including cancellation, applies cooldown from its recorded
`endTurn`. Native's extra boundary turn, live-race claim enlargement and
resolved-only cooldown were reproduced as three failing ordinary-turn tests
and corrected. `commonsVacancyScheduling.test.ts` now passes all three,
including exact live-versus-reloaded continuation. Fixture races and prior
offices are declared preconditions, not naturally earned careers.

`commonsRecallSession.test.ts` qualifies the real six-turn support-check
consumer through public session turns/actions, then projects the resulting
three-seat recall vacancy and actual by-election link across reload. Its
five initial signatures and held office are explicit fixtures. The separate
ordinary trigger and single-player signature/expiry flows remain recorded;
o additional authenticated signer or NPC recall signature is invented.

`PoliticsPanel.test.tsx` passes 39 cases, including vacancy-to-race selection
with filter reset and candidacy dispatch, truthful absence of an unclaimed
race link, and all four projected scheduling reasons. The source vacancy
read model and panel remain the reference; read-only UI fields add no save
state. Existing player defection and retirement consumers preserve actual
held-office weights. Source-connected non-player death/retirement producers,
generic holderless-office backstop, applicable eastern country witnesses,
combined schema qualification and complete current-source country acceptance
remain open in #96. No physical-device or full-engine parity is implied.

## Native-only registered phases

These do not appear as standalone AHDGame phase names. They are not silently
treated as missing AHDGame behavior.

| Native phase(s) | Disposition |
| --- | --- |
| `advanceCalendarPhase`, `newsMaintenancePhase` | Native-only offline clock and bounded-news maintenance. |
| `campaignPartySubsidyPhase`, `campaignNpcInvestmentPhase` | Native decomposition of campaign processing, ordered before tally. |
| `nppStanceDriftPhase` | Native NPP decomposition. |
| `tradeGrowthPhase`, `advanceCapitalStockPhase` | Native producer phases for values consumed later by mirror/macro phases. |
| `cabinetTransitionPhase` | Native lifecycle split that runs before cabinet nominations. |
| `governorAPRegenPhase`, `governorOrdersPhase`, `governorAddressExpiryPhase`, `governorLegislationQueuePhase`, `governorEndorsementsPhase` | Native governor decomposition; UI/mechanics depth remains under [#72](https://github.com/Egg3901/AHDNative/issues/72). |
| `sovereignIssuancePhase`, `bondCouponMaturityPhase`, `npcBondHolderPhase` | Native decomposition of AHDGame `bondTurn`. |
| `nuclearProductionPhase`, `warsTurnPhase` | Native bounded cold-war/conflict decomposition. Full military scope is [#41](https://github.com/Egg3901/AHDNative/issues/41). |
| `contractOfferAcceptancePhase`, `achievementCheckPhase`, `countryPoliticsPhase` | Native offline lifecycle additions without standalone names in the sampled AHDGame phase list. |
| `recordWorldHistoryPhase` | Native bounded replacement for the snapshot and local invariant family. |

## Tail movement and RNG plan

No phase is moved by this completion card. That avoids a broad reorder and
does not require new save evidence.

| Tail cluster | Shared RNG status | Safe movement rule |
| --- | --- | --- |
| Fiscal, regional budget, central-bank, banking, governor, unions, bonds, capital/ownership, trade mirror, era crossing, metrics/history, cold war, ministerial/policy, contract acceptance, achievements, country politics | RNG-free in current Native implementation | The phase code consumes no `WorldRng`, but moving it across an RNG consumer can change the state that consumer sees. Move only a proven producer/consumer edge; no RNG re-golden is needed when no intervening RNG consumer changes its draw count or branch state. |
| Campaign turn/subsidy/investment/reset | RNG-free | Existing campaign -> tally -> reset edge is proven. Moving the group elsewhere requires tally-state regression tests, not RNG-vector changes by itself. |
| Parliamentary government and cabinet/judiciary | Currently deterministic for ordinary worlds | Treat conservatively because future nomination paths may consume RNG. Prove the exact edge before moving. |
| Commodity prices, macro country, election tally/timers, demographic flow, intraparty elections, impeachment, events/crisis, forex, prospect resolution | RNG-consuming directly or through called helpers, or state-dependent around an RNG consumer | Any absolute reorder needs a named same-turn dependency, before/after `advanceTurn` evidence, and regeneration plus review of deterministic replay goldens. Do not batch these into a full reorder. |
| Referendum lifecycle | Hash-derived variance, not shared `WorldRng` | Moving does not shift the shared stream, but can change state observed on the resolution turn. Preserve independence drift -> referendum lifecycle. |

The already-correct same-turn edges are covered by public `advanceTurn` tests:
`phaseOrderDepth.test.ts` proves corporation -> macro, and
`campaigns/campaignOrder.test.ts` proves campaign -> tally -> reset. No new
edge was moved here, so the conditional move-and-save acceptance does not
apply.

## Sources

- AHDGame `d4baf899fd8bd529099f03d7410807143604e2e5`, `src/simulation/phases/turnPhaseNames.ts`,
  `src/lib/turn/countryPhases.ts`, and
  `src/simulation/phases/turnPhaseRegistry.ts`, especially the
  `corporationTurn`, `macroCountryTurn`, `campaignTurn`,
  `voteAccumulation`, and `campaignSpendReset` registrations.
- AHDNative `packages/engine/src/corporation/corporationTurn.ts`, which writes
  `corpRevenueSnapshots`.
- AHDNative `packages/engine/src/phases/macroCountryTurn.ts`, which reads
  `corpRevenueSnapshots` for `computeRealizedRevenueGrowthRate`.
- AHDNative `eb72daab63201f76674ed54dab4ff83404b9cee9`,
  `packages/engine/src/phases/registry.ts`, `packages/engine/src/engine.ts`,
  and each combined owner named in the tables.
