/**
 * Local notification store and event projection for offline singleplayer.
 *
 * Ports the player-facing shapes of AHDGame notifications at the pinned
 * authority revision (d4baf899fd8bd529099f03d7410807143604e2e5):
 * - five-item preview with inline mark-read/delete (Navbar.tsx)
 * - full inbox with unread count and action-required flag
 *   (src/lib/inbox/inboxItem.ts, priority.ts, categories.ts)
 * - deep links with safe fallback (src/lib/inbox/sourceLink.ts)
 *
 * Mail threads are MP-only (server mail API) and stay capability-gated:
 * this store carries notification items only. Snooze is a server-timing
 * concept and is not projected locally.
 */

export type NotificationCategory =
  | "crisis" | "legislation" | "election" | "party" | "standing" | "treasury" | "system";

export type NotificationRoute =
  | "profile" | "actions" | "parties" | "partyDetails" | "legislature" | "legislationDetails"
  | "elections" | "electionDetails" | "politicians" | "news" | "portfolio" | "banking"
  | "economy" | "nations";

export interface NotificationDestination {
  route: NotificationRoute;
  detailId?: string;
}

export interface NotificationItem {
  id: string;
  /** Stable dedupe key; ids derive from turn + key so replays stay deterministic. */
  key: string;
  turn: number;
  date: string;
  category: NotificationCategory;
  title: string;
  body: string;
  unread: boolean;
  actionRequired: boolean;
  destination: NotificationDestination;
  actionOutcome?: ActionOutcome;
}

export interface NotificationDraft {
  key: string;
  turn: number;
  date: string;
  category: NotificationCategory;
  title: string;
  body: string;
  actionRequired: boolean;
  destination: NotificationDestination;
  actionOutcome?: ActionOutcome;
}

export interface ActionChange {
  field: string;
  label: string;
  before: number | string | null;
  after: number | string | null;
  delta?: number;
}

export interface ActionTarget { kind: string; id: string; label: string; }

export interface ActionOutcome {
  actionId: string;
  changes: ActionChange[];
  target?: ActionTarget;
  followUps: string[];
}

export interface ActionHistoryEntry extends ActionOutcome {
  id: string; turn: number; date: string; title: string; message: string;
  destination: NotificationDestination;
}

export interface NotificationInbox {
  items: NotificationItem[];
  unread: number;
}

/** Reference preview shows five items (Navbar limit=5 slice). */
export const NOTIFICATION_PREVIEW_LIMIT = 5;
/** Per-turn cap for wire headlines so a busy turn does not flood the inbox. */
export const NOTIFICATION_NEWS_PER_TURN = 5;

const CATEGORIES: ReadonlySet<string> = new Set(
  ["crisis", "legislation", "election", "party", "standing", "treasury", "system"],
);

const ROUTES: ReadonlySet<string> = new Set(
  ["profile", "actions", "parties", "partyDetails", "legislature", "legislationDetails",
    "elections", "electionDetails", "politicians", "news", "portfolio", "banking",
    "economy", "nations"],
);

function draftId(draft: NotificationDraft): string {
  return `t${draft.turn}-${draft.key}`;
}

/** Prepends drafts newest-first, skipping keys already stored. Never mutates. */
export function addNotifications(items: NotificationItem[], drafts: NotificationDraft[]): NotificationItem[] {
  const seen = new Set(items.map((item) => item.key));
  const fresh: NotificationItem[] = [];
  for (const draft of drafts) {
    if (seen.has(draft.key)) continue;
    seen.add(draft.key);
    fresh.push({ ...draft, id: draftId(draft), unread: true });
  }
  // drafts[0] is the most important; it must end up first.
  const merged = [...fresh, ...items];
  return merged;
}

export function markNotificationRead(items: NotificationItem[], id: string): NotificationItem[] {
  return items.map((item) => (item.id === id ? { ...item, unread: false } : item));
}

export function deleteNotification(items: NotificationItem[], id: string): NotificationItem[] {
  return items.filter((item) => item.id !== id);
}

export function markAllNotificationsRead(items: NotificationItem[]): NotificationItem[] {
  return items.map((item) => (item.unread ? { ...item, unread: false } : item));
}

export function unreadCount(items: NotificationItem[]): number {
  return items.filter((item) => item.unread).length;
}

/** Reference preview: the five newest items. */
export function previewItems(items: NotificationItem[]): NotificationItem[] {
  return items.slice(0, NOTIFICATION_PREVIEW_LIMIT);
}

