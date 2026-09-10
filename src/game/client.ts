import type { ProfileUpdate, ProfileView } from "./profileTypes";
import type { RegionsQuery, RegionsView } from "./regions";
import type { CaucusManagementView } from "./caucusManagement";
import type { BondMarketView } from "./bondMarket";
import type { PartyManagementView } from "./partyManagement";
import type { SearchResults } from "./search";
import type { MarketsView } from "./markets";
import type { LegislationDetailsQuery, LegislationSelection } from "./legislationDetails";
import type { WorldOverviewView } from "./worldOverview";
import type { PoliticsView } from "./politics";
import type { GameCommand, GameResponse } from "./protocol";
import type { EraChoice, GameView, NewGameOptions } from "./types";

export interface WorkerPort {
  postMessage(message: unknown): void;
  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void;
  terminate(): void;
}

/** Keeps simulation off the UI thread. Worker state is never read directly by React. */
export class GameClient {
  private nextId = 0;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private closed = false;

  constructor(private readonly port: WorkerPort) {
    port.addEventListener("message", (event) => {
      const response = event.data as GameResponse;
      if (!response || typeof response.id !== "number" || typeof response.ok !== "boolean") return;
      const waiting = this.pending.get(response.id);
      if (!waiting) return;
      clearTimeout(waiting.timer); this.pending.delete(response.id);
      if (response.ok) waiting.resolve(response.value);
      else waiting.reject(new Error(response.error));
    });
    port.addEventListener("error", () => this.close("The simulation stopped. Reload your last saved game."));
    port.addEventListener("messageerror", () => this.close("The simulation response could not be read. Reload your last saved game."));
  }

  get isClosed(): boolean { return this.closed; }

  choices() { return this.send<EraChoice[]>({ type: "choices" }); }
  create(options: NewGameOptions) { return this.send<GameView>({ type: "create", options }); }
  legislation(selection: LegislationSelection = {}) { return this.send<LegislationDetailsQuery>({ type: "legislation", selection }); }
  worldOverview() { return this.send<WorldOverviewView>({ type: "worldOverview" }); }
  search(query: string) { return this.send<SearchResults>({ type: "search", query }); }
  bondMarket() { return this.send<BondMarketView>({ type: "bondMarket" }); }
  regions(query: RegionsQuery = {}) { return this.send<RegionsView>({ type: "regions", query }); }

  caucusManagement() { return this.send<CaucusManagementView>({ type: "caucusManagement" }); }
  partyManagement() { return this.send<PartyManagementView>({ type: "partyManagement" }); }
  markets() { return this.send<MarketsView>({ type: "markets" }); }
  politics() { return this.send<PoliticsView>({ type: "politics" }); }
  profile() { return this.send<ProfileView>({ type: "profile" }); }
  updateProfile(update: ProfileUpdate) { return this.send<GameView>({ type: "updateProfile", update }); }
  view() { return this.send<GameView>({ type: "view" }); }
  advance() { return this.send<GameView>({ type: "advance" }); }
  act(actionId: string, params?: Record<string, string | number>) {
    return this.send<{ result: { ok: true; message: string } | { ok: false; error: string }; view: GameView }>({ type: "action", actionId, params });
  }
  serialize(savedAt: string, includeSaveNotice = false) { return this.send<string>({ type: "serialize", savedAt, ...(includeSaveNotice ? { includeSaveNotice: true } : {}) }); }
  load(contents: string) { return this.send<GameView>({ type: "load", contents }); }
  markNotificationRead(id: string) { return this.send<GameView>({ type: "notificationsRead", id }); }
  deleteNotification(id: string) { return this.send<GameView>({ type: "notificationsDelete", id }); }
  markAllNotificationsRead() { return this.send<GameView>({ type: "notificationsReadAll" }); }
  recordSaved() { return this.send<GameView>({ type: "notificationsSaved" }); }
  dispose() { this.close("The game session was closed."); }

  private send<T>(command: GameCommand): Promise<T> {
    if (this.closed) return Promise.reject(new Error("The game session was closed. Reload to continue."));
    const id = ++this.nextId;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => this.close("The simulation timed out. Reload your last saved game."), 60_000);
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
      try { this.port.postMessage({ id, command }); }
      catch { this.close("The simulation request could not be sent."); }
    });
  }

  private close(message: string) {
    if (this.closed) return;
    this.closed = true; this.port.terminate();
    for (const waiting of this.pending.values()) { clearTimeout(waiting.timer); waiting.reject(new Error(message)); }
    this.pending.clear();
  }
}

export function createGameClient(): GameClient {
  return new GameClient(new Worker(new URL("./worker.ts", import.meta.url), { type: "module", name: "ahd-singleplayer" }));
}
