/**
 * Action catalog.
 * Ports src/lib/actions.ts ActionDefinition + costs + fundraise quote logic
 * (actions.fundraiseQuote) at mainline-neutral values. Each entry lists cost,
 * cooldown, fund cost, and target system. Entries whose blocking system is not
 * yet ported get PORT-STUB unavailable status so UI can gray them out honestly.
 *
 * Deterministic pure definitions; no RNG.
 */

import { FUNDRAISE_ACTION_COST } from "@ahd/game-rules/actions";
import { advertiseActionCost } from "./favorability.js";
import { fundraiseYield } from "./fundGeneration.js";
import { DEBATE_PREP_ACTION_COST } from "../stats/debatePrep.js";
import { CAMPAIGN_CANVASS_ACTIONS, CAMPAIGN_CANVASS_FUNDS } from "./campaignCanvass.js";
import { CAMPAIGN_TARGETED_AD_ACTIONS, CAMPAIGN_TARGETED_AD_FUNDS } from "./campaignTargetedAd.js";
import { REQUEST_AP_COST } from "../referendum/request.js";
// Party/caucus price constants (#61): one source shared with the domain
// helpers (membership.ts, caucus.ts) and the partyCaucus.ts projection, so the
// displayed quote, the dispatcher's charge and the catalog contract cannot
// drift apart.
import {
  CAUCUS_CREATE_ACTION_COST,
  CAUCUS_CREATE_FUND_COST,
  CAUCUS_DISBAND_ACTION_COST,
  CAUCUS_DISBAND_FUND_COST,
  CAUCUS_JOIN_ACTION_COST,
  CAUCUS_LEAVE_ACTION_COST,
  CAUCUS_TAX_ACTION_COST,
  CAUCUS_TAX_FUND_COST,
  PARTY_FOUND_ACTION_COST,
  PARTY_FOUND_FUND_COST,
  PARTY_JOIN_ACTION_COST,
  PARTY_LEAVE_ACTION_COST,
} from "./partyCaucusCosts.js";

export type ActionId =
  | "buyBond"
  | "sellBond"
  | "issueCorporateBond"
  | "buybackCorporateBond"
  | "fundraise"
  | "campaign"
  | "advertise"
  | "buildDonorBase"
  | "poll"
  | "pollLarge"
  | "convertCash"
  | "rest"
  | "debatePrep"
  | "canvass"
  | "organize"
  | "pressureBoost"
  | "investInfluence"
  | "joinParty"
  | "leaveParty"
  | "foundParty"
  | "createCaucus"
  | "joinCaucus"
  | "leaveCaucus"
  | "setCaucusTaxRate"
  | "disbandCaucus"
  | "influenceNpp"
  | "recruitCaucusNpp"
  | "endorse"
  | "sponsorBill"
  | "voteOnBill"
  | "proposePmAppointment"
  | "votePmAppointment"
  | "repealLaw"
  | "invokeFilibuster"
  | "declareCandidacy"
  | "withdrawCandidacy"
  | "contestPartyLeadership"
  | "votePartyLeadership"
  | "issuePartyWhip"
  | "contestCommittee"
  | "voteCommittee"
  | "createCoalition"
  | "joinCoalition"
  | "initiateCoalitionDisband"
  | "voteCoalitionDisband"
  | "buyShares"
  | "sellShares"
  | "voteCeo"
  | "acceptCeoAppointment"
  | "resignCeo"
  | "setCorporationCompensation"
  | "setCorporateSectorStrategy"
  | "nationalizeCorporation"
  | "crisisBailout"
  | "crisisStimulus"
  | "crisisRespond"
  | "crisisMonitor"
  // M1 (Lane 12 Head of State mode) economic-direction levers: HoS-only,
  // call existing budget pure functions (budget/spending.ts, budget/revenue.ts),
  // never new phase logic. See actions/execute.ts for the mode gate.
  | "adjustBudgetSpending"
  | "adjustTaxRate"
  | "setSubsidyRate"
  | "commandEconomyDirective"
  // W11 extraction/prospecting
  | "launchProspect"
  | "expandRegionalExtraction"
  | "issueExtractionContract"
  | "acceptExtractionContract"
  | "declineExtractionContract"
  | "revokeExtractionContract"
  // W35 player wealth: savings + wires
  | "depositSavings"
  | "withdrawSavings"
  | "moveSavings"
  | "wireTransfer"
  // P0 campaign management (#67): player campaign controls
  | "campaignUpgrade"
  | "campaignRally"
  | "campaignRallyTour"
  | "campaignRetarget"
  | "campaignManager"
  | "buildStatePresence"
  | "setPrimaryCampaignState"
  | "usePrimaryHomeStateSurge"
  | "campaignCanvass"
  | "campaignTargetedAd"
  | "campaignContribute"
  | "declareWar"
  | "offerPeace"
  | "acceptPeace"
  | "requestReferendum"
  // W25 referendum campaign writers (#70): the engine already reads
  // `campaignSpendUnits` + `cohortModifiers`; these are the missing writers.
  | "referendumCampaignSpend"
  | "referendumGroundGame";

