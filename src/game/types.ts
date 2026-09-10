import type { LegislationDetailsQuery, LegislationSelection } from "./legislationDetails";
import type { Preferences } from "../preferences";
import type { WorldOverviewView } from "./worldOverview";
import type { NationView } from "./nation";
import type { PoliticsView } from "./politics";
import type { ResourceDetailsView } from "./resources";
export interface NewGameOptions { era: string; countryId: string; playerName: string; seed: string; }
export interface EraChoice { id: string; label: string; countries: { id: string; name: string }[]; }
export interface MetricView { id: string; label: string; value: number; format: "money" | "percent" | "number"; }
export interface ActionView { id: string; name: string; description: string; cost: number; available: boolean; disabledReason?: string; requires?: "amount" | "party" | "region"; }
export interface PartyView { id: string; name: string; abbreviation: string; color: string; members: number; treasury: number; isPlayerParty: boolean; membership?: { join: ActionView; leave: ActionView }; }
export interface ElectionView {
  id: string; title: string; status: string; date: string; filingDate: string;
  playerCandidate: boolean; candidateNames: string[]; winnerNames: string[];
  candidacy: ActionView;
}
export interface NewsView { id: string; title: string; body: string; date: string; }
export interface LegislatureView {
  office: string | null;
  proposals: { id: string; title: string; description: string }[];
  sponsor: ActionView;
  bills: { id: string; title: string; status: string; chamber: string; sponsorName: string;
    votesFor: number; votesAgainst: number; votesAbstain: number;
    playerVote: "for" | "against" | "abstain" | null; voting: ActionView; }[];
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
}
export interface GameScreenProps {
  preferences: Preferences;
  onPreferencesChange: (value: Preferences) => void;
  preferencesError?: string | null;
  search: (query: string) => Promise<import("./search").SearchResults>;
  loadMarkets: () => Promise<import("./markets").MarketsView>;
  loadLegislation: (selection?: LegislationSelection) => Promise<LegislationDetailsQuery>;
  loadWorldOverview: () => Promise<WorldOverviewView>;
  loadPolitics: () => Promise<PoliticsView>;
  world: GameView; busy: boolean; message?: string; error?: string;
  onAdvanceTurn: () => void; onSave: () => void; onExit: () => void;
  onAction: (id: string, params?: Record<string, string | number>) => void;
}
export interface NewGameScreenProps { eras: EraChoice[]; busy: boolean; error?: string; onStart: (options: NewGameOptions) => void; onBack: () => void; }
