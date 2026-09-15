import type { LegislationDetailsQuery, LegislationSelection } from "./legislationDetails";
import type { Preferences } from "../preferences";
import type { WorldOverviewView } from "./worldOverview";
import type { NationView } from "./nation";
import type { PoliticsView } from "./politics";
import type { ResourceDetailsView } from "./resources";
export type WorldInitialization = "historical" | "founding";
export type CharacterRace = "white" | "black" | "hispanic" | "asian" | "other";
export type CharacterGender = "male" | "female" | "nonbinary";
export type CharacterEducation = "no_college" | "college" | "graduate";
export type CharacterWealth = "low" | "middle" | "high";
export interface CharacterDemographics {
  race: CharacterRace;
  gender: CharacterGender;
  education: CharacterEducation;
  wealth: CharacterWealth;
}
/**
 * #242 character-creation file. Captured by the CharacterCreationScreen after
 * world setup and handed to the engine through createWorld. Every field maps to
 * a persisted engine field; nothing is UI-only.
 */
export interface CharacterCreation {
  /**
   * Character name captured on the creation screen. World setup also collects a
   * player name; the creation screen may change it, and the changed value is
   * what persists and shows on the profile. Undefined falls back to the
   * world-setup player name.
   */
  name?: string;
  /**
   * Home region/state chosen on the creation screen. World setup also collects
   * one; a changed value here is what persists and drives the home-state race
   * gate. Undefined falls back to the world-setup home region.
   */
  homeRegionId?: string;
  /** Null = Independent (a deliberate reference choice, not a default). */
  partyId: string | null;
  policies: { economic: number; social: number };
  demographics: CharacterDemographics;
  /** Full seven-key RPG stat allocation (28-point budget). */
  stats: Record<string, number>;
  /** Optional offline portrait/header raster data URLs. */
  avatarUrl?: string | null;
  profileHeaderUrl?: string | null;
}
export interface NewGameOptions { era: string; countryId: string; playerName: string; seed: string; mode?: "career" | "hos"; homeRegionId?: string; initialization?: WorldInitialization; creation?: CharacterCreation; }
export interface EraChoice {
  id: string;
  label: string;
  countries: {
    id: string;
    name: string;
    regions: { id: string; name: string }[];
    /** National executive office key from the engine registry; null when none exists. */
    headOfStateOffice: string | null;
    /** Governing-party preview per initialization; null when that start has no bindable party. */
    rulingPartyByInitialization: Record<WorldInitialization, { id: string; name: string; abbreviation: string } | null>;
  }[];
}
export interface MetricView { id: string; label: string; value: number; format: "money" | "percent" | "number"; }
export type ActionCategory = "influence" | "fundraising" | "intelligence" | "executive";
export interface ActionView { id: string; name: string; description: string; cost: number; fundsGain?: number; available: boolean; disabledReason?: string; requires?: "amount" | "party" | "region" | "budgetSpending" | "taxRate";
  /** Hub grouping, mirroring AHDGame actions categories (influence/money/research). */
  category?: ActionCategory;
  /** Quoted fund cost from the engine projection; executeAction remains authoritative. */
  fundCost?: number;
  /** Turns until the cooldown clears; 0 when ready. */
  cooldownTurns?: number;
  /** Static non-cost gate (membership, donor network, cash, target selection). */
  prerequisite?: string;
  /**
   * What the action does on success (membership/treasury/cooldown/state),
   * built from the engine's party/caucus effect projection (#61) so the panel
   * states the consequence before confirmation.
   */
  consequences?: string[];
}
export interface PartyView { id: string; name: string; abbreviation: string; color: string; members: number; treasury: number; isPlayerParty: boolean; membership?: { join: ActionView; leave: ActionView }; }
/** Derived race lifecycle stage; see game/racePhase.ts. */
export type RacePhase = "upcoming" | "primary" | "general" | "resolved";
export interface ElectionView {
  id: string; title: string; status: string; date: string; filingDate: string;
  /** Recorded engine race kind (e.g. "president", "house"); drives destination routing. */
  electionType: string;
  phase: RacePhase;
  playerCandidate: boolean; candidateNames: string[]; winnerNames: string[];
  /** Counted tally evidence for the footer/race chips; null until votes exist. */
  countedVotes: number | null;
  leaderName: string | null; leaderShare: number | null; marginPct: number | null;
  /** Saved tally seat estimate; null when absent or already resolved. */
  seatProjection: { name: string; seats: number }[] | null;
  candidacy: ActionView;
}
export interface NewsView { id: string; title: string; body: string; date: string; }
/** Chamber destination/label from the legislature configuration. */
export interface LegislatureChamberView {
  key: string;
  name: string;
  shortName: string;
  seats: number;
  elected: boolean;
  description: string | null;
  activeCount: number;
  completedCount: number;
}
/** Chamber committee plus the active bills referred to it. */
export interface LegislatureCommitteeView {
  id: string;
  name: string;
  chamberKey: string;
  chamberName: string;
  jurisdiction: string[];
  chairName: string | null;
  memberCount: number;
  activeBillIds: string[];
}
/** Open bill with its status and next procedural action. */
export interface LegislatureScheduleView {
  billId: string;
  title: string;
  chamberKey: string;
  chamberName: string;
  status: string;
  statusLabel: string;
  nextAction: string;
  dueTurn: number | null;
  overdue: boolean;
}
/** Slim poll group row for display; full engine rows stay in the save. */
export interface PollGroupView { id: string; name: string; appeal: number; weightedPotential: number; turnoutPct: number; estimatedSharePct?: number; }
export interface PollCategoryView { id: string; name: string; weight: number; totalPotentialVoters: number; groups: PollGroupView[]; }
export interface GranularPollCellView {
  id: string; label: string; sharePct: number; turnoutPct: number;
  playerSharePct: number; undecidedPct: number;
}
export interface StoredPollView {
  kind: "quick" | "full"; takenAtTurn: number; takenAt: string; homeRegion: string;
  overallAppeal: number; totalEstimatedVoters: number; totalPotentialVoters: number;
  topGroups: PollGroupView[]; bottomGroups: PollGroupView[];
  categories?: PollCategoryView[];
  inRace?: { myVotes: number; opponents: { id: string; name: string; party: string; votes: number }[] };
  granular: { dimensions: string[]; cells: GranularPollCellView[] };
}
/** Latest commissioned polls (ports the stored lastPoll / lastPollLarge the poll UI reads). */
export interface PollingView { quick: StoredPollView | null; full: StoredPollView | null; }
export interface LegislatureView {
  office: string | null;
  /** Playable country the legislature belongs to; keys persisted nav context. */
  countryId?: string;
  proposals: { id: string; title: string; description: string }[];
  sponsor: ActionView;
  bills: { id: string; title: string; status: string; chamber: string; chamberKey?: string; sponsorName: string;
    votesFor: number; votesAgainst: number; votesAbstain: number;
    playerVote: "for" | "against" | "abstain" | null; voting: ActionView; }[];
  /** Configured chambers for this country (index.ts projection). */
  chambers?: LegislatureChamberView[];
  /** Committees for this country with their active bill queues. */
  committees?: LegislatureCommitteeView[];
  /** Floor schedule of open bills (status + next action). */
  schedule?: LegislatureScheduleView[];
}
export interface FinanceView {
  cash: number; savings: number; currency: string; savingsHolder: string;
  holdings: { id: string; name: string; ticker: string; shares: number; price: number; currency: string }[];
  deposit: ActionView; withdraw: ActionView;
}
export interface GameView {
  turn: number; date: string; era: string; countryId: string; countryName: string;
  player: { name: string; cash: number; funds: number; actions: number; influence: number; favorability: number; partyName: string; mode: "career" | "hos"; hosPartyId: string | null; homeRegionId: string | null; permanentHeadOfState?: boolean; currentOffice?: string | null; };
  legislature: LegislatureView;
  finance: FinanceView;
  resources: ResourceDetailsView;
  nation: NationView;
  metrics: MetricView[]; parties: PartyView[]; elections: ElectionView[]; news: NewsView[];
  actions: ActionView[]; regions: { id: string; name: string }[];
  polls: PollingView;
  notifications: import("./notifications").NotificationInbox;
  actionHistory?: import("./notifications").ActionHistoryEntry[];
}
export interface GameScreenProps {
  loadProfile: () => Promise<import("./profileTypes").ProfileView>;
  onUpdateProfile: (update: import("./profileTypes").ProfileUpdate) => Promise<boolean>;
  onSelectConstituency: (constituencyId: string) => Promise<boolean>;
  preferences: Preferences;
  onPreferencesChange: (value: Preferences) => void;
  preferencesError?: string | null;
  search: (query: string, filter?: import("./search").SearchFilter) => Promise<import("./search").SearchResults>;
  loadBondMarket: () => Promise<import("./bondMarket").BondMarketView>;
  loadRegions: (query?: import("./regions").RegionsQuery) => Promise<import("./regions").RegionsView>;
  loadCaucusManagement: () => Promise<import("./caucusManagement").CaucusManagementView>;
  loadPartyManagement: () => Promise<import("./partyManagement").PartyManagementView>;
  loadMarkets: () => Promise<import("./markets").MarketsView>;
  loadLegislation: (selection?: LegislationSelection) => Promise<LegislationDetailsQuery>;
  loadWorldOverview: () => Promise<WorldOverviewView>;
  loadPolitics: () => Promise<PoliticsView>;
  world: GameView; busy: boolean; message?: string; error?: string;
  onAdvanceTurn: () => void; onSave: () => void; onExit: () => void;
  onAction: (id: string, params?: Record<string, string | number>) => void;
  onMarkNotificationRead: (id: string) => void;
  onDeleteNotification: (id: string) => void;
  onMarkAllNotificationsRead: () => void;
}
export interface NewGameScreenProps { eras: EraChoice[]; busy: boolean; error?: string; onStart: (options: NewGameOptions) => void; onBack: () => void; }

