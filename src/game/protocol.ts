import type { LegislationSelection } from "./legislationDetails";
import type { NewGameOptions } from "./types";

export type GameCommand =
  | { type: "choices" }
  | { type: "create"; options: NewGameOptions }
  | { type: "view" }
  | { type: "politics" }
  | { type: "markets" }
  | { type: "partyManagement" }
  | { type: "bondMarket" }
  | { type: "search"; query: string }
  | { type: "worldOverview" }
  | { type: "legislation"; selection?: LegislationSelection }
  | { type: "advance" }
  | { type: "action"; actionId: string; params?: Record<string, string | number> }
  | { type: "serialize"; savedAt: string }
  | { type: "load"; contents: string };
export interface GameRequest { id: number; command: GameCommand; }
export type GameResponse = { id: number; ok: true; value: unknown } | { id: number; ok: false; error: string };
