import type { TurnPhase } from "./types.js";
import { advanceCalendarPhase } from "./advanceCalendar.js";
import { macroCountryTurnPhase } from "./macroCountryTurn.js";
import { actionRefreshPhase } from "../actions/actionRefresh.js";
import { fundGenerationPhase } from "../actions/fundGenerationPhase.js";
import { commodityPricesPhase } from "../commodity/commodityPrices.js";
import { contractSettlementPhase } from "../commodity/contractSettlement.js";
import { newsMaintenancePhase } from "./newsMaintenance.js";
import {
  partyInfluenceTurnPhase,
  caucusTaxPhase,
  partyOrgTurnPhase,
  partyTierTurnPhase,
  partyActionGenerationPhase,
  expireChartersPhase,
  emptyPartyCleanupPhase,
  partyMemberCountReconcilePhase,
  playerEndorsementPartySweepPhase,
} from "../party/phases.js";

/**
 * Ordered turn pipeline. Mainline runs ~60 phases (see AHDGame
 * src/simulation/phases/turnPhaseNames.ts); systems port over here one phase
 * at a time, preserving mainline's relative ordering as they land.
 *
 * W34 inserts actionRefresh (mainline index 3) and fundGeneration (index 4)
 * immediately after advanceCalendar, mirroring BASE_TURN_PHASE_NAMES:
 *   actionRefresh → fundGeneration → partyInfluenceTurn → caucusTax → macroCountryTurn
 *
 * Party cluster order (per mainline BASE_TURN_PHASE_NAMES indices):
 *  partyInfluenceTurn (8) → caucusTax (9) → macroCountryTurn (19) →
 *  partyOrgTurn (29) → partyTierTurn (35) → partyActionGeneration (39) →
 *  expireCharters (40) → emptyPartyCleanup (41) → … → partyMemberCountReconcile (119) →
 *  commodityPrices → contractSettlement (commodityPrices before contractSettlement
 *  so settlement sees this turn's market, same as mainline turnPhaseRegistry.ts)
 *
 * W19 support cluster (per mainline turnPhaseRegistry.ts demographicsAndPartySetup
 * + support blocks, indices 28-34): turnoutDecay → partyGOTV → partyOrgTurn →
 * regDriftDecay → pressureDecay → priorityRegionDecay → supportDecay → supportAccrual
 * Solo ordering mirrors mainline: turnout before GOTV, drift/decay after org,
 * support accrual AFTER decay so drip is fresh for tally.
 */
