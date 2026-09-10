export interface NewGameOptions { era: string; countryId: string; playerName: string; seed: string; }
export interface EraChoice { id: string; label: string; countries: { id: string; name: string }[]; }
export interface MetricView { id: string; label: string; value: number; format: "money" | "percent" | "number"; }
export interface ActionView { id: string; name: string; description: string; cost: number; available: boolean; disabledReason?: string; requires?: "amount" | "party" | "region"; }
export interface PartyView { id: string; name: string; abbreviation: string; color: string; members: number; treasury: number; isPlayerParty: boolean; }
export interface ElectionView {
  id: string; title: string; status: string; date: string; filingDate: string;
  playerCandidate: boolean; candidateNames: string[]; winnerNames: string[];
  candidacy: ActionView;
}
export interface NewsView { id: string; title: string; body: string; date: string; }
export interface GameView {
  turn: number; date: string; era: string; countryId: string; countryName: string;
  player: { name: string; cash: number; funds: number; actions: number; influence: number; favorability: number; partyName: string; };
  metrics: MetricView[]; parties: PartyView[]; elections: ElectionView[]; news: NewsView[];
  actions: ActionView[]; regions: { id: string; name: string }[];
}
export interface GameScreenProps {
  world: GameView; busy: boolean; message?: string; error?: string;
  onAdvanceTurn: () => void; onSave: () => void; onExit: () => void;
  onAction: (id: string, params?: Record<string, string | number>) => void;
}
export interface NewGameScreenProps { eras: EraChoice[]; busy: boolean; error?: string; onStart: (options: NewGameOptions) => void; onBack: () => void; }
