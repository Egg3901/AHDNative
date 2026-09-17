import type { ProfileUpdate } from "./profileTypes";
import type { RegionsQuery } from "./regions";
import type { LegislationSelection } from "./legislationDetails";
import type { SearchFilter } from "./search";
import type { NewGameOptions } from "./types";
import type { WorldFeatureFlags } from "@ahdclient/engine";

export type GameCommand =
  | { type: "choices" }
  | { type: "creationChoices"; era: string; countryId: string }
  | { type: "create"; options: NewGameOptions }
  | { type: "view" }
  | { type: "profile" }
  | { type: "profileDestination" }
  | { type: "imperialProfile" }
  | { type: "updateProfile"; update: ProfileUpdate }
  | { type: "selectConstituency"; constituencyId: string }
  | { type: "worldFeatureFlags"; flags: Partial<WorldFeatureFlags> }
  | { type: "politics" }
  | { type: "markets" }
  | { type: "regions"; query?: RegionsQuery }
  | { type: "cabinetOffice" }
  | { type: "issueCabinetOrder"; positionId: string; orderId: string; targetRegionId?: string }
  | { type: "caucusManagement" }
  | { type: "partyManagement" }
  | { type: "bondMarket" }
  | { type: "search"; query: string; filter?: SearchFilter }
  | { type: "worldOverview" }
  | { type: "legislation"; selection?: LegislationSelection }
  | { type: "advance" }
  | { type: "action"; actionId: string; params?: Record<string, string | number> }
  | { type: "sectorSale"; op: "list" | "update" | "unlist" | "buy"; assetId: string; priceAnchor?: number }
  | { type: "serialize"; savedAt: string; includeSaveNotice?: boolean }
  | { type: "load"; contents: string }
  | { type: "notificationsRead"; id: string }
  | { type: "notificationsDelete"; id: string }
  | { type: "notificationsReadAll" }
  | { type: "notificationsSaved" };
export interface GameRequest { id: number; command: GameCommand; }
export type GameResponse = { id: number; ok: true; value: unknown } | { id: number; ok: false; error: string };