import {
  turnoutDecayPhase,
  partyGOTVPhase,
  regDriftDecayPhase,
  pressureDecayPhase,
  priorityRegionDecayPhase,
  supportDecayPhase,
  supportAccrualPhase,
} from "../support/phases.js";
import { billLifecyclePhase } from "./billLifecyclePhase.js";
import { nppFundGenerationPhase } from "../npp/nppFundGeneration.js";
import { nppRelationshipMaintenancePhase } from "../npp/nppRelationshipMaintenance.js";
import { nppBillSponsorshipPhase } from "../npp/nppBillSponsorship.js";
import { nppActionProcessingPhase } from "../npp/nppActionProcessing.js";
import { nppStanceDriftPhase } from "../npp/stanceDrift.js";
import { nppBehaviorPhase } from "../npp/nppBehavior.js";
import { primaryResolutionPhase, voteAccumulationPhase, electionTimersPhase, electionResolutionPhase, foundingCompletionPhase } from "../elections/phases.js";
import { demographicEffectsPhase } from "../demographics/demographicEffects.js";
import { demographicFlowsPhase } from "../demographics/demographicFlows.js";
import { censusPhase } from "../demographics/census.js";
import {
  fiscalBaseGrowthPhase,
  subsidyBudgetPhase,
  fiscalYearPhase,
  regionalBudgetProcessingPhase,
} from "../budget/phases.js";
import {
  centralBankChairTurnPhase,
  centralBankChairSelectionPhase,
  fomcMeetingsPhase,
  fomcNominationsPhase,
} from "../centralBank/phases.js";
import { corporationTurnPhase } from "../corporation/corporationTurn.js";
import { recomputeSharePricesPhase } from "../market/recomputeSharePrices.js";
import {
  campaignSpendResetPhase,
  campaignTurnPhase,
  campaignPartySubsidyPhase,
  campaignNpcInvestmentPhase,
  campaignStrengthPullbackPhase,
} from "../campaigns/phases.js";
import {
  statePartyElectionsPhase,
  nationalPartyElectionsPhase,
  nationalCommitteeElectionsPhase,
  coalitionDisbandPhase,
  leadershipElectionsPhase,
} from "../intraparty/phases.js";
import { governmentFormationPhase, governmentVacancyWatcherPhase } from "../government/phases.js";
import { impeachmentLifecyclePhase } from "../impeachment/phases.js";
import { presidentialSuccessionPhase } from "../executive/phases.js";
import { cabinetTransitionPhase, cabinetNominationLifecyclePhase } from "../cabinet/phases.js";
import { scotusTurnPhase, ukJrSurpriseTurnPhase } from "../judiciary/phases.js";
import {
  worldEventsMaintenancePhase,
  worldEventsSchedulerPhase,
  playerRandomEventsPhase,
  crisisTurnPhase,
} from "../events/phases.js";
import { bankingTurnPhase } from "../banking/bankingTurn.js";
import { discountWindowTurnPhase } from "../banking/discountWindow.js";
import { playerSavingsInterestPhase } from "../finance/playerSavingsInterest.js";
import { playerLineOfCreditPhase } from "../finance/playerLineOfCredit.js";
import { bankSolvencyTurnPhase } from "../banking/bankSolvencyTurn.js";
import {
  governorAPRegenPhase,
  governorOrdersPhase,
  governorAddressExpiryPhase,
  governorByElectionWatcherPhase,
  governorLegislationQueuePhase,
  governorEndorsementsPhase,
} from "../governor/phases.js";
import { unionsTurnPhase, nppUnionBehaviorPhase } from "../unions/phases.js";
import { pensionTurnPhase } from "../unions/pensionTurn.js";
import { sovereignIssuancePhase, bondCouponMaturityPhase, npcBondHolderPhase } from "../bonds/phases.js";
import { ledgerPreForexSnapshotPhase, forexTurnPhase } from "../forex/phases.js";
import { eraCrossingPhase } from "./eraCrossing.js";
import { independenceDesireDriftPhase } from "../devolution/phases.js";
import { referendumLifecyclePhase } from "../referendum/phases.js";
import { metricDecayPhase } from "../metrics/metricDecay.js";
import { investorConfidenceDecayPhase } from "../metrics/investorConfidenceDecay.js";
import { nationalMetricsPhase } from "../metrics/nationalMetrics.js";
import { economicModelPhase } from "../metrics/economicModel.js";
import { inflationRecalcPhase } from "../metrics/inflationRecalc.js";
import { economicVitalSignsPhase } from "../metrics/economicVitalSigns.js";
import { tradeGrowthPhase, tradeGrowthMirrorPhase } from "../trade/phases.js";
import { commandEconomyPhase } from "../commandEconomy/phases.js";
import {
  advanceCapitalStockPhase,
  unownedSectorGrowthPhase,
  stateOwnershipConcentrationPhase,
} from "../economy/phases.js";
import { recordWorldHistoryPhase } from "../history/phases.js";
import { nuclearProductionPhase, coldWarTensionPhase } from "../coldWar/phases.js";
import { internationalOrganizationsPhase } from "../internationalOrgs/phases.js";
import { warsTurnPhase } from "../wars/phases.js";
import { ministerialOrdersPhase } from "../ministerialOrders/phases.js";
import { policyEffectsPhase } from "../policyEffects/phases.js";
import { resolveProspectsPhase } from "../extraction/prospecting.js";
import { contractOfferAcceptancePhase } from "../extraction/contracts.js";
import { achievementCheckPhase } from "../achievements/phase.js";
import { countryPoliticsPhase } from "../countryPolitics/phases.js";
import { fiscalDirectivesPhase } from "../budget/fiscalDirectives.js";

