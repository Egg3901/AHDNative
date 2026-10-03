import type { HallOfFameQuery } from "./hallOfFame";
import type { GameActionParams } from "./actionInput";
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
  | { type: "forexQuote"; fromCurrency: string; toCurrency: string; amount: number }
  | { type: "profile" }
  | { type: "profileDestination" }
  | { type: "imperialProfile" }
  | { type: "updateProfile"; update: ProfileUpdate }
  | { type: "allocateStats"; stats: Record<string, number> }
  | { type: "reallocateStats"; stats: Record<string, number> }
  | { type: "selectConstituency"; constituencyId: string }
  | { type: "worldFeatureFlags"; flags: Partial<WorldFeatureFlags> }
  | { type: "politics" }
  | { type: "politicalMetrics" }
  | { type: "markets" }
  | { type: "stateOwnership"; countryId?: string }
  | { type: "unionManagement" }
  | { type: "regions"; query?: RegionsQuery }
  | { type: "cabinetOffice" }
  | { type: "issueCabinetOrder"; positionId: string; orderId: string; targetRegionId?: string }
  | { type: "caucusManagement" }
  | { type: "partyManagement" }
  | { type: "bondMarket" }
  | { type: "search"; query: string; filter?: SearchFilter }
  | { type: "worldOverview" }
  | { type: "hallOfFame"; query?: HallOfFameQuery }
  | { type: "legislation"; selection?: LegislationSelection }
  | { type: "advance" }
  | { type: "action"; actionId: string; params?: GameActionParams }
  | { type: "sectorSale"; op: "list" | "update" | "unlist" | "buy"; assetId: string; priceAnchor?: number; buyerCorporationId?: string }
  | { type: "unionCommand"; op: "organize"; unionId: string }
  | { type: "unionCommand"; op: "organizeUnderground"; unionId: string; mode: "quiet" | "mass" }
  | { type: "unionCommand"; op: "vote"; unionId: string }
  | { type: "unionCommand"; op: "accept"; unionId: string }
  | { type: "unionCommand"; op: "organizeSector"; unionId: string; assetId: string }
  | { type: "unionCommand"; op: "dues"; unionId: string; duesPerWorkerAnnual: number }
  | { type: "unionCommand"; op: "contributions"; unionId: string; politicalContributionPct: number }
  | { type: "unionCommand"; op: "call"; unionId: string; employerId: string; terms: import("@ahdclient/engine").BargainingTerms }
  | { type: "unionCommand"; op: "move"; campaignId: string; action: "accept" | "counter" | "withdraw" | "escalate"; terms?: import("@ahdclient/engine").BargainingTerms }
  | { type: "unionCommand"; op: "ratify"; campaignId: string; vote: "ratify" | "reject" }
  | { type: "serialize"; savedAt: string; includeSaveNotice?: boolean }
  | { type: "load"; contents: string }
  | { type: "notificationsRead"; id: string }
  | { type: "notificationsDelete"; id: string }
  | { type: "notificationsReadAll" }
  | { type: "notificationsSaved" };
export interface GameRequest { id: number; command: GameCommand; }
export type GameResponse = { id: number; ok: true; value: unknown } | { id: number; ok: false; error: string };