// Costs mirror mainline's dynamic tier functions but collapsed to neutral
// goldens for solo's simpler state (no per-state GDP tier). Cited.
export interface ActionCatalogEntry {
  id: ActionId;
  name: string;
  description: string;
  /** Action-point cost (before influence/favorability tier overrides) */
  baseCost: number;
  /** Cooldown in turns after execution before next available */
  cooldown: number;
  /** Fund cost flat (before scaling); 0 means no treasury check */
  fundCost: number;
  /** Target system(s) this action touches */
  systems: string[];
  /** Whether the action is available given ported systems */
  status: "available" | "unavailable";
  /** When unavailable, which blocking system is named */
  blockingSystem?: string;
  /** Compute dynamic cost for an actor's current stats (for UI quote) */
  quotedActionCost?: (donorBaseLevel: number, politicalInfluence: number, favorability: number) => number;
  /** Fundraise quote helper: actions.fundraiseQuote per brief */
  fundraiseQuote?: (donorBaseLevel: number, politicalInfluence: number) => number;
}

// Dynamic helpers ported from src/lib/actions.ts (neutral values)
function campaignActionCost(politicalInfluence: number): number {
  const v = Math.max(0, Math.min(100, politicalInfluence));
  if (v >= 80) return 5;
  if (v >= 60) return 4;
  if (v >= 40) return 3;
  if (v >= 20) return 2;
  return 1;
}

function donorActionCost(donorBaseLevel: number, action: "fundraise" | "buildDonorBase"): number {
  if (action === "fundraise") return FUNDRAISE_ACTION_COST;
  return Math.min(20, Math.round(4 + Math.pow(donorBaseLevel / 75, 1.4) * 16));
}