export const TURN_PHASES: readonly TurnPhase[] = [
  advanceCalendarPhase,
  fiscalDirectivesPhase,
  actionRefreshPhase,
  fundGenerationPhase,
  nppFundGenerationPhase,
  partyInfluenceTurnPhase,
  playerEndorsementPartySweepPhase,
  caucusTaxPhase,
  // W9 corporation output must settle before macroCountryTurn reads the
  // per-country revenue snapshot. AHDGame registers corporationTurn before
  // macroCountryTurn for this dependency. This phase is RNG-free, so moving
  // this single causal edge does not consume or shift the shared RNG stream.
  corporationTurnPhase,
  // #323 union cluster at the source-backed edge: mainline runs
  // corporationTurn (index 5) < unionsTurn (6) < nppUnionBehavior (7) <
  // … < pensionTurn (15) < macroCountryTurn (17) (turnPhaseNames.ts at
  // pinned e364c0495). All four moved phases are RNG-free, so restoring
  // this edge consumes no shared RNG draws and shifts no downstream
  // phase's stream. What the move fixes, in reference relative order:
  //   corporationTurn → unionsTurn: the dues/services/approval loop prices
  //     against this turn's sector unionization/workers/wage writes, and
  //     the labour-relations leg reads turn-start strike state for the
  //     NEXT corporation turn (never the one that just ran, so a strike
  //     called this turn cannot damage this turn's revenue twice — the
  //     no-same-turn-duplicate-damage invariant #323 proves).
  //   unionsTurn → nppUnionBehavior: mainline runs NPP behavior AFTER the
  //     unions pass, so a union elected this turn does NOT get its dues
  //     tick the same turn (the old tail order did the opposite).
  //   unionsTurn → campaignTurn: #321 organizer payouts credit recipient
  //     campaign funds before campaignTurn spends them, matching mainline's
  //     unionsTurn (6) < campaignTurn (56) edge (previously the tail
  //     placement credited payouts after the spend).
  //   pensionTurn before macroCountryTurn: the charge sweep debits the
  //     corporate liquidCapital corporationTurn just settled and reads the
  //     same represented-sector wage population unionsTurn just priced
  //     dues against — before macroCountryTurn mutates laborForces and
  //     before the fiscal tail phases mutate budgets, exactly the
  //     reference's pre-macro read position.
  // Remaining deviation (out of scope): mainline runs bankingTurn (13)
  // before pensionTurn (15); Native's banking cluster stays at the tail
  // per its own rng-stream-stability rule, so pension reads pre-banking
  // corporate capital. No shared-field consumer distinguishes the two
  // positions (banking touches private-bank savings, never the pension
  // wage base), and a dedicated re-golden will restore mainline order.
  unionsTurnPhase,
  nppUnionBehaviorPhase,
  pensionTurnPhase,
  macroCountryTurnPhase,
  turnoutDecayPhase,
  partyGOTVPhase,
  partyOrgTurnPhase,
  regDriftDecayPhase,
  pressureDecayPhase,
  priorityRegionDecayPhase,
  supportDecayPhase,
  supportAccrualPhase,
  partyTierTurnPhase,
  partyActionGenerationPhase,
  expireChartersPhase,
  emptyPartyCleanupPhase,
  partyMemberCountReconcilePhase,
  nppRelationshipMaintenancePhase,
  nppBillSponsorshipPhase,
  nppStanceDriftPhase,
  nppActionProcessingPhase,
  nppBehaviorPhase,
  billLifecyclePhase,
  commodityPricesPhase,
  contractSettlementPhase,
  // Elections run at the end of the ported subset for now: inserting them at
  // mainline's absolute position would shift the shared rng stream under every
  // integration golden. A dedicated re-ordering pass re-goldens once the phase
  // set stabilizes (mainline: commodity < bills < elections).
  //
  // M04 campaign same-turn correction (AHDGame e364c0495 turnPhaseNames.ts):
  // mainline runs campaignTurn (index 56) BEFORE voteAccumulation (64) and
  // campaignSpendReset (65) AFTER it, same turn. The tally's fundsByParty
  // reads spendThisTurn and its support input reads favorability-driven
  // candidateSupports, so both campaign writes must land before the tally,
  // and the reset must clear the interval after the tally read (before
  // electionTimers/electionResolution). The three writer phases move here
  // as a unit in their existing relative order (campaignTurn accrues, then
  // the disclosed non-port partySubsidy funds the non-port npcInvestment
  // purchases below it - see campaigns/npcInvestment.ts and
  // campaigns/partySubsidy.ts file docs; formulas untouched). All four
  // moved phases are RNG-free, so the move consumes no shared RNG draws and
  // the RNG-consuming phases (voteAccumulation, electionTimers) keep their
  // relative order. Later state-dependent RNG use can still change with
  // election outcomes; this is not a whole-world RNG equivalence claim.
  campaignTurnPhase,
  // #68: leader pullback runs immediately after campaignTurn (which never
  // writes campaignStrength) and before voteAccumulation, matching mainline's
  // same-turn edge (campaignTurn.ts computes the pullback and applies it inside
  // this turn's campaign update). RNG-free, so it consumes no shared RNG draws
  // and shifts no downstream phase's stream. Strict no-op at strength 0.
  campaignStrengthPullbackPhase,
  campaignPartySubsidyPhase,
  campaignNpcInvestmentPhase,
  primaryResolutionPhase,
  voteAccumulationPhase,
  campaignSpendResetPhase,
  electionTimersPhase,
  electionResolutionPhase,
  foundingCompletionPhase,
  // Demographics at end of ported subset (before newsMaintenance) to avoid
  // shifting existing RNG streams - mirrors elections block deviation note.
  // Mainline order is demographics (census earlier, flows after metricEngine,
  // effects near legislation) but solo demotes them to tail until re-golden.
  demographicEffectsPhase,
  demographicFlowsPhase,
  censusPhase,
  // Budget phases at end of ported subset, before newsMaintenance.
  // Mainline ordering (turnPhaseRegistry.ts / simTurnProfiles.ts): fiscalYear before
  // regionalBudgetProcessing, both after metricEngine and before final diagnostics.
  // Solo deviation: placed at tail to avoid shifting existing RNG streams; re-golden will restore mainline order.
  // Unported variants: JP (src/lib/turn/jpRegionalBudget.ts) and DE (src/lib/turn/deRegionalBudget.ts), issue #103.
  // JP and DE are playable in the 1991 and 2019 packs and use the generic processor.
  //
  // W8 tradeGrowthPhase inserted immediately before fiscalBaseGrowthPhase,
  // mirroring mainline's real ordering (stateEffectsPhase.ts runs
  // computeNationalMetrics — which recomputes economic.tradeGrowth — before
  // processFiscalBaseGrowth reads it, per fiscalBaseGrowth.ts's own file-doc
  // citation of tradeGrowthMirror running AFTER it). RNG-free, so this
  // insertion does not shift any other phase's rng draws.
  tradeGrowthPhase,
  fiscalBaseGrowthPhase,
  subsidyBudgetPhase,
  fiscalYearPhase,
  regionalBudgetProcessingPhase,
  // W3 central bank cluster at end of ported subset, before newsMaintenance -
  // same rng-stream-stability rule as the elections/demographics/budget blocks
  // above (mainline runs this cluster mid-pipeline, at turnPhaseNames.ts
  // indices 116-121; inserting it there would shift every downstream rng draw
  // for existing goldens). centralBankChairTurn before centralBankChairSelection
  // mirrors mainline's relative order.
  centralBankChairTurnPhase,
  // Issue #119: fomcMeetings → fomcNominations between centralBankChairTurn and
  // centralBankChairSelection, the reference's relative order (turnPhaseNames.ts
  // 116 centralBankChairTurn → fomcMeetings → fomcNominations → 121
  // centralBankChairSelection). Both are strict no-ops for banks without an
  // fomcBoard (legacy single-chair banks), so appending this pair does not shift
  // any other phase's rng draws and every existing golden is unaffected.
  fomcMeetingsPhase,
  fomcNominationsPhase,
  centralBankChairSelectionPhase,
  // W20 intra-party democracy cluster at END before newsMaintenance.
  // Ordering deviation: mainline runs statePartyElections/nationalPartyElections/
  // nationalCommitteeElections and coalitionDisbandCheck interleaved with partyOrg
  // and election timers (see turnPhaseNames.ts). Solo defers this entire block to
  // the tail before newsMaintenance to avoid shifting shared RNG streams under
  // existing integration goldens; a dedicated re-golden will restore mainline order.
  // Relative order inside block mirrors mainline: state -> national -> committee -> coalition -> leadership(Port-Stub).
  statePartyElectionsPhase,
  nationalPartyElectionsPhase,
  nationalCommitteeElectionsPhase,
  coalitionDisbandPhase,
  leadershipElectionsPhase,
  // W23 parliamentary government cluster, at the end of the ported subset,
  // before newsMaintenance - same rng-stream-stability rule as every other
  // tail cluster above (this repo has no interactive vote/appointment
  // system yet, so these two phases are also rng-free in practice, but the
  // placement rule is about not shifting every later phase's rng draws for
  // existing goldens, not about this cluster's own rng use). Relative order
  // mirrors mainline turnPhaseRegistry.ts indices 85-87 (parliamentaryGovernmentFormation
  // + parliamentaryGovernmentPhases, merged into governmentFormationPhase -
  // see government/phases.ts file doc - before parliamentaryVacancyWatcher):
  // governmentFormationPhase runs first so a government seated this turn has
  // its PM vacancy deadline cleared before governmentVacancyWatcherPhase
  // checks it, exactly as mainline's pmVacancyDeadline.ts requires.
  governmentFormationPhase,
  governmentVacancyWatcherPhase,
  // W24 presidential succession/impeachment cluster at END before
  // newsMaintenance - same rng-stream-stability rule as every other tail
  // cluster above (mainline runs impeachmentLifecycle/presidentialSuccession
  // mid-pipeline, around Group 11; inserting them there would shift every
  // downstream rng draw for existing goldens). Relative order mirrors
  // mainline: impeachmentLifecycle BEFORE presidentialSuccession, so a
  // same-turn conviction vacancy is filled by succession the same turn (see
  // impeachment/lifecycle.ts file doc). Both also run after
  // electionResolutionPhase above, so a same-turn presidential-election
  // winner already fills a vacancy before succession would need to.
  impeachmentLifecyclePhase,
  presidentialSuccessionPhase,
  // W29 cabinet + judiciary cluster at END before newsMaintenance - same
  // rng-stream-stability rule as every other tail cluster above (ordering
  // deviation: mainline runs cabinetNominationLifecycle and scotusTurn mid-
  // pipeline alongside centralBank/legislation; UK JR surprise runs as a
  // standalone turn phase in src/lib/turn/ukJrSurpriseTurn.ts). Solo places
  // the entire W29 cluster at the tail before newsMaintenance so inserting
  // it does not shift shared RNG streams under existing integration goldens;
  // a dedicated re-golden will restore mainline order. Relative order inside
  // this cluster mirrors mainline: cabinetTransition before
  // cabinetNominationLifecycle (so a transition-cleared seat is not voted on
  // the same turn), then scotusTurn (tenure → docket → surprise → nominations),
  // then ukJrSurpriseTurn.
  cabinetTransitionPhase,
  cabinetNominationLifecyclePhase,
  scotusTurnPhase,
  ukJrSurpriseTurnPhase,
  // W10 markets note: recomputeSharePricesPhase used to be registered here.
  // #309 moved the entry to right after the W13 bond cluster below so the
  // repricing reads post-coupon/post-loan-service issuer capital the same
  // turn, matching mainline (turnPhaseNames.ts: bondTurn 18 <
  // recomputeSharePrices 22). Rationale lives at the new slot.
  // W31 events cluster at END before newsMaintenance - ordering deviation:
  // Mainline runs worldEventsMaintenance (53) and worldEventsScheduler (54)
  // alongside playerRandomEvents (52) and crisisTurn (Group 11, Effects) mid-
  // pipeline, before nppActionProcessing and well before history snapshots.
  // Solo defers the entire W31 cluster to the tail before newsMaintenance to
  // avoid shifting shared RNG streams under existing integration goldens - same
  // rule as every other tail cluster above. A dedicated re-golden will restore
  // mainline order. Relative order inside this cluster mirrors mainline:
  // worldEventsMaintenance before worldEventsScheduler (so expired modifiers
  // are swept before this turn's scheduling pass), then playerRandomEvents,
  // then crisisTurn (which may spawn news that newsMaintenance will trim).
  worldEventsMaintenancePhase,
  worldEventsSchedulerPhase,
  playerRandomEventsPhase,
  crisisTurnPhase,
  // W12 private banking, at END before newsMaintenance - same rng-stream-
  // stability rule as every other tail cluster above (mainline runs
  // bankingTurn/bankSolvencyTurn mid-pipeline, immediately after
  // savingsInterestTurn / recomputeSharePrices respectively; inserting them
  // there would shift every downstream rng draw for existing goldens - and
  // in solo's case the banking phases are RNG-free regardless, so the real
  // reason is the same append-only-tail rule recomputeSharePricesPhase's own
  // comment states, not an rng argument). playerSavingsInterestPhase handles
  // only central-bank-held savings and runs before bankingTurnPhase, which
  // exclusively handles private-bank-held savings. bankingTurnPhase before
  // bankSolvencyTurnPhase mirrors mainline's real relative order (a bank's
  // deposit/loan/interest flows settle before that same turn's solvency
  // pass evaluates the resulting cash position); bankSolvencyTurnPhase
  // itself runs after recomputeSharePricesPhase below, matching mainline's
  // stated order that bankSolvencyTurn runs "immediately after
  // recomputeSharePrices" (turnPhaseRegistry.ts) so the #328 prop-book
  // mark lands on fresh prices.
  playerSavingsInterestPhase,
  bankingTurnPhase,
  // #327 discount-window interest servicing, immediately after bankingTurn
  // and before bankSolvencyTurn — the reference's own relative order
  // (bankingTurn.ts runs serviceInterbankAndCbMargin at the end of its pass,
  // before lineOfCreditTurn and bankSolvencyTurn) so interest/arrears settle
  // before the solvency pass scores the resulting cash position. RNG-free,
  // so tail placement shifts no downstream rng draws.
  discountWindowTurnPhase,
  // #314 line-of-credit servicing, immediately after bankingTurn and before
  // bankSolvencyTurn — the reference's own relative order (turnPhaseRegistry.ts:
  // bankingTurn … lineOfCreditTurn … bankSolvencyTurn) so the scheduled
  // payment reads the wallet this turn's banking flows already settled.
  // RNG-free, so tail placement shifts no downstream rng draws.
  playerLineOfCreditPhase,
  // W30 governor cluster at END before newsMaintenance, after the W12
  // banking cluster (merged in ahead of this wave - see world.ts
  // SCHEMA_VERSION file doc; the two clusters don't read/write any shared
  // fields so relative order between them is a no-op either way; placed
  // after banking simply to match landing order, and before unions/bonds/
  // forex/metrics below since it fills schema slot v29, one below their
  // v30-v33). Ordering deviation:
  // Mainline runs governorAPRegen (Group 13), governorExecutiveOrders,
  // governorAddressExpiry, governorEndorsements, governorLegislationQueue and
  // byElectionWatcher (special_governor watcher) interleaved with election
  // timers/resolution and cabinet/judiciary (turnPhaseRegistry.ts Group 11-13,
  // turnPhaseNames.ts 74). Solo defers the entire W30 cluster to the tail
  // before newsMaintenance to avoid shifting shared RNG streams under existing
  // integration goldens - same rule as every other tail cluster above.
  // A dedicated re-golden will restore mainline order. Relative order inside
  // this cluster mirrors mainline: governorAPRegen first (AP is spent by
  // later phases), governorOrders before governorAddressExpiry (both expiry
  // sweeps), then governorByElectionWatcher after electionResolutionPhase so it
  // reads settled governor seats (same placement rationale as mainline
  // byElectionWatcher after perpetualElections), then PORT-STUB sweeps
  // governorLegislationQueue and governorEndorsements.
  governorAPRegenPhase,
  governorOrdersPhase,
  governorAddressExpiryPhase,
  governorByElectionWatcherPhase,
  governorLegislationQueuePhase,
  governorEndorsementsPhase,
  // #323: the W15 union cluster (unionsTurn, nppUnionBehavior) and the #315
  // pension phase used to live here at the tail; they now run immediately
  // after corporationTurnPhase near the head of this array, in mainline's
  // relative order (corporationTurn < unionsTurn < nppUnionBehavior <
  // pensionTurn < macroCountryTurn at pinned e364c0495). See the #323
  // comment at the new slot for the full rationale.
  // W13 bonds at END before newsMaintenance — ordering deviation:
  // Mainline runs bondTurn mid-pipeline (after centralBankChairSelection, before
  // corporationTurn) per turnPhaseRegistry.ts. Solo defers the entire W13
  // cluster to the tail before newsMaintenance to avoid shifting shared RNG
  // streams under existing integration goldens — same rule as every other
  // tail cluster above (see recomputeSharePricesPhase comment). Relative
  // order inside this cluster mirrors mainline's real cause-and-effect:
  // sovereignIssuance first (quarterly auction tied to W2 budgets' deficits,
  // plus rollover of maturing principal — so budget debt is current before
  // coupon servicing), then bondCouponMaturity (coupon/maturity servicing
  // against budget debt, plus price/yield vs W3 prime rate), then
  // npcBondHolder (NPP holder behavior drift on the float). All three are
  // rng-free so tail placement has no downstream RNG stream effect beyond
  // the ordering deviation itself, which a dedicated re-golden will restore.
  // #309: recomputeSharePricesPhase follows the cluster (see slot below) so
  // the mainline bondTurn < recomputeSharePrices consumer edge holds.
  sovereignIssuancePhase,
  bondCouponMaturityPhase,
  npcBondHolderPhase,
  // #309: recomputeSharePricesPhase runs here — immediately after the bond
  // cluster — so this turn's repricing reads post-coupon issuer capital,
  // matching mainline (turnPhaseNames.ts: bondTurn 18 < recomputeSharePrices
  // 22; the source even keeps a dedicated recomputeSharePricesAfterBondTurn
  // for exactly this edge). This also preserves mainline's bankingTurn (13)
  // < bondTurn (18) < recomputeSharePrices (22) chain: bankingTurnPhase
  // sits earlier in this tail, so loan-service debits to
  // corp.liquidCapital land before the repricing too. The move is
  // RNG-free (neither the bond phases nor the repricing draw from WorldRng),
  // still strictly after corporationTurnPhase above, and before every
  // downstream reader of share prices (metrics, recordWorldHistory).
  recomputeSharePricesPhase,
  // #328: bankSolvencyTurnPhase immediately after the repricing, exactly
  // as mainline orders bankSolvencyTurn after recomputeSharePrices (see
  // turnPhaseRegistry.ts: "AFTER recomputeSharePrices so prop-book marking
  // can land against fresh prices"). The mark, forced-liquidation shrink,
  // and investment-bank failure test all read this turn's fresh prices;
  // the retail-bank math (confidence, flight, run failure) reads no share
  // prices, so seeded retail-only worlds are unaffected by the slot. Both
  // phases are RNG-free, so no downstream rng stream shifts.
  bankSolvencyTurnPhase,
  // W4 forex at END before newsMaintenance — ordering deviation:
  // Mainline runs ledgerPreForexSnapshot immediately BEFORE forexTurn
  // (stateEffectsPhase.ts: writePreForexBalanceCheckpoint then
  // processForexTurn in Group 12, after inflationRecalc and before
  // centralBankChairTurn). The snapshot must precede the repricing so the
  // reconciler can value cash flow in two legs (see
  // ledger/balanceSnapshot.ts and reconcile.ts cashMovementDelta).
  // Solo defers both to the tail before newsMaintenance to avoid shifting
  // shared RNG streams under existing integration goldens — same rule as
  // every other tail cluster above (see recomputeSharePricesPhase comment).
  // Relative order preserves the causal dependency: ledgerPreForexSnapshot
  // before forexTurn, exactly as mainline. ledgerPreForexSnapshot is
  // rng-free; forexTurn draws deterministic jitter from WorldRng (pegged
  // regimes skip drift, see forex/regime.ts — 1953 managed pegs vs float
  // port faithfully: the Bretton Woods world must NOT float like modern).
  // W7 command economy + W14 sector cleanup, at END before newsMaintenance —
  // same rng-stream-stability rule as every other tail cluster above (all
  // four phases below are RNG-free, but the placement rule is about not
  // shifting every later phase's rng draws for existing goldens, not about
  // this cluster's own rng use). Relative order:
  //   advanceCapitalStock (rolls up world.capitalGrowth for NEXT turn's
  //     macroCountryTurn gK read — see macroCountryTurn.ts file doc) →
  //   unownedSectorGrowth (reads this turn's corp.currentGrowthRate, already
  //     settled by corporationTurnPhase above) →
  //   commandEconomy (drifts marketizationLevel from this turn's
  //     world.governments[countryId].governingPartyId, settled by
  //     governmentFormationPhase above) →
  //   stateOwnershipConcentration (reads the marketizationLevel
  //     commandEconomyPhase JUST drifted, not last turn's — must run after it).
  advanceCapitalStockPhase,
  unownedSectorGrowthPhase,
  commandEconomyPhase,
  stateOwnershipConcentrationPhase,
  // W8 trade, at END before newsMaintenance — mirrors mainline's real
  // ordering (stateEffectsPhase.ts: tradeGrowthMirror → inflationRecalc →
  // commandEconomy → ledgerPreForexSnapshot, all in Group 12 immediately
  // before forex). tradeGrowthMirrorPhase must run after tradeGrowthPhase
  // (which ran earlier, in the W2 budget cluster above) settled this turn's
  // economicFactors.tradeGrowth, and before forexTurnPhase reads
  // centralBanks.tradeGrowth below.
  tradeGrowthMirrorPhase,
  ledgerPreForexSnapshotPhase,
  forexTurnPhase,
  // W33 era crossing at END before newsMaintenance — ordering deviation:
  // mainline runs eraCrossing mid-pipeline (stateEffectsPhase.ts:311, Group
  // "state effects", well before this repo's tail clusters). Solo defers it
  // to the tail before newsMaintenance for the same rng-stream-stability
  // rule as every other tail cluster above (this phase is rng-free anyway —
  // pure comparison + a news push — so the placement is purely for
  // consistency with the rest of this registry's append-only convention).
  // Must run after advanceCalendarPhase (first in this array), which is the
  // only phase that ever changes world.meta.era — see phases/eraCrossing.ts
  // file doc for the full port rationale (why this is the entire substantive
  // effect of mainline's eraCrossing + metricActivation).
  eraCrossingPhase,
  // W25 independence desire / referendum cluster at END before newsMaintenance
  // — ordering deviation: mainline runs independenceDesireDrift and
  // referendumLifecycle mid-pipeline, back to back (stateEffectsPhase.ts:
  // 509-526). Solo defers the pair to the tail before newsMaintenance for
  // the same rng-stream-stability rule as every other tail cluster above
  // (independenceDesireDriftPhase is rng-free; referendumLifecyclePhase
  // draws rng only when a referendum is actually in "polling" status, which
  // never happens in any world produced by createWorld today — see
  // referendum/lifecycle.ts file doc — so placement here has no live rng
  // effect either way; kept at the tail for consistency with the registry's
  // append-only convention). Relative order mirrors mainline exactly:
  // independenceDesireDrift BEFORE referendumLifecycle, "so a settled
  // No-vote dampens the just-updated desire value" (mainline's own comment).
  independenceDesireDriftPhase,
  referendumLifecyclePhase,
  // W6 metric engine cluster at END before newsMaintenance — ordering deviation:
  // Mainline runs these mid-pipeline in stateEffectsAndNationalAggregationPhase:
  // metricDecay (no-op, inside policyEffects), investorConfidenceDecay, metricEngine,
  // demographicFlows, census, eraCrossing, metricActivation, nationalMetrics,
  // fiscalBaseGrowth, economicModel, inflationRecalc, commandEconomy, then
  // ledgerPreForexSnapshot/forexTurn, then many diagnostics ending with
  // economicVitalSigns as the final diagnostic snapshot. Solo defers the entire
  // W6 cluster to the tail before newsMaintenance to avoid shifting shared RNG
  // streams under existing integration goldens — same rule as every other tail
  // cluster above (see recomputeSharePricesPhase comment). Relative order inside
  // this cluster mirrors mainline's causal dependencies:
  //  metricDecay (no-op) → investorConfidenceDecay (heal before nationalMetrics read)
  //  → nationalMetrics (weighted aggregation, era-gated via metricActivation)
  //  → economicModel (reads national metrics + corp revenue + spending)
  //  → inflationRecalc (reads commodity history via annualized change — FIXED wiring,
  //    not level — plus forex, gdpGrowth, unemployment, fiscal; see
  //    metrics/inflationRecalc.ts fix-source comment)
  //  → economicVitalSigns (reads everything, final diagnostic).
  // All six are rng-free (except vital signs' generatedAt timestamp via Date, not WorldRng,
  // so no stream effect). metricActivation is folded into nationalMetrics's era gate
  // (METRIC_ERA_WINDOWS) rather than a standalone phase, per the prompt's
  // "if that phase belongs here" gate.
  metricDecayPhase,
  investorConfidenceDecayPhase,
  nationalMetricsPhase,
  economicModelPhase,
  inflationRecalcPhase,
  economicVitalSignsPhase,
  // W41 WorldHistory recording at the absolute END before newsMaintenance —
  // NOT an ordering deviation from mainline (unlike almost every other tail
  // cluster's comment above): mainline's own history/snapshot family
  // (metricHistory..ledgerReconcile, turnPhaseNames.ts) runs immediately
  // before economicVitalSigns too, i.e. also last. This phase must run after
  // every phase that can still move a recorded metric this turn — macro
  // economy (macroCountryTurnPhase), prime rate (centralBankChairTurnPhase),
  // party PS/treasury (the party cluster), player cash/savings/funds (any
  // action, campaign, or banking phase), bond/share holdings (buyShares/
  // sellShares/buyBond/sellBond are player actions executed before
  // advanceTurn, not phases, but bond marketPrice and corp sharePrice do
  // move inside this turn via bondCouponMaturityPhase/npcBondHolderPhase and
  // recomputeSharePricesPhase) — so tail placement, immediately after
  // economicVitalSignsPhase, is correct rather than a deviation to fix in a
  // future re-golden.
  recordWorldHistoryPhase,
  // W32 cold war / world politics cluster, at END before newsMaintenance —
  // same rng-stream-stability rule as every other tail cluster above (none
  // of these four phases draw rng either way, so the rule here is purely
  // about not reordering every later tail phase's position). Relative order:
  // nuclearProductionPhase first (a warhead built this turn is already
  // counted in this SAME turn's arsenal-pressure term), then warsTurnPhase
  // (a conflict resolved this turn stops contributing war pressure this same
  // turn), then coldWarTensionPhase (reads both). wars/settlement are ported
  // "to the depth mainline models 1953 playables" per the wave brief — see
  // wars/types.ts, alignment/*.ts file docs for the named PORT-STUB blockers
  // (B13-B15) on everything beyond that (multipolar poles, full unit-level
  // combat). internationalOrgs now HAS a registered phase (W42 / #113) — see
  // its own note below; alignment and settlement still have no standalone
  // phase this wave.
  // W42 (issue #113) international organizations, at END of the ported subset
  // in the W32 cold-war/world-politics cluster — same rng-stream-stability
  // rule as every other tail cluster above (this phase is rng-free regardless:
  // it resolves ballots, charges dues/tribute and expires sanctions purely from
  // world state, matching the reference's own deterministic resolver).
  //
  // ORDERING (reference-faithful). Mainline registers `internationalOrganizations`
  // at BASE_TURN_PHASE_NAMES index 81, immediately before `alignment` (82) and
  // `settlement` (83) — the resolver comment requires alignment to read the org
  // memberships this phase writes, and settlement to read the live bloc
  // membership alignment writes. Solo registers neither a standalone alignment
  // nor a standalone settlement phase: settlement is folded into warsTurnPhase
  // and alignment is not registered this wave. So the phase is inserted at the
  // START of the W32 cluster — before nuclearProductionPhase (mainline runs it
  // inside ministerialOrderProcessing, index ~106, i.e. after intlOrgs 81) and
  // before warsTurnPhase (solo's settlement analogue) — preserving mainline's
  // relative order intlOrgs < nuclearProduction/settlement. See
  // internationalOrgs/phases.ts file doc for the named port gaps.
  internationalOrganizationsPhase,
  nuclearProductionPhase,
  warsTurnPhase,
  coldWarTensionPhase,
  // W28 enactment depth cluster, at END before newsMaintenance — same rule.
  // ministerialOrdersPhase before policyEffectsPhase mirrors mainline's
  // documented serialization (crisisTurn -> navairOperations ->
  // ministerialOrders -> policyEffects, stateEffectsPhase.ts:107-126) so
  // policyEffects' target recompute reads the order-shocked nationalMetrics
  // value the same turn, same as mainline.
  ministerialOrdersPhase,
  policyEffectsPhase,
  // W11 (extraction/prospecting) + W35 (player wealth/wires/achievements)
  // batch, at END before newsMaintenance — same rng-stream-stability rule as
  // every other tail cluster above (this codebase runs commodityPrices/
  // contractSettlement mid-pipeline from W1, before this batch existed;
  // inserting resolveProspects/contractOfferAcceptance there would shift
  // every downstream rng draw for existing goldens — see
  // recomputeSharePricesPhase's comment for the general rule this follows).
  // Mainline itself runs prospecting resolution (src/lib/turn/prospecting/
  // resolveProspects.ts) and extraction contract settlement in the same
  // Group as commodity pricing; solo's own contractSettlement is already at
  // its own tail-adjacent slot from W1, so this deviation is consistent with
  // (not additional to) that earlier one.
  //
  // Relative order inside this cluster: resolveProspects (may grow a
  // region's stateResourceCapacities before this turn's contract
  // acceptance/settlement reads it) -> contractOfferAcceptance (NPC
  // corporations claim offered contracts, same-turn as issuance when
  // affordable) -> achievementCheck LAST, so it observes every other
  // phase's writes this same turn (a contract just accepted, a survey that
  // just resolved, funds just wired) before deciding what unlocked.
  // resolveProspectsPhase draws rng (success/yield rolls);
  // contractOfferAcceptancePhase and achievementCheckPhase are both rng-free.
  resolveProspectsPhase,
  contractOfferAcceptancePhase,
  achievementCheckPhase,
  // v43 country political overview at END before newsMaintenance — same
  // rng-stream-stability rule as every other tail cluster above (this phase
  // is RNG-free, so the rule here is purely about append-only ordering).
  // Runs last so approval/legitimacy/unrest read this turn's final macro
  // state (macroCountryTurn early, crisis/budget/forex clusters in the
  // tail all mutate economy/budgets first) and so officers reconcile after
  // electionResolutionPhase settled this turn's composition.
  countryPoliticsPhase,
  newsMaintenancePhase,
];
