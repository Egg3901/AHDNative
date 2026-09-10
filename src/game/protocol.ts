import type { ProfileUpdate } from "./profileTypes";
import type { RegionsQuery } from "./regions";
import type { LegislationSelection } from "./legislationDetails";
import type { NewGameOptions } from "./types";

export type GameCommand =
  | { type: "choices" }
  | { type: "create"; options: NewGameOptions }
  | { type: "view" }
  | { type: "profile" }
  | { type: "updateProfile"; update: ProfileUpdate }
  | { type: "politics" }
  | { type: "markets" }
  | { type: "regions"; query?: RegionsQuery }
  | { type: "caucusManagement" }
  | { type: "partyManagement" }
  | { type: "bondMarket" }
  | { type: "search"; query: string }
  | { type: "worldOverview" }
  | { type: "legislation"; selection?: LegislationSelection }
  | { type: "advance" }
  | { type: "action"; actionId: string; params?: Record<string, string | number> }
  | { type: "serialize"; savedAt: string; includeSaveNotice?: boolean }
  | { type: "load"; contents: string }
  | { type: "notificationsRead"; id: string }
  | { type: "notificationsDelete"; id: string }
  | { type: "notificationsReadAll" }
  | { type: "notificationsSaved" };
export interface GameRequest { id: number; command: GameCommand; }
export type GameResponse = { id: number; ok: true; value: unknown } | { id: number; ok: false; error: string };
