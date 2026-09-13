import type { LegislationDetailsQuery, LegislationSelection } from "./legislationDetails";
import type { Preferences } from "../preferences";
import type { WorldOverviewView } from "./worldOverview";
import type { NationView } from "./nation";
import type { PoliticsView } from "./politics";
import type { ResourceDetailsView } from "./resources";
export interface NewGameOptions { era: string; countryId: string; playerName: string; seed: string; }
export interface EraChoice { id: string; label: string; countries: { id: string; name: string }[]; }
export interface MetricView { id: string; label: string; value: number; format: "money" | "percent" | "number"; }
export type ActionCategory = "influence" | "fundraising" | "intelligence";
export interface ActionView { id: string; name: string; description: string; cost: number; fundsGain?: number; available: boolean; disabledReason?: string; requires?: "amount" | "party" | "region";
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
  player: { name: string; cash: number; funds: number; actions: number; influence: number; favorability: number; partyName: string; };
  legislature: LegislatureView;
  finance: FinanceView;
  resources: ResourceDetailsView;
  nation: NationView;
  metrics: MetricView[]; parties: PartyView[]; elections: ElectionView[]; news: NewsView[];
  actions: ActionView[]; regions: { id: string; name: string }[];
  notifications: import("./notifications").NotificationInbox;
  actionHistory?: import("./notifications").ActionHistoryEntry[];
}
export interface GameScreenProps {
  loadProfile: () => Promise<import("./profileTypes").ProfileView>;
  onUpdateProfile: (update: import("./profileTypes").ProfileUpdate) => Promise<boolean>;
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