export const ACTION_CATALOG: Record<ActionId, ActionCatalogEntry> = {
  // W13 bonds: player buy/sell sovereign bond units at mainline pricing (marketPrice × face).
  // Ports src/app/api/bonds/[bondId]/buy+ sell (bondHolderOps reserveBondUnitsForHolder) at neutral fee — solo has no brokerage/markup, same as W10's share trade.
  buyBond: {
    id: "buyBond",
    name: "Buy Bond",
    description: "Buy sovereign bond units from the public float at the current market price. Cost = units × faceValue × marketPrice. Ports bonds purchase at mainline pricing (BOND_UNIT_FACE_VALUE × marketPrice).",
    baseCost: 1,
    cooldown: 0,
    fundCost: 0,
    systems: ["bonds"],
    status: "available",
  },
  sellBond: {
    id: "sellBond",
    name: "Sell Bond",
    description: "Sell sovereign bond units back into the public float at the current market price. Proceeds = units × faceValue × marketPrice.",
    baseCost: 1,
    cooldown: 0,
    fundCost: 0,
    systems: ["bonds"],
    status: "available",
  },
  issueCorporateBond: {
    id: "issueCorporateBond",
    name: "Issue Corporate Bond",
    description: "Issue a currency-denominated corporate bond as the seated CEO. Face value is requested in the accounting anchor and converted to whole units in the issuer's home currency.",
    // AHDGame's corporation bond route is an executive company operation, not
    // a political action-point purchase.
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["corporations", "bonds", "forex"],
    status: "available",
  },
  buybackCorporateBond: {
    id: "buybackCorporateBond",
    name: "Buy Back Corporate Bond",
    description: "Retire public-float units of a corporation's bond as its seated CEO.",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["corporations", "bonds"],
    status: "available",
  },
  fundraise: {
    id: "fundraise",
    name: "Fundraise",
    description: "Raise money from your donor base.",
    baseCost: FUNDRAISE_ACTION_COST,
    cooldown: 0,
    fundCost: 0,
    systems: ["funds"],
    status: "available",
    quotedActionCost: (donor: number) => donorActionCost(donor, "fundraise"),
    fundraiseQuote: (donor, influence) => fundraiseYield(donor, influence),
  },
  campaign: {
    id: "campaign",
    name: "Campaign",
    description: "Increase political influence and candidate support. Cost scales with influence tier.",
    baseCost: 1,
    cooldown: 0,
    fundCost: 20000,
    systems: ["support", "politicalInfluence"],
    status: "available",
    quotedActionCost: (_donor, influence) => campaignActionCost(influence),
  },
  advertise: {
    id: "advertise",
    name: "Run Advertisements",
    description: "Boost favorability via ads. Fund cost scales with favorability tier.",
    baseCost: 5,
    cooldown: 1,
    fundCost: 100_000,
    systems: ["favorability"],
    status: "available",
    quotedActionCost: (_donor, _inf, fav) => advertiseActionCost(fav),
  },
  buildDonorBase: {
    id: "buildDonorBase",
    name: "Build Donor Network",
    description: "Expand donor base; increases future fundraise yield and generation.",
    baseCost: 4,
    cooldown: 0,
    fundCost: 3000,
    systems: ["donorBase"],
    status: "available",
    quotedActionCost: (donor) => donorActionCost(donor, "buildDonorBase"),
  },
  poll: {
    id: "poll",
    name: "Quick Poll",
    description: "Commission a quick poll: see your topline appeal and best/worst demographic groups ($25,000).",
    baseCost: 2,
    cooldown: 0,
    fundCost: 25_000,
    systems: ["polling"],
    status: "available",
  },
  pollLarge: {
    id: "pollLarge",
    name: "Full Demographic Poll",
    description: "Commission a comprehensive poll: full breakdown across every demographic group and category ($75,000).",
    baseCost: 6,
    cooldown: 0,
    fundCost: 75_000,
    systems: ["polling"],
    status: "available",
  },
  convertCash: {
    id: "convertCash",
    name: "Personal Campaign Donation",
    description: "Convert personal cash to campaign funds at 50% (infamy scales with amount).",
    baseCost: 2,
    cooldown: 0,
    fundCost: 0,
    systems: ["cash", "funds", "infamy"],
    status: "available",
  },
  rest: {
    id: "rest",
    name: "Rest",
    description: "Take a break. No effect.",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: [],
    status: "available",
  },
  debatePrep: {
    id: "debatePrep",
    name: "Debate Prep",
    description: "Study briefing books and rehearse. 15% chance to raise your Debate skill by 1. No fund cost. Requires an allocated Debate stat. Ports ACTIONS.debatePrep + rollDebatePrep (src/lib/actions.ts, src/lib/stats/debatePrep.ts); the card text states the coded 15% chance, not the stale 10% label in mainline copy.",
    baseCost: DEBATE_PREP_ACTION_COST,
    cooldown: 0,
    fundCost: 0,
    systems: ["debate"],
    status: "available",
  },
  canvass: {
    id: "canvass",
    name: "Canvass",
    description: "Canvass a chosen demographic in your eligible home or campaign state. Each canvass costs 1 action and 100 anchor campaign funds, converted to home currency. Up to 50 per batch.",
    baseCost: 1,
    cooldown: 0,
    fundCost: 100,
    systems: ["GOTV/turnout"],
    status: "available",
  },
  organize: {
    id: "organize",
    name: "Organize",
    description: "Build regional organization for your party in a target region.",
    baseCost: 4,
    cooldown: 0,
    fundCost: 10000,
    systems: ["org/partyRegions"],
    status: "available",
  },
  pressureBoost: {
    id: "pressureBoost",
    name: "Apply Pressure",
    description: "Increase political pressure for your party in a region.",
    baseCost: 3,
    cooldown: 0,
    fundCost: 8000,
    systems: ["pressure/partyPressures"],
    status: "available",
  },
  investInfluence: {
    id: "investInfluence",
    name: "Invest Party Influence",
    description: "Party influence grants actions automatically each turn.",
    baseCost: 2,
    cooldown: 0,
    fundCost: 0,
    systems: ["partyInfluence"],
    status: "unavailable",
    // No reference action exchanges party clout for AP. Retain the ID only
    // to reject old callers explicitly; partyInfluenceTurn owns passive grants.
    blockingSystem: "no reference action for exchanging party influence",
  },
  joinParty: {
    id: "joinParty",
    name: "Join Party",
    description: "Join a political party. Switching parties has a 24-turn cooldown.",
    baseCost: PARTY_JOIN_ACTION_COST,
    cooldown: 0,
    fundCost: 0,
    systems: ["party/membership"],
    status: "available",
  },
  leaveParty: {
    id: "leaveParty",
    name: "Leave Party",
    description: "Leave your party and become independent. This also ends caucus membership and withdraws conflicting endorsements.",
    baseCost: PARTY_LEAVE_ACTION_COST,
    cooldown: 0,
    fundCost: 0,
    systems: ["party/membership"],
    status: "available",
  },
  foundParty: {
    id: "foundParty",
    name: "Found Party",
    description: "Found a new party via charter machinery (W18). Creates a Party row + ratified Charter, auto-joins founder. Cost 8 AP + 100k funds. Cites src/lib/charters/draftCharter.ts + ratifyCharter.ts and CHARTER_DEADLINE_TURNS=14.",
    baseCost: PARTY_FOUND_ACTION_COST,
    cooldown: 0,
    fundCost: PARTY_FOUND_FUND_COST,
    systems: ["party/charter"],
    status: "available",
  },
  createCaucus: {
    id: "createCaucus",
    name: "Create Caucus",
    description: "Create a caucus inside your current party. Requires party membership and no current caucus. Source POST caucuses/route.ts charges no AP or funds; taxRate 0-5%.",
    baseCost: CAUCUS_CREATE_ACTION_COST,
    cooldown: 0,
    fundCost: CAUCUS_CREATE_FUND_COST,
    systems: ["caucus"],
    status: "available",
  },
  joinCaucus: {
    id: "joinCaucus",
    name: "Join Caucus",
    description: "Join an existing caucus in your party. Requires same party and no current caucus. Source POST members/route.ts charges no AP or funds.",
    baseCost: CAUCUS_JOIN_ACTION_COST,
    cooldown: 0,
    fundCost: 0,
    systems: ["caucus"],
    status: "available",
  },
  leaveCaucus: {
    id: "leaveCaucus",
    name: "Leave Caucus",
    description: "Leave the current caucus. Chairs must disband or hand over first. Source DELETE members/[memberId]/route.ts charges no AP or funds.",
    baseCost: CAUCUS_LEAVE_ACTION_COST,
    cooldown: 0,
    fundCost: 0,
    systems: ["caucus"],
    status: "available",
  },
  setCaucusTaxRate: {
    id: "setCaucusTaxRate",
    name: "Set Caucus Tax Rate",
    description: "Chair-only edit of the caucus campaign-fund levy (0-5%). Ports PATCH src/app/api/country/[code]/parties/[id]/caucuses/[slug]/route.ts, which charges no action points or funds.",
    baseCost: CAUCUS_TAX_ACTION_COST,
    cooldown: 0,
    fundCost: CAUCUS_TAX_FUND_COST,
    systems: ["caucus"],
    status: "available",
  },
  disbandCaucus: {
    id: "disbandCaucus",
    name: "Disband Caucus",
    description: "Chair-only soft-disband: marks the caucus disbanded, clears its members and vacates the chair seats. Ports DELETE src/app/api/country/[code]/parties/[id]/caucuses/[slug]/route.ts, which charges no action points or funds.",
    baseCost: CAUCUS_DISBAND_ACTION_COST,
    cooldown: 0,
    fundCost: CAUCUS_DISBAND_FUND_COST,
    systems: ["caucus"],
    status: "available",
  },
  influenceNpp: {
    id: "influenceNpp",
    name: "Influence NPP",
    description: "Personal relationship influence of a same-country NPP. Relationship-only types (loyalty, favorability, influence, cooperation) write relationship; they do not mutate NPP statistics. Costs and chance come from src/lib/influence. Dedicated npp-influence RNG stream.",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["npp/relationship"],
    status: "available",
  },
  recruitCaucusNpp: {
    id: "recruitCaucusNpp",
    name: "Recruit NPP to Caucus",
    description: "Chair-only free recruitment of a same-party, same-country NPP with relationship at least 60. Source POST members/route.ts memberType=npp charges no AP or funds. 12-turn caucus-global cooldown.",
    baseCost: 0,
    cooldown: 0,
    fundCost: CAUCUS_DISBAND_FUND_COST,
    systems: ["caucus"],
    status: "available",
  },
  endorse: {
    id: "endorse",
    name: "Endorse",
    description: "Endorse a party or politician. Active endorsement gives +3 support to candidateSupports (SUPPORT_ENDORSEMENT_BUMP=3 per src/lib/electionEngine/electionFormulaFactors.ts). Sweep withdraws cross-party endorsements on switch.",
    baseCost: 2,
    cooldown: 0,
    fundCost: 0,
    systems: ["endorsement/support"],
    status: "available",
  },
  sponsorBill: {
    id: "sponsorBill" as ActionId,
    name: "Sponsor Bill",
    description: "Propose a bill from the legislation catalog. Requires holding a legislative seat (career) or government sponsorship (HoS). Costs 10 AP and 5 NPI per ordinary policy provision; tariff provisions cost no NPI.",
    baseCost: 10,
    cooldown: 1,
    fundCost: 0,
    systems: ["legislation/bills"],
    status: "available",
  },
  voteOnBill: {
    id: "voteOnBill" as ActionId,
    name: "Vote on Bill",
    description: "Cast a vote on an active bill in your chamber. Requires holding a seat in the bill's current chamber. Cost 1 AP. Ports bill voting chamber scope.",
    baseCost: 1,
    cooldown: 0,
    fundCost: 0,
    systems: ["legislation/voting"],
    status: "available",
  },
  proposePmAppointment: {
    id: "proposePmAppointment",
    name: "Nominate Head of Government",
    description: "An elected member who chairs a party with enough seats may nominate themselves for a 24-turn appointment vote.",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["government/pmAppointment"],
    status: "available",
  },
  votePmAppointment: {
    id: "votePmAppointment",
    name: "Vote on Government Appointment",
    description: "Cast an aye or nay in an active parliamentary appointment vote.",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["government/pmAppointment"],
    status: "available",
  },
  repealLaw: {
    id: "repealLaw" as ActionId,
    name: "Repeal Law",
    description: "Propose repeal of an enacted law. Requires holding a seat; creates a repeal bill. Ports mainline expiry/repeal model.",
    baseCost: 4,
    cooldown: 1,
    fundCost: 0,
    systems: ["legislation/repeal"],
    status: "available",
  },
  invokeFilibuster: {
    id: "invokeFilibuster" as ActionId,
    name: "Invoke Filibuster",
    description: "Invoke filibuster on a senate bill, raising bar to 3/5 of votes cast (quorum rule). Costs 2 AP. Ports didPassWithFilibusterCheck.",
    baseCost: 2,
    cooldown: 0,
    fundCost: 0,
    systems: ["legislation/cloture"],
    status: "available",
  },
  declareCandidacy: {
    id: "declareCandidacy",
    name: "Declare Candidacy",
    description: "File for an open or upcoming race in your home state and country. Party ballot line; one active candidacy at a time.",
    baseCost: 2,
    cooldown: 0,
    // NO reference filing fee. #99 claimed a "zero-cost PORT-STUB filing fee",
    // but the reference national candidacy command
    // (AHDGame src/app/api/elections/[id]/enter/route.ts) charges none: a
    // case-insensitive scan for fee/funds/cost/balance/deduct/debit matches
    // nothing and its only write is electionCandidates.insertOne (L328).
    // fundCost 0 is therefore exact parity, not a stub. baseCost 2 is solo's
    // own action-economy AP charge (the reference route is not AP-priced).
    // Gate mapping and evidence live in elections/candidacy.ts.
    fundCost: 0,
    systems: ["elections"],
    status: "available",
  },
  withdrawCandidacy: {
    id: "withdrawCandidacy",
    name: "Withdraw Candidacy",
    description: "Withdraw from a race before it resolves.",
    baseCost: 0,
    cooldown: 0,
    // Reference POST /api/elections/[id]/withdraw also charges no fee.
    fundCost: 0,
    systems: ["elections"],
    status: "available",
  },
  contestPartyLeadership: {
    id: "contestPartyLeadership",
    name: "Contest Party Leadership",
    description: "Enter a state or national party leadership race (chair/viceChair/treasurer) for your current party. State races require home-region residence; leadership requires 24 turns of current-party tenure; founding elections and founders are exempt. Cost 2 AP.",
    baseCost: 2,
    cooldown: 0,
    fundCost: 0,
    systems: ["intraparty/partyElections"],
    status: "available",
  },
  votePartyLeadership: {
    id: "votePartyLeadership",
    name: "Vote in Party Leadership Election",
    description: "Cast a single-choice ballot in a state or national party leadership election. State races require home-region residence; committee-method national races are limited to committee members and party officers. Cost 1 AP.",
    baseCost: 1,
    cooldown: 0,
    fundCost: 0,
    systems: ["intraparty/partyElections"],
    status: "available",
  },
  issuePartyWhip: {
    id: "issuePartyWhip",
    name: "Issue Party Whip",
    description: "Issue a bill-specific national party instruction. The national chair or acting vice chair may set a hard or soft for/against/abstain direction, which NPP bill voting follows and persists through save/reload. Cost 2 AP.",
    baseCost: 2,
    cooldown: 0,
    fundCost: 0,
    systems: ["intraparty/partyWhip", "legislation/voting"],
    status: "available",
  },
  contestCommittee: {
    id: "contestCommittee",
    name: "Contest Committee Seat",
    description: "Enter the national committee election for your party (6 seats, up to 6 votes per voter). Ports src/lib/nationalCommitteeElections.ts COMMITTEE_SIZE=6, MAX_VOTES_PER_VOTER=6.",
    baseCost: 2,
    cooldown: 0,
    fundCost: 0,
    systems: ["intraparty/committee"],
    status: "available",
  },
  voteCommittee: {
    id: "voteCommittee",
    name: "Vote in Committee Election",
    description: "Cast ballot for up to 6 candidates in a committee election. Ports NationalCommitteeVote candidateIds tally. NPC votes by ballot.ts pickCommitteeCandidatesForVoter (NPP logic). Cost 1 AP.",
    baseCost: 1,
    cooldown: 0,
    fundCost: 0,
    systems: ["intraparty/committee"],
    status: "available",
  },
  createCoalition: {
    id: "createCoalition",
    name: "Create Coalition",
    description: "Found a coalition with your current party as lead. Requires the national chair or acting vice chair; names and party membership must be unique within the country. Cost 3 AP.",
    baseCost: 3,
    cooldown: 0,
    fundCost: 0,
    systems: ["coalition"],
    status: "available",
  },
  joinCoalition: {
    id: "joinCoalition",
    name: "Join Coalition",
    description: "Join an existing coalition with your current party. Requires the national chair or acting vice chair and rejects cross-country or duplicate membership.",
    baseCost: 2,
    cooldown: 0,
    fundCost: 0,
    systems: ["coalition"],
    status: "available",
  },
  initiateCoalitionDisband: {
    id: "initiateCoalitionDisband",
    name: "Initiate Coalition Disband Vote",
    description: "Start a majority disband vote in your coalition as national chair or acting vice chair. Expires in 168 turns; threshold floor(n/2)+1. Cost 2 AP.",
    baseCost: 2,
    cooldown: 0,
    fundCost: 0,
    systems: ["coalition/disband"],
    status: "available",
  },
  voteCoalitionDisband: {
    id: "voteCoalitionDisband",
    name: "Vote on Coalition Disband",
    description: "Cast yes/no on an active coalition disband vote. One vote per member party, majority wins. Ports coalitionDisbandCheck majority logic.",
    baseCost: 1,
    cooldown: 0,
    fundCost: 0,
    systems: ["coalition/disband"],
    status: "available",
  },
  // W10 markets. No AP/fund-tier cost: mainline's buyPublicShares/
  // sellPublicShares are plain API calls gated only by cash/float/treasury,
  // not the political action-point economy — baseCost/fundCost stay 0 and
  // the real cost (shares * corp.sharePrice, no brokerage fee — see
  // market/constants.ts) is checked directly in execute.ts against
  // params.shares and the target corp. Listed here anyway (per the wave
  // brief) so buy/sell shares up through the same typed catalog/execute
  // surface every other action does, for a consistent UI dispatch path.
  buyShares: {
    id: "buyShares",
    name: "Buy Shares",
    description: "Buy shares from a corporation's public float at the current market price. Cost = shares x sharePrice, credited to the issuing corporation's own treasury (mainline's treasury-backed market maker, buyPublicShares.ts).",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["market"],
    status: "available",
  },
  sellShares: {
    id: "sellShares",
    name: "Sell Shares",
    description: "Sell shares back into a corporation's public float at the current market price. Proceeds are paid from the issuing corporation's own treasury (buyback), capped by what it can cover — sellPublicShares.ts.",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["market"],
    status: "available",
  },
  // Source: AHDGame corporations/[id]/ceo/{vote,accept,resign}. Native has one
  // persistent player identity and stores the weighted shareholder ballot in
  // the corporation save record.
  voteCeo: {
    id: "voteCeo",
    name: "Vote for CEO",
    description: "Cast your shareholder vote for a corporation CEO candidate.",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["corporation/governance"],
    status: "available",
  },
  acceptCeoAppointment: {
    id: "acceptCeoAppointment",
    name: "Accept CEO Appointment",
    description: "Accept the CEO appointment offered by the corporation's shareholders.",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["corporation/governance"],
    status: "available",
  },
  resignCeo: {
    id: "resignCeo",
    name: "Resign as CEO",
    description: "Resign from your corporation CEO position and leave the seat vacant.",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["corporation/governance"],
    status: "available",
  },
  setCorporationCompensation: {
    id: "setCorporationCompensation",
    name: "Set CEO Salary and Dividend Rate",
    description: "Set the corporation's per-turn CEO salary and dividend rate as its CEO.",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["corporation/governance", "corporation/dividends"],
    status: "available",
  },
  setCorporateSectorStrategy: {
    id: "setCorporateSectorStrategy",
    name: "Retool Corporate Sector",
    description: "As the seated CEO, change a source-supported sector's operating strategy. Era and tech availability, retooling fees, capacity conversion, transition and cooldown apply.",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["corporations", "corporation/plants", "commodity-markets"],
    status: "available",
  },
  nationalizeCorporation: {
    id: "nationalizeCorporation",
    name: "Nationalize Corporation",
    description: "As the sitting head of government, seize an NPC-owned domestic corporation or a player firm past the source distress grace into state ownership. The emergency seizure tier pays no shareholder compensation and applies the source transition haircut.",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["nationalization/state-ownership"],
    status: "available",
  },
  // ── W31 crisis action hooks ─────────────────────────────────────
  // Crisis responses where mainline gives players crisis interaction decision
  // trees (src/lib/crises/interactionEngine.ts + templates.ts decisionTree).
  // In solo, each active crisis can be responded to once via a costed action;
  // the optionActions hook (crisisResponseOptions in events/crisis.ts) runs
  // the chosen response's effect (shorten duration, treasury cost). These
  // actions are gated on an active crisis for the player's country — when
  // none is active they are available but no-op (same as mainline's
  // interactionEngine autoResolveOnExpiry fallback). Source: src/lib/crises/optionActions.ts
  crisisBailout: {
    id: "crisisBailout",
    name: "Authorize Crisis Bailout",
    description: "Inject treasury funds to shorten an active banking crisis by 3 turns. Ports crisis.bankingCrisis bailout_yes option (costs 2% GDP). Requires active crisis for player's country; otherwise no-op.",
    baseCost: 4,
    cooldown: 1,
    fundCost: 20000,
    systems: ["crisis"],
    status: "available",
  },
  crisisStimulus: {
    id: "crisisStimulus",
    name: "Pass Crisis Stimulus",
    description: "Stimulus package to shorten an active recession by 2 turns. Ports crisis.recession stimulus_moderate option (costs 1.5% GDP). Requires active crisis for player's country; otherwise no-op.",
    baseCost: 4,
    cooldown: 1,
    fundCost: 15000,
    systems: ["crisis"],
    status: "available",
  },
  crisisRespond: {
    id: "crisisRespond",
    name: "Coordinate Crisis Response",
    description: "Generic crisis response: mobilize government to shorten any active crisis by 1 turn. Ports crisis interaction generic fallback (W34 action catalog hook).",
    baseCost: 3,
    cooldown: 1,
    fundCost: 5000,
    systems: ["crisis"],
    status: "available",
  },
  crisisMonitor: {
    id: "crisisMonitor",
    name: "Monitor Crisis",
    description: "Take no direct action on the active crisis. No cost beyond 1 AP, crisis runs its course. Ports crisis interaction wait/decline option.",
    baseCost: 1,
    cooldown: 0,
    fundCost: 0,
    systems: ["crisis"],
    status: "available",
  },
  // ── M1 economic-direction levers (Lane 12 Head of State mode) ─────
  // HoS-only (execute.ts gates on player.mode === "hos"); each real lever
  // below calls an existing pure budget function (budget/spending.ts
  // calculateBudgetSpending, budget/revenue.ts calculateBudgetRevenue) —
  // no new phase logic, mirrors the crisis actions' pattern of a costed
  // action wrapping an existing calculation. Unported levers stay
  // "unavailable" with a named blocker so the HoS UI can gray them out
  // honestly instead of pretending the dial exists.
  adjustBudgetSpending: {
    id: "adjustBudgetSpending",
    name: "Direct Spending",
    description: "Direct a federal spending category to a new absolute value. The costed proposal enacts at the next turn boundary. Head of State mode only. Cost 3 AP.",
    baseCost: 3,
    cooldown: 0,
    fundCost: 0,
    systems: ["budget"],
    status: "available",
  },
  adjustTaxRate: {
    id: "adjustTaxRate",
    name: "Set Tax Rate",
    description: "Direct a federal tax rate from 0 to 100%. The costed proposal phases in from the next turn boundary like enacted tax law (max 1 point per turn). Head of State mode only. Cost 3 AP.",
    baseCost: 3,
    cooldown: 0,
    fundCost: 0,
    systems: ["budget"],
    status: "available",
  },
  // Player-authored national subsidy enact/end (#94). The reference
  // (AHDGame subsidyEffects.ts at 08820d1) carries no rate dial: subsidies
  // deliver a fixed SUBSIDY_MARGIN_BONUS margin at a fixed deadweight cost,
  // so this action proposes fixed-bonus provisions rather than setting a rate.
  // The ordinary billLifecycle vote/sign path writes the subsidy record; the
  // live subsidyBudgetPhase charges its cost from corporation revenue. National
  // scope only (solo has no state-budget subsidy writer).
  setSubsidyRate: {
    id: "setSubsidyRate",
    name: "Set Subsidy Rate",
    description: "Propose a national subsidy or its end through legislation. Proposals cost 10 AP; fixed reference bonus/cost. Requires Head of State authority or a legislative seat in the player's country.",
    baseCost: 10,
    cooldown: 0,
    fundCost: 0,
    systems: ["budget/subsidies"],
    status: "available",
  },
  // HoS queues the modeled Gosbank levers. The Native kernel applies them at
  // the next turn boundary and feeds them into source-backed marketization
  // policy stance. Per-SOE quotas and directed enterprise credit remain outside
  // the Native state model.
  commandEconomyDirective: {
    id: "commandEconomyDirective",
    name: "Command Economy Directive",
    description: "Queue Gosbank credit aggressiveness and budget softness for next turn in an active planned economy. Head of State mode only; no AP cost.",
    // The source Gosbank endpoint updates the saved directive without an AP debit.
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["commandEconomy"],
    status: "available",
  },
  // ── W11 extraction/prospecting ──────────────────────────────────
  // Government (HoS-mode) actions only — see extraction/prospecting.ts and
  // extraction/contracts.ts file docs for the state-level/issuer-authority
  // PORT-STUBs. fundCost is 0: cost is paid from the country treasury
  // (world.budgets), not the player's personal campaign funds, so it is
  // charged directly in execute.ts rather than through the generic fundCost
  // gate (same pattern crisisBailout's treasury-costed sibling actions do
  // NOT use — those DO use fundCost/actor.funds; extraction cost instead
  // comes out of the country's treasuryBalance, which can go negative/borrow
  // like every other government spend in this codebase).
  launchProspect: {
    id: "launchProspect",
    name: "Commission Geological Survey",
    description: "Launch a national government geological survey for a resource in a region. Cost escalates with prior successes there. Requires Head of State mode. Ports src/lib/extraction/commands/launchGovernmentProspect.ts (national level only).",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["extraction/prospecting"],
    status: "available",
  },
  expandRegionalExtraction: {
    id: "expandRegionalExtraction",
    name: "Expand Extraction Operations",
    description: "Open a source-backed extraction operation in a resource region as the active CEO of its national extraction corporation. The corporation pays the era-scaled source expansion fee.",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["corporations", "extraction"],
    status: "available",
  },
  issueExtractionContract: {
    id: "issueExtractionContract",
    name: "Issue Extraction Contract",
    description: "Offer an extraction contract to your country's extraction corporation for a resource/region: share, royalty rate, term, and signing fee. Requires Head of State mode. Ports src/lib/extraction/commands/issueContractOffer.ts (national level only).",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["extraction/contracts"],
    status: "available",
  },
  acceptExtractionContract: {
    id: "acceptExtractionContract",
    name: "Accept Extraction Contract",
    description: "Accept an open extraction offer as its corporation's active CEO. The signing fee is charged to the corporation and credited to the issuing government.",
    baseCost: 0, cooldown: 0, fundCost: 0,
    systems: ["extraction/contracts"], status: "available",
  },
  declineExtractionContract: {
    id: "declineExtractionContract",
    name: "Decline Extraction Contract",
    description: "Decline an open extraction offer as its corporation's active CEO.",
    baseCost: 0, cooldown: 0, fundCost: 0,
    systems: ["extraction/contracts"], status: "available",
  },
  revokeExtractionContract: {
    id: "revokeExtractionContract",
    name: "Revoke Extraction Contract",
    description: "Revoke a contract as the same national or regional authority that issued it.",
    baseCost: 0, cooldown: 0, fundCost: 0,
    systems: ["extraction/contracts"], status: "available",
  },
  // ── W35 player wealth: savings + wires ──────────────────────────
  depositSavings: {
    id: "depositSavings",
    name: "Deposit to Savings",
    description: "Move personal cash into your savings balance. Ports src/app/api/character/savings/deposit/route.ts core balance move.",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["finance/savings"],
    status: "available",
  },
  withdrawSavings: {
    id: "withdrawSavings",
    name: "Withdraw from Savings",
    description: "Move savings back into personal cash. Ports the withdraw sibling of the deposit route.",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["finance/savings"],
    status: "available",
  },
  moveSavings: {
    id: "moveSavings",
    name: "Move Savings Holder",
    description: "Move your savings to the central bank or an active deposit-taking bank charter. Ports src/app/api/character/savings-holder/route.ts moveCharacterSavings.",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["finance/savings"],
    status: "available",
  },
  wireTransfer: {
    id: "wireTransfer",
    name: "Wire Transfer",
    description: "Wire personal funds to another politician, cross-border included: the transfer currency travels with the transfer (no conversion, no fee) and the daily cap is anchor-denominated. Ports src/app/api/characters/[id]/wire/route.ts core transfer + quota (see finance/wireTransfer.ts).",
    baseCost: 1,
    cooldown: 0,
    fundCost: 0,
    systems: ["finance/wire"],
    status: "available",
  },
  campaignUpgrade: {
    id: "campaignUpgrade",
    name: "Campaign Upgrade",
    description: "Buy a campaign lever starter or branch tier for your active race. Costs campaign funds and campaign actions from the exact upgrade table (general-phase surcharge applies); spend feeds the money driver. Ports upgradeCampaign.",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["campaign"],
    status: "available",
  },
  campaignRally: {
    id: "campaignRally",
    name: "Campaign Rally",
    description: "Fire a one-shot rally for your active campaign. Spends campaign actions and applies immediate plus trailing candidate support; once per turn.",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["campaign/support"],
    status: "available",
  },
  campaignRallyTour: {
    id: "campaignRallyTour",
    name: "Campaign Rally Tour",
    description: "Start or stop a recurring campaign rally tour. Each active turn spends the race-scaled tour tick cost and applies the standard rally support split.",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["campaign/support"],
    status: "available",
  },
  campaignRetarget: {
    id: "campaignRetarget",
    name: "Retarget opposition research",
    description: "Select the active opponent who receives your campaign's opposition-research drain.",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["campaign/opposition-research"],
    status: "available",
  },
  campaignManager: {
    id: "campaignManager",
    name: "Set campaign manager",
    description: "Choose a same-country politician to represent the campaign manager.",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["campaign/management"],
    status: "available",
  },
  buildStatePresence: {
    id: "buildStatePresence",
    name: "Build campaign presence",
    description: "Spend campaign actions and funds to build a source-priced presence level in a US state.",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["elections/presidential-primary-presence"],
    status: "available",
  },
  setPrimaryCampaignState: {
    id: "setPrimaryCampaignState",
    name: "Campaign in a primary state",
    description: "Move your primary campaign to a US state; the action cost follows that state's source electoral-vote tier.",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["elections/presidential-primary-campaign"],
    status: "available",
  },
  usePrimaryHomeStateSurge: {
    id: "usePrimaryHomeStateSurge",
    name: "Use home-state primary surge",
    description: "Spend 3 actions and $25,000 for the source 15% vote boost in your home state for this primary.",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["elections/presidential-primary-campaign"],
    status: "available",
  },
  campaignCanvass: {
    id: "campaignCanvass",
    name: "Canvass voters",
    description: "Spend one action and 100 funds to boost turnout for a demographic group in the campaign region.",
    baseCost: CAMPAIGN_CANVASS_ACTIONS,
    cooldown: 0,
    fundCost: CAMPAIGN_CANVASS_FUNDS,
    systems: ["campaign/targeting"],
    status: "available",
  },
  campaignTargetedAd: {
    id: "campaignTargetedAd",
    name: "Buy targeted ads",
    description: "Spend one action and 100 funds to buy targeted ads for a demographic group in the campaign region.",
    baseCost: CAMPAIGN_TARGETED_AD_ACTIONS,
    cooldown: 0,
    fundCost: CAMPAIGN_TARGETED_AD_FUNDS,
    systems: ["campaign/targeting"],
    status: "available",
  },
  // #68: campaign-strength contribution. baseCost/fundCost are 0 in the
  // catalog because the real cost is DYNAMIC — it depends on the natural-
  // influence-derived click yield (`nationalInfluence * 0.75`) and the
  // campaign's current strength (campaigns/campaignStrength.ts), and is charged
  // directly in actions/campaignContribute.ts after its own validation (same
  // pattern as campaignUpgrade). Presidential races only.
  campaignContribute: {
    id: "campaignContribute",
    name: "Contribute Campaign Strength",
    description: "Spend campaign funds and actions to add campaign strength to your own or a rival's presidential campaign. Each click buys nationalInfluence × 0.75 strength; x1 / x5 / Max quotes come from the reference formulas. Strength raises the recipient's vote tally through the shared saturation curve (soft-capped at +100%), and the cost scales with the strength bought and already held. Ports the contribution formulas from campaignStrength.ts.",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["campaign/strength"],
    status: "available",
  },
  declareWar: {
    id: "declareWar",
    name: "Declare War",
    description: "Unavailable until Native ports the source legislative authorization and unit-level combat model.",
    baseCost: 4,
    cooldown: 0,
    fundCost: 0,
    systems: ["war/declaration", "war/combat"],
    status: "unavailable",
    blockingSystem: "war declaration legislation and unit-level combat",
  },
  offerPeace: {
    id: "offerPeace",
    name: "Offer Peace",
    description: "Unavailable until Native ports bilateral peace offers and source-backed term negotiation.",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["war/peace"],
    status: "unavailable",
    blockingSystem: "peace offer and term negotiation",
  },
  acceptPeace: {
    id: "acceptPeace",
    name: "Accept Peace",
    description: "Unavailable until Native ports peace acceptance, term application, and bilateral truce enforcement.",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["war/peace", "war/truce"],
    status: "unavailable",
    blockingSystem: "peace acceptance, term application, and truce enforcement",
  },
  requestReferendum: {
    id: "requestReferendum",
    name: "Request Referendum",
    description: "Request and grant a UK devolved-region independence or reunification referendum once desire reaches 60. Passed votes open Westminster/Dáil consent and complete through the saved actuation lifecycle.",
    baseCost: REQUEST_AP_COST,
    cooldown: 0,
    fundCost: 0,
    systems: ["devolution/referendum"],
    status: "available",
  },
  // #70 campaign writers. baseCost/fundCost are 0: the real cost is charged
  // inside the action after its own validation — the campaign spend debits the
  // player party's Political Strength (@see referendum/campaign.ts), the ground
  // game debits the player's Actions + Campaign Funds (the source preset card
  // cost, @see referendum/groundGame.ts). Same pattern as campaignContribute.
  referendumCampaignSpend: {
    id: "referendumCampaignSpend",
    name: "Spend on Referendum Campaign",
    description: "Spend Political Strength on your party's side of an open referendum campaign. Each unit nudges the Yes share with diminishing returns. A party may only fund its mapped side.",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["devolution/referendum/campaign"],
    status: "available",
  },
  referendumGroundGame: {
    id: "referendumGroundGame",
    name: "Run Referendum Ground Game",
    description: "Run a preset campaign action (rally, canvass, ads, GOTV) for one side of an open referendum, across the whole electorate or one targeted cohort. Costs the preset's Campaign Funds and Actions and moves the cohort model the vote resolves on.",
    baseCost: 0,
    cooldown: 0,
    fundCost: 0,
    systems: ["devolution/referendum/ground-game"],
    status: "available",
  },
};

export function getActionCost(entry: ActionCatalogEntry, donorBaseLevel: number, politicalInfluence: number, favorability: number): number {
  if (entry.quotedActionCost) return entry.quotedActionCost(donorBaseLevel, politicalInfluence, favorability);
  return entry.baseCost;
}

// For tests: actions.fundraiseQuote. An optional stat block scales the quote by
// the fundraising efficacy multiplier so the displayed quote and the granted
// amount read one source (executeAction passes the actor's stats).
export function fundraiseQuote(donorBaseLevel: number, politicalInfluence: number, stats?: { fundraising?: number }): number {
  return fundraiseYield(donorBaseLevel, politicalInfluence, stats);
}