/** Party row for the creation party/compass steps (reference PartyPicker/CompassPicker). */
export interface CreationParty {
  id: string;
  name: string;
  abbreviation: string;
  color: string;
  economicPosition: number;
  socialPosition: number;
  /**
   * One-party regime standing (reference PartyPicker regime badge), grounded in
   * the authored content pack (dd/ru/cn *Parties.ts). Undefined in a
   * competitive democracy.
   */
  regimeStatus?: "ruling" | "approved" | "banned";
}

/** Runtime conditions + options for the character-creation screen of one country. */
export interface CreationChoices {
  parties: CreationParty[];
  /**
   * The actual ruling party of the selected country/era, resolved from authored
   * seat composition (`rulingPartyForCountry`) or the `regimeStatus: "ruling"`
   * marker. Null when no ruling party is recorded; the briefing then says so
   * rather than naming a first-array party.
   */
  rulingParty: { id: string; name: string; abbreviation: string } | null;
  /** True for the reference one-party states (RU/DD/CN); the screen shows the briefing. */
  isOnePartyState: boolean;
  /** True for the reference imperial-eligible countries (UK/JP/ES/SE); shows the imperial notice. */
  imperialEligible: boolean;
  /** "state" or "region", matching the reference regionNounFor. */
  regionNoun: "state" | "region";
}

export interface CharacterCreationScreenProps {
  /** The world-setup selection made in NewGameScreen. */
  selection: { era: string; countryId: string; countryName: string; regionNoun: "state" | "region" };
  /** World-setup player name, prefilled as the character name (same person). */
  initialName: string;
  regions: { id: string; name: string }[];
  initialHomeRegionId?: string;
  choices: CreationChoices | null;
  loading: boolean;
  busy: boolean;
  error?: string;
  onSubmit: (creation: CharacterCreation) => void;
  onBack: () => void;
}