/** Reference priority lane: unread items that need the player's input. */
export function needsAction(items: NotificationItem[]): NotificationItem[] {
  return items.filter((item) => item.unread && item.actionRequired);
}

export function emptyInbox(): NotificationInbox {
  return { items: [], unread: 0 };
}

export function toInbox(items: NotificationItem[]): NotificationInbox {
  return { items: structuredClone(items), unread: unreadCount(items) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Missing legacy metadata is empty. Malformed history must never be silently lost. */
export function parseNotifications(value: unknown): NotificationItem[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("Invalid saved notifications: expected a list");
  const ids = new Set<string>();
  const keys = new Set<string>();
  const parsed: NotificationItem[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) throw new Error("Invalid saved notifications: malformed item");
    const { id, key, turn, date, category, title, body, unread, actionRequired, destination, actionOutcome } = entry;
    if (typeof id !== "string" || !id || typeof key !== "string" || !key) throw new Error("Invalid saved notifications: malformed item");
    if (!Number.isInteger(turn) || (turn as number) < 0) throw new Error("Invalid saved notifications: malformed item");
    if (typeof date !== "string" || typeof title !== "string" || typeof body !== "string") throw new Error("Invalid saved notifications: malformed item");
    if (typeof category !== "string" || !CATEGORIES.has(category)) throw new Error("Invalid saved notifications: malformed item");
    if (!isRecord(destination) || typeof destination.route !== "string" || !ROUTES.has(destination.route)) throw new Error("Invalid saved notifications: malformed item");
    const detailId = destination.detailId;
    if (detailId !== undefined && typeof detailId !== "string") throw new Error("Invalid saved notifications: malformed item");
    if (typeof unread !== "boolean" || typeof actionRequired !== "boolean" || ids.has(id) || keys.has(key)) {
      throw new Error("Invalid saved notifications: flags or duplicate identity");
    }
    ids.add(id); keys.add(key);
    const parsedOutcome = actionOutcome === undefined ? undefined : parseActionOutcome(actionOutcome);
    parsed.push({
      id, key, turn: turn as number, date, category: category as NotificationCategory,
      title, body, unread, actionRequired,
      destination: { route: destination.route as NotificationRoute, ...(typeof detailId === "string" ? { detailId } : {}) },
      ...(parsedOutcome ? { actionOutcome: parsedOutcome } : {}),
    });
  }
  return parsed;
}

function parseActionOutcome(value: unknown): ActionOutcome {
  if (!isRecord(value) || typeof value.actionId !== "string" || !value.actionId
    || !Array.isArray(value.changes) || !Array.isArray(value.followUps)
    || value.followUps.some((item) => typeof item !== "string")) {
    throw new Error("Invalid saved notifications: malformed action outcome");
  }
  const changes = value.changes.map((change) => {
    if (!isRecord(change) || typeof change.field !== "string" || typeof change.label !== "string"
      || (!(["number", "string"].includes(typeof change.before)) && change.before !== null)
      || (!(["number", "string"].includes(typeof change.after)) && change.after !== null)
      || (change.delta !== undefined && typeof change.delta !== "number")) {
      throw new Error("Invalid saved notifications: malformed action outcome");
    }
    return { field: change.field, label: change.label, before: change.before as number | string | null,
      after: change.after as number | string | null,
      ...(typeof change.delta === "number" ? { delta: change.delta } : {}) };
  });
  let target: ActionTarget | undefined;
  if (value.target !== undefined) {
    if (!isRecord(value.target) || typeof value.target.kind !== "string"
      || typeof value.target.id !== "string" || typeof value.target.label !== "string") {
      throw new Error("Invalid saved notifications: malformed action outcome");
    }
    target = { kind: value.target.kind, id: value.target.id, label: value.target.label };
  }
  return { actionId: value.actionId, changes, ...(target ? { target } : {}), followUps: [...value.followUps] as string[] };
}

/** Reference `welcome` type: the first notice of a new game. */
export function welcomeNotification(playerName: string, turn: number, date: string): NotificationDraft {
  return {
    key: "welcome", turn, date, category: "system", actionRequired: false,
    title: `Welcome, ${playerName}`,
    body: "Your career begins. Important elections, bills, party changes, and finances will be announced here.",
    destination: { route: "profile" },
  };
}

/** Save-event notice, deduped to one per turn by its key. */
export function saveNotification(turn: number, date: string): NotificationDraft {
  return {
    key: `save:${turn}`, turn, date, category: "system", actionRequired: false,
    title: `Game saved · Turn ${turn}`,
    body: "Progress and notification read state are stored on this device.",
    destination: { route: "profile" },
  };
}

// ---------------------------------------------------------------------------
// Event projection from real world-state snapshots.
// ---------------------------------------------------------------------------

export interface NotificationElection {
  id: string;
  title: string;
  status: string;
  playerCandidate: boolean;
  winnerNames: string[];
  playerWon?: boolean;
  filingOpen: boolean;
}

export interface NotificationBill {
  id: string;
  title: string;
  status: string;
  votingOpenForPlayer: boolean;
}

export interface TurnSnapshot {
  turn: number;
  date: string;
  news: { headline: string }[];
  elections: NotificationElection[];
  bills: NotificationBill[];
  partyId: string | null;
  partyName: string;
  funds: number;
  savings: number;
}

const TERMINAL_BILL_STATUSES = new Set(
  ["passed_chamber", "failed_chamber", "enrolled", "signed", "vetoed", "veto_override", "override_failed"],
);

function money(amount: number): string {
  return amount.toLocaleString("en-US");
}

/**
 * Projects display-ordered drafts from a real before/after turn diff.
 * Display order is most-actionable first; the store prepends accordingly.
 */
export function diffTurnSnapshots(before: TurnSnapshot, after: TurnSnapshot, playerName: string): NotificationDraft[] {
  const drafts: NotificationDraft[] = [];
  const opened: NotificationElection[] = [];
  const beforeElections = new Map(before.elections.map((e) => [e.id, e]));
  for (const election of after.elections) {
    const prior = beforeElections.get(election.id);
    if (!prior) {
      if (election.status !== "resolved" && election.filingOpen && !election.playerCandidate) {
        opened.push(election);
      }
      continue;
    }
    if (prior.status !== election.status && election.status === "resolved" && prior.playerCandidate) {
      const won = election.playerWon === true;
      drafts.push({
        key: `election:${election.id}:resolved`, turn: after.turn, date: after.date,
        category: "election", actionRequired: false,
        title: won ? `${playerName} wins ${election.title}` : `${playerName} loses ${election.title}`,
        body: election.winnerNames.length > 0 ? `Winners: ${election.winnerNames.join(", ")}.` : "The race has been decided.",
        destination: { route: "electionDetails", detailId: election.id },
      });
    }
  }
  // One turn can open dozens of parallel races (every state race at once).
  // A single race keeps its deep link; a batch becomes one filing digest so
  // the inbox stays readable and older notices are not evicted by one turn.
  if (opened.length === 1) {
    const election = opened[0]!;
    drafts.push({
      key: `election:${election.id}:opened`, turn: after.turn, date: after.date,
      category: "election", actionRequired: true,
      title: `Filing open: ${election.title}`,
      body: "This race is accepting candidates. File before the deadline.",
      destination: { route: "electionDetails", detailId: election.id },
    });
  } else if (opened.length > 1) {
    const names = opened.slice(0, 3).map((election) => election.title).join("; ");
    drafts.push({
      key: `election:opened:${after.turn}`, turn: after.turn, date: after.date,
      category: "election", actionRequired: true,
      title: `Filing open in ${opened.length} races`,
      body: `${names}${opened.length > 3 ? "; …" : ""}. Open Elections to file.`,
      destination: { route: "elections" },
    });
  }
  const beforeBills = new Map(before.bills.map((b) => [b.id, b]));
  const newBills = after.bills.filter((bill) => !beforeBills.has(bill.id));
  const billOpened = (bill: NotificationBill): NotificationDraft => ({
    key: `bill:${bill.id}:opened`, turn: after.turn, date: after.date,
    category: "legislation", actionRequired: bill.votingOpenForPlayer,
    title: bill.votingOpenForPlayer ? `Vote open: ${bill.title}` : `New bill: ${bill.title}`,
    body: bill.votingOpenForPlayer ? "Your vote is needed in this chamber." : "A new bill was introduced in your country.",
    destination: { route: "legislationDetails", detailId: bill.id },
  });
  if (newBills.length > 3) {
    const needVote = newBills.filter((bill) => bill.votingOpenForPlayer).length;
    drafts.push({
      key: `bills:opened:${after.turn}`, turn: after.turn, date: after.date,
      category: "legislation", actionRequired: needVote > 0,
      title: `${newBills.length} new bills`,
      body: needVote > 0 ? `Your vote is needed on ${needVote}. Open legislation details.` : "Open legislation details to review them.",
      destination: { route: "legislature" },
    });
  } else {
    for (const bill of newBills) drafts.push(billOpened(bill));
  }
  for (const bill of after.bills) {
    const prior = beforeBills.get(bill.id);
    if (!prior) continue;
    if (prior.status !== bill.status) {
      if (bill.votingOpenForPlayer) {
        drafts.push({
          key: `bill:${bill.id}:vote:${after.turn}`, turn: after.turn, date: after.date,
          category: "legislation", actionRequired: true,
          title: `Vote open: ${bill.title}`,
          body: "Your vote is needed in this chamber.",
          destination: { route: "legislationDetails", detailId: bill.id },
        });
      } else if (TERMINAL_BILL_STATUSES.has(bill.status)) {
        drafts.push({
          key: `bill:${bill.id}:${bill.status}`, turn: after.turn, date: after.date,
          category: "legislation", actionRequired: false,
          title: `Bill ${bill.status.replaceAll("_", " ")}: ${bill.title}`,
          body: "",
          destination: { route: "legislationDetails", detailId: bill.id },
        });
      }
    }
  }
  if (before.partyId !== after.partyId) {
    if (after.partyId) {
      drafts.push({
        key: `party:${after.partyId}:joined`, turn: after.turn, date: after.date,
        category: "party", actionRequired: false,
        title: `Joined ${after.partyName}`,
        body: "Party membership changed. Switching parties withdraws candidacy.",
        destination: { route: "partyDetails", detailId: after.partyId },
      });
    } else {
      drafts.push({
        key: `party:left:${after.turn}`, turn: after.turn, date: after.date,
        category: "party", actionRequired: false,
        title: `Left ${before.partyName}`,
        body: "You are now independent. Leaving a party withdraws candidacy.",
        destination: { route: "parties" },
      });
    }
  }
  const fundsGain = after.funds - before.funds;
  if (fundsGain > 0) {
    drafts.push({
      key: `funds:income:${after.turn}`, turn: after.turn, date: after.date,
      category: "treasury", actionRequired: false,
      title: "Campaign funds received",
      body: `+${money(fundsGain)} campaign funds (turn ${after.turn}).`,
      destination: { route: "portfolio" },
    });
  }
  const savingsGain = after.savings - before.savings;
  if (savingsGain > 0) {
    drafts.push({
      key: `savings:interest:${after.turn}`, turn: after.turn, date: after.date,
      category: "treasury", actionRequired: false,
      title: "Savings grew",
      body: `+${money(savingsGain)} savings interest (turn ${after.turn}).`,
      destination: { route: "banking" },
    });
  }
  const known = new Set(before.news.map((n) => n.headline));
  let announced = 0;
  after.news.forEach((item, index) => {
    if (known.has(item.headline) || announced >= NOTIFICATION_NEWS_PER_TURN) return;
    announced += 1;
    drafts.push({
      key: `news:${after.turn}:${index}`, turn: after.turn, date: after.date,
      category: "system", actionRequired: false,
      title: item.headline, body: "",
      destination: { route: "news" },
    });
  });
  return drafts;
}

export interface ActionDetail {
  partyId?: string;
  partyName?: string;
  electionId?: string;
  electionTitle?: string;
  amount?: number;
  fundsGain?: number;
  message?: string;
  outcome?: ActionOutcome;
}

/** Action-result notices for successful actions only; unknown actions yield null. */
export function actionNotification(
  actionId: string, detail: ActionDetail, turn: number, date: string,
): NotificationDraft | null {
  const base = { turn, date, actionRequired: false as boolean,
    ...(detail.outcome ? { actionOutcome: detail.outcome } : {}) };
  switch (actionId) {
    case "joinParty":
      if (!detail.partyId) return null;
      return {
        ...base, key: `party:${detail.partyId}:joined`, category: "party",
        title: `Joined ${detail.partyName ?? detail.partyId}`,
        body: detail.message ?? "Party membership changed. Switching parties withdraws candidacy.",
        destination: { route: "partyDetails", detailId: detail.partyId },
      };
    case "leaveParty":
      return {
        ...base, key: `party:left:${turn}`, category: "party",
        title: "Left party",
        body: detail.message ?? "You are now independent. Leaving a party withdraws candidacy.",
        destination: { route: "parties" },
      };
    case "declareCandidacy":
      if (!detail.electionId) return null;
      return {
        ...base, key: `election:${detail.electionId}:filed`, category: "election",
        title: `Filed: ${detail.electionTitle ?? detail.electionId}`,
        body: detail.message ?? "Your candidacy is recorded.",
        destination: { route: "electionDetails", detailId: detail.electionId },
      };
    case "withdrawCandidacy":
      return {
        ...base, key: `election:${detail.electionId ?? "race"}:withdrawn:${turn}`, category: "election",
        title: `Withdrew: ${detail.electionTitle ?? "race"}`,
        body: detail.message ?? "Your candidacy was withdrawn.",
        destination: { route: "elections" },
      };
    case "fundraise":
      return {
        ...base, key: `finance:fundraise:${turn}`, category: "treasury",
        title: "Fundraising complete",
        body: detail.message ?? (detail.fundsGain !== undefined ? `Raised ${money(detail.fundsGain)} campaign funds.` : "Campaign funds raised."),
        destination: { route: "portfolio" },
      };
    case "convertCash":
      return {
        ...base, key: `finance:convertCash:${turn}`, category: "treasury",
        title: "Cash converted",
        body: detail.message ?? (detail.amount !== undefined ? `Converted ${money(detail.amount)} cash.` : "Cash converted."),
        destination: { route: "banking" },
      };
    case "depositSavings":
      return {
        ...base, key: `finance:depositSavings:${turn}`, category: "treasury",
        title: "Deposit complete",
        body: detail.message ?? "Cash moved to savings.",
        destination: { route: "banking" },
      };
    case "withdrawSavings":
      return {
        ...base, key: `finance:withdrawSavings:${turn}`, category: "treasury",
        title: "Withdrawal complete",
        body: detail.message ?? "Savings moved to cash.",
        destination: { route: "banking" },
      };
    case "campaign":
    case "advertise":
    case "canvass":
      return {
        ...base, key: `finance:${actionId}:${turn}`, category: "standing",
        title: detail.message ?? "Action complete",
        body: "",
        destination: { route: "actions" },
      };
    case "sponsorBill":
      return {
        ...base, key: `legislation:sponsor:${turn}`, category: "legislation",
        title: "Bill sponsored",
        body: detail.message ?? "Your bill entered the legislative process.",
        destination: { route: "legislature" },
      };
    case "voteOnBill":
      return {
        ...base, key: `legislation:vote:${turn}`, category: "legislation",
        title: "Vote recorded",
        body: detail.message ?? "Your vote was recorded.",
        destination: { route: "legislature" },
      };
    case "buildDonorBase":
      return {
        ...base, key: `finance:donorBase:${turn}`, category: "treasury",
        title: "Donor network expanded",
        body: detail.message ?? "Your donor base grew.",
        destination: { route: "portfolio" },
      };
    default:
      if (!detail.outcome) return null;
      return {
        ...base, key: `action:${actionId}:${turn}`, category: "system",
        title: detail.message ?? "Action complete", body: "",
        destination: { route: "actions" },
      };
  }
}

// ---------------------------------------------------------------------------
// Destination resolution with safe fallback for deleted targets.
// ---------------------------------------------------------------------------

export interface DestinationIndex {
  elections: { id: string }[];
  parties: { id: string }[];
  bills: { id: string }[];
}

export interface ResolvedDestination {
  route: NotificationRoute;
  detailId?: string;
  fallbackUsed: boolean;
}

const SECTION_FALLBACK: Partial<Record<NotificationRoute, NotificationRoute>> = {
  electionDetails: "elections",
  partyDetails: "parties",
  legislationDetails: "legislature",
};

function detailAlive(route: NotificationRoute, detailId: string, index: DestinationIndex): boolean {
  if (route === "electionDetails") return index.elections.some((e) => e.id === detailId);
  if (route === "partyDetails") return index.parties.some((p) => p.id === detailId);
  if (route === "legislationDetails") return index.bills.some((b) => b.id === detailId);
  return true;
}

export function resolveNotificationDestination(
  item: NotificationItem, index: DestinationIndex,
): ResolvedDestination {
  const { route, detailId } = item.destination;
  if (detailId !== undefined && !detailAlive(route, detailId, index)) {
    return { route: SECTION_FALLBACK[route] ?? route, detailId: undefined, fallbackUsed: true };
  }
  return { route, detailId, fallbackUsed: false };
}
