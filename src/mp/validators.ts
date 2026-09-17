import {
  MP_MAIL_BODY_MAX,
  MP_MAIL_SUBJECT_MAX,
  MP_SNOOZE_MINUTES_DEFAULT,
  MP_SNOOZE_MINUTES_MAX,
  MP_SNOOZE_MINUTES_MIN,
  isMpBatchableActionType,
  isMpExecuteActionType,
  isMpNotificationPreferenceAction,
  isMpNotificationType,
  type MpExecuteActionType,
  type MpNotificationPreferenceAction,
  type MpNotificationType,
} from "./endpoints";

/**
 * Runtime validation for authoritative payloads (#359). Every remote body is
 * `unknown` until it passes here; per-endpoint `null` means malformed and the
 * adapter reports it without losing the other endpoints. Client-side action
 * args are pre-checked against the audited route schema so the UI never sends
 * what the server (and the Rust bridge) would reject.
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function parseJsonBody(bodyText: string): unknown {
  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    return null;
  }
}

const HEX_OBJECT_ID = /^[a-f0-9]{24}$/i;

export interface MpSessionProbe {
  active: boolean;
  userId: string | null;
  username: string | null;
}

/** auth-session: {active:true,sub,username,...} | {active:false} | 503 {error}. */
export function parseSessionProbe(bodyText: string): MpSessionProbe | null {
  const record = asRecord(parseJsonBody(bodyText));
  if (!record) return null;
  const active = asBoolean(record.active);
  if (active !== true) {
    // Inactive covers {active:false} and the 503 dependency-failure shape:
    // neither proves a signed-in player.
    if (active === false || typeof record.error === "string") {
      return { active: false, userId: null, username: null };
    }
    return null;
  }
  if (typeof record.sub !== "string" || !record.sub || typeof record.username !== "string" || !record.username) {
    return null;
  }
  return { active: true, userId: record.sub, username: record.username };
}

export interface MpCharacterView {
  id: string;
  name: string;
  party: string | null;
  homeState: string | null;
  countryId: string | null;
  cashOnHand: number | null;
  actions: number | null;
  corporationName: string | null;
}

/** character-me: projects only audited fields; the rest stays server-side. */
export function parseCharacterMe(bodyText: string): MpCharacterView | null {
  const record = asRecord(parseJsonBody(bodyText));
  const character = record ? asRecord(record.character) : null;
  if (!character) return null;
  const id = asTrimmedString(character._id);
  const name = asTrimmedString(character.name);
  if (!id || !name) return null;
  const corporation = asRecord(record?.corporation);
  return {
    id,
    name,
    party: asTrimmedString(character.party ?? null),
    homeState: asTrimmedString(character.homeState ?? null),
    countryId: asTrimmedString(character.countryId ?? null),
    cashOnHand: character.cashOnHand === undefined ? null : asNumber(character.cashOnHand),
    actions: character.actions === undefined ? null : asNumber(character.actions),
    corporationName: corporation ? asTrimmedString(corporation.name ?? null) : null,
  };
}

export interface MpTurnView {
  currentTurn: number;
  currentYear: number;
  isActive: boolean | null;
  isProcessing: boolean;
  processingLabel: string | null;
  nextScheduledTurn: string | null;
  paused: boolean;
  pauseReason: string | null;
}

/** turn-status: currentTurn/currentYear required; everything else optional. */
export function parseTurnStatus(bodyText: string): MpTurnView | null {
  const record = asRecord(parseJsonBody(bodyText));
  if (!record) return null;
  const currentTurn = asNumber(record.currentTurn);
  const currentYear = asNumber(record.currentYear);
  if (currentTurn === null || currentYear === null) return null;
  const isProcessing = asBoolean(record.isProcessing) ?? false;
  const pausedAt = record.pausedAt;
  return {
    currentTurn,
    currentYear,
    isActive: record.isActive === undefined ? null : asBoolean(record.isActive),
    isProcessing,
    processingLabel: asTrimmedString(record.processingPhaseLabel ?? null),
    nextScheduledTurn:
      typeof record.nextScheduledTurn === "string" && record.nextScheduledTurn
        ? record.nextScheduledTurn
        : null,
    paused: pausedAt !== null && pausedAt !== undefined,
    pauseReason: asTrimmedString(record.pauseReason ?? null),
  };
}

export interface MpPresenceView {
  online: number;
  /** Server `asOf` timestamp; null when missing or not a usable string. */
  asOf: string | null;
}

/**
 * players-online: {online, asOf}. The count is the whole claim: it must be
 * a non-negative integer, so a drifting or hostile payload fails closed
 * instead of rendering a fabricated zero. `asOf` is display metadata only
 * and degrades to null on its own.
 */
export function parsePlayersOnline(bodyText: string): MpPresenceView | null {
  const record = asRecord(parseJsonBody(bodyText));
  if (!record) return null;
  const online = record.online;
  if (typeof online !== "number" || !Number.isInteger(online) || online < 0) return null;
  const asOf = typeof record.asOf === "string" && record.asOf.trim() ? record.asOf : null;
  return { online, asOf };
}

/**
 * Wall-clock countdown to the next scheduled turn, pinned to the reference
 * `formatRealTimeCountdown` in AHDGame src/lib/utils/formatters.ts (used by
 * StatusBar.getTimeUntilNextTurn): "—"-equivalent null when there is no
 * schedule, "Paused" while paused, "Processing..." once the deadline passes,
 * else the compact "45m" / "2h 30m" / "2d 0h" form. Returns null (render
 * nothing) instead of ever synthesizing a time.
 */
export function formatTurnCountdown(
  nextScheduledTurn: string | null,
  paused: boolean,
): string | null {
  if (!nextScheduledTurn) return null;
  const target = Date.parse(nextScheduledTurn);
  if (!Number.isFinite(target)) return null;
  if (paused) return "Paused";
  const diff = target - Date.now();
  if (diff <= 0) return "Processing...";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  if (days > 0) return `${days}d ${rest}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export interface MpNotificationView {
  id: string;
  title: string | null;
  message: string | null;
  read: boolean;
  createdAt: string | null;
}

export interface MpInboxView {
  notifications: MpNotificationView[];
  unreadCount: number;
  total: number | null;
  hasMore: boolean;
}

/** notifications GET: array + unreadCount required; entries tolerate drift. */
export function parseInbox(bodyText: string): MpInboxView | null {
  const record = asRecord(parseJsonBody(bodyText));
  if (!record || !Array.isArray(record.notifications)) return null;
  const unreadCount = asNumber(record.unreadCount);
  if (unreadCount === null) return null;
  const notifications: MpNotificationView[] = [];
  for (const entry of record.notifications) {
    const item = asRecord(entry);
    const id = item ? asTrimmedString(item._id) : null;
    // Server ids are 24-hex ObjectIds; anything else signals a drifting or
    // hostile payload and invalidates the inbox, never a single row.
    if (!item || !id || !HEX_OBJECT_ID.test(id)) return null;
    notifications.push({
      id,
      title: asTrimmedString(item.title ?? null),
      message: asTrimmedString(item.message ?? null),
      read: asBoolean(item.read) ?? false,
      createdAt: typeof item.createdAt === "string" ? item.createdAt : null,
    });
  }
  return {
    notifications,
    unreadCount,
    total: record.total === undefined ? null : asNumber(record.total),
    hasMore: asBoolean(record.hasMore) ?? false,
  };
}

export interface MpCapabilitiesView {
  hasCharacter: boolean;
  characterName: string | null;
  characterCountryId: string | null;
  unreadMailCount: number | null;
  corporationId: number | null;
  unionId: string | null;
  activeElectionLabel: string | null;
  /** client-nav activeElection.id: the live-site /elections/[seatId ?? id] target id. */
  activeElectionId: string | null;
  /** client-nav activeElection.seatId: preferred detail target when present. */
  activeElectionSeatId: string | null;
  cabinetOffice: string | null;
  governorOffice: string | null;
}

/**
 * client-nav: navbar essentials (AHDGame src/app/api/client-nav/route.ts).
 * Only the audited capability fields are projected; everything else stays
 * server-side. The top-level object plus `hasCharacter` are required, so a
 * drifting payload fails closed. Office and election decorations are
 * display-only and degrade to null individually, and the guest
 * (`user: null`, `hasCharacter: false`) shape is tolerated: right after a
 * signed-in probe it is a cookie race the next refresh reconciles.
 */
export function parseClientNav(bodyText: string): MpCapabilitiesView | null {
  const record = asRecord(parseJsonBody(bodyText));
  if (!record) return null;
  const hasCharacter = asBoolean(record.hasCharacter);
  if (hasCharacter === null) return null;
  const election = asRecord(record.activeElection);
  const cabinet = asRecord(record.cabinetOffice);
  const governor = asRecord(record.governorOffice);
  return {
    hasCharacter,
    characterName: asTrimmedString(record.characterName ?? null),
    characterCountryId: asTrimmedString(record.characterCountryId ?? null),
    unreadMailCount: record.unreadMailCount === undefined ? null : asNumber(record.unreadMailCount),
    corporationId: record.myCorporationId === undefined ? null : asNumber(record.myCorporationId),
    unionId: asTrimmedString(record.myUnionId ?? null),
    activeElectionLabel: election ? asTrimmedString(election.label ?? null) : null,
    activeElectionId: election ? asTrimmedString(election.id ?? null) : null,
    activeElectionSeatId: election ? asTrimmedString(election.seatId ?? null) : null,
    cabinetOffice: cabinet ? asTrimmedString(cabinet.positionName ?? null) : null,
    governorOffice: governor ? asTrimmedString(governor.stateName ?? null) : null,
  };
}

/**
 * Election detail reference accepted by GET /api/elections?id= (AHDGame
 * resolveElection accepts a 24-hex ObjectId or a seatId like US-senate-PA-1;
 * see isSeatId in src/lib/elections/resolveElection.ts). Bounded so the id
 * stays URL-safe without encoding and never carries query smuggling.
 */
const ELECTION_SEAT_ID = /^[A-Za-z]{2}(-[A-Za-z0-9]{1,16}){1,6}$/;
const ELECTION_ID_MAX_CHARS = 64;

export function isElectionId(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > ELECTION_ID_MAX_CHARS) return false;
  if (HEX_OBJECT_ID.test(value)) return true;
  return ELECTION_SEAT_ID.test(value);
}

/** Election ids are 24-hex ObjectIds or bounded seatIds; anything else never leaves the UI. */
export function validateElectionId(id: unknown): { ok: true; id: string } | { ok: false; reason: string } {
  if (!isElectionId(id)) {
    return { ok: false, reason: "That election reference is invalid." };
  }
  return { ok: true, id: id };
}

export interface MpElectionDetailView {
  id: string;
  seatId: string | null;
  electionType: string;
  state: string | null;
  countryId: string;
  cycle: number;
  status: string;
  inPrimary: boolean;
  isEnded: boolean;
  isUpcoming: boolean;
  inGeneral: boolean;
  /** Length of the summary-view candidates array; entries stay server-side. */
  candidateCount: number;
  leaderName: string | null;
  leaderParty: string | null;
  incumbentName: string | null;
  incumbentParty: string | null;
}

/**
 * election-detail: the route wraps the resolved race as { election }. The
 * summary view always carries identity, phase, and the candidates array
 * (enrichElection core data); polling and incumbent are nullable decorations
 * that degrade to null individually. Anything else fails closed.
 */
export function parseElectionDetail(bodyText: string): MpElectionDetailView | null {
  const record = asRecord(parseJsonBody(bodyText));
  const election = record ? asRecord(record.election) : null;
  if (!election) return null;
  const id = asTrimmedString(election.id);
  const electionType = asTrimmedString(election.electionType);
  const countryId = asTrimmedString(election.countryId);
  const cycle = asNumber(election.cycle);
  const status = asTrimmedString(election.status);
  const inPrimary = asBoolean(election.inPrimary);
  const isEnded = asBoolean(election.isEnded);
  const isUpcoming = asBoolean(election.isUpcoming);
  const inGeneral = asBoolean(election.inGeneral);
  if (!id || !electionType || !countryId || cycle === null || !status) return null;
  if (inPrimary === null || isEnded === null || isUpcoming === null || inGeneral === null) return null;
  if (!Array.isArray(election.candidates)) return null;
  // Decorations degrade to null individually: a mistyped polling or
  // incumbent object never invalidates the race, it just reads as absent.
  const polling = asRecord(election.polling);
  const incumbent = asRecord(election.incumbent);
  return {
    id,
    seatId: asTrimmedString(election.seatId ?? null),
    electionType,
    state: asTrimmedString(election.state ?? null),
    countryId,
    cycle,
    status,
    inPrimary,
    isEnded,
    isUpcoming,
    inGeneral,
    candidateCount: election.candidates.length,
    leaderName: polling ? asTrimmedString(polling.leaderName ?? null) : null,
    leaderParty: polling ? asTrimmedString(polling.leaderParty ?? null) : null,
    incumbentName: incumbent ? asTrimmedString(incumbent.name ?? null) : null,
    incumbentParty: incumbent ? asTrimmedString(incumbent.party ?? null) : null,
  };
}

/**
 * Corporation reference accepted by GET /api/corporations/[id] (AHDGame
 * corporationQueryFromParamId in src/lib/api/corporations/resolveQuery.ts
 * accepts a sequential numeric id or a 24-hex ObjectId; the ObjectId check
 * runs first so all-numeric 24-char hex is an ObjectId, never a sequence).
 * Numbers arrive from client-nav `myCorporationId`; strings stay URL-safe
 * without encoding and never carry query smuggling.
 */
export function isCorporationId(value: unknown): value is number | string {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 && value <= 999_999_999;
  }
  if (typeof value !== "string" || !value) return false;
  if (HEX_OBJECT_ID.test(value)) return true;
  return /^\d{1,10}$/.test(value);
}

/** Corporation ids are sequential numbers or 24-hex ObjectIds; anything else never leaves the UI. */
export function validateCorporationId(id: unknown): { ok: true; id: string } | { ok: false; reason: string } {
  if (!isCorporationId(id)) {
    return { ok: false, reason: "That corporation reference is invalid." };
  }
  return { ok: true, id: String(id) };
}

export interface MpCorporationDetailView {
  id: string;
  sequentialId: number | null;
  name: string;
  tickerSymbol: string | null;
  typeLabel: string | null;
  headquarters: string | null;
  countryId: string;
  isPrivate: boolean | null;
  ceoName: string | null;
  /** Length of the sectors array; entries stay server-side. */
  sectorCount: number;
}

/**
 * corporation-detail: the route answers the detail view as { corporation,
 * ceo, sectors, ... }. The summary projects identity, leadership, and scale
 * only: financials and the balance sheet stay server-side (outsiders see
 * fogged estimates or redacted nulls, never exact figures worth quoting).
 * Decorations degrade to null individually; identity drift fails closed.
 */
export function parseCorporationDetail(bodyText: string): MpCorporationDetailView | null {
  const record = asRecord(parseJsonBody(bodyText));
  const corporation = record ? asRecord(record.corporation) : null;
  if (!corporation) return null;
  const id = asTrimmedString(corporation._id);
  const name = asTrimmedString(corporation.name);
  const countryId = asTrimmedString(corporation.countryId);
  if (!id || !name || !countryId) return null;
  if (!Array.isArray(record?.sectors)) return null;
  // sequentialId degrades to null when absent (legacy docs predate it),
  // but a present mistyped value signals a drifting payload and fails
  // closed.
  const sequentialRaw = corporation.sequentialId;
  const sequentialId =
    sequentialRaw === undefined || sequentialRaw === null
      ? null
      : typeof sequentialRaw === "number" && Number.isInteger(sequentialRaw) && sequentialRaw >= 0
        ? sequentialRaw
        : null;
  if (sequentialRaw !== undefined && sequentialRaw !== null && sequentialId === null) return null;
  const ceo = asRecord(record?.ceo);
  return {
    id,
    sequentialId,
    name,
    tickerSymbol: asTrimmedString(corporation.tickerSymbol ?? null),
    typeLabel: asTrimmedString(corporation.typeLabel ?? null),
    headquarters: asTrimmedString(corporation.headquartersStateName ?? null),
    countryId,
    isPrivate: record?.isPrivate === undefined ? null : asBoolean(record.isPrivate),
    ceoName: ceo ? asTrimmedString(ceo.name ?? null) : null,
    sectorCount: (record.sectors as unknown[]).length,
  };
}

/** execute-action 200: {success:true, message}. */
export function parseExecuteResult(bodyText: string): string | null {
  const record = asRecord(parseJsonBody(bodyText));
  if (!record || record.success !== true) return null;
  return asTrimmedString(record.message);
}

/** notifications PATCH 200: {success:true}. */
export function parseMutationAck(bodyText: string): boolean {
  const record = asRecord(parseJsonBody(bodyText));
  return record?.success === true;
}

/** POST /api/auth/logout answers 200 {ok:true} (not {success:true}). */
export function parseLogoutAck(bodyText: string): boolean {
  const record = asRecord(parseJsonBody(bodyText));
  return record?.ok === true;
}

export interface MpExecuteArgs {
  actionType: MpExecuteActionType;
  targetState?: string;
  convertAmount?: number;
  count?: number;
}

/** Server refusal wording for batch runs the route will not accept. */
export const MP_BATCH_UNAVAILABLE_MESSAGE = "Batch execution is not available for this action.";

/**
 * Client-side pre-check mirroring the audited route schema: single runs send
 * no count; ×5/×10 runs go only to the six batchable types, never with a
 * convert amount. Returns the canonical body or a refusal reason; the Rust
 * bridge re-validates before anything is sent.
 */
export function validateExecuteArgs(
  args: { actionType: unknown; targetState?: unknown; convertAmount?: unknown; count?: unknown },
): { ok: true; body: Record<string, unknown> } | { ok: false; reason: string } {
  if (!isMpExecuteActionType(args.actionType)) {
    return { ok: false, reason: "That action is not supported in multiplayer Native mode." };
  }
  const body: Record<string, unknown> = { actionType: args.actionType };
  let count = 1;
  if (args.count !== undefined) {
    if (typeof args.count !== "number" || !Number.isInteger(args.count) || ![1, 5, 10].includes(args.count)) {
      return { ok: false, reason: "Batch runs are ×1, ×5, or ×10." };
    }
    count = args.count;
  }
  if (count > 1) {
    // Mirrors the route guard: batch runs need a batchable type, never
    // convertCash, never mixed with a convert amount.
    if (!isMpBatchableActionType(args.actionType)) {
      return { ok: false, reason: MP_BATCH_UNAVAILABLE_MESSAGE };
    }
    if (args.convertAmount !== undefined) {
      return { ok: false, reason: "Batch runs cannot include a convert amount." };
    }
    body.count = count;
  }
  if (args.targetState !== undefined) {
    if (typeof args.targetState !== "string" || !args.targetState.trim()) {
      return { ok: false, reason: "Region must be a non-empty identifier." };
    }
    // Server cap is MAX_REGION_ID_LENGTH (15) in AHDGame
    // src/lib/constants/states.ts; the route rejects longer ids outright.
    if (args.targetState.trim().length > 15) {
      return { ok: false, reason: "Region identifier is too long." };
    }
    body.targetState = args.targetState.trim();
  }
  if (args.convertAmount !== undefined) {
    if (typeof args.convertAmount !== "number" || !Number.isFinite(args.convertAmount)) {
      return { ok: false, reason: "Convert amount must be a number." };
    }
    if (args.convertAmount <= 0) {
      return { ok: false, reason: "Convert amount must be positive." };
    }
    if (args.actionType !== "convertCash") {
      return { ok: false, reason: "Convert amount only applies to Personal Campaign Donation." };
    }
    body.convertAmount = args.convertAmount;
  }
  return { ok: true, body };
}

/** Notification ids are 24-hex ObjectIds; anything else never leaves the UI. */
export function validateNotificationId(id: unknown): { ok: true; id: string } | { ok: false; reason: string } {
  if (typeof id !== "string" || !HEX_OBJECT_ID.test(id)) {
    return { ok: false, reason: "That notification reference is invalid." };
  }
  return { ok: true, id };
}

/**
 * Snooze length pre-check mirroring notificationsPatchSchema (#361):
 * an integer number of minutes in 5..10080; omitted means the server
 * default of 720. The adapter always sends the resolved minutes so the
 * notice can state what was requested.
 */
export function validateSnoozeMinutes(
  minutes: unknown,
): { ok: true; minutes: number } | { ok: false; reason: string } {
  if (minutes === undefined) {
    return { ok: true, minutes: MP_SNOOZE_MINUTES_DEFAULT };
  }
  if (typeof minutes !== "number" || !Number.isInteger(minutes)) {
    return { ok: false, reason: "Snooze length must be a whole number of minutes." };
  }
  if (minutes < MP_SNOOZE_MINUTES_MIN || minutes > MP_SNOOZE_MINUTES_MAX) {
    return {
      ok: false,
      reason: `Snooze length must be between ${MP_SNOOZE_MINUTES_MIN} and ${MP_SNOOZE_MINUTES_MAX} minutes.`,
    };
  }
  return { ok: true, minutes };
}

export interface MpMailMessage {
  id: string;
  /** Null for system mail: no sender exists, so no reply path is offered. */
  fromCharacterId: string | null;
  fromName: string | null;
  toCharacterId: string;
  toName: string | null;
  subject: string;
  body: string;
  read: boolean;
  createdAt: string | null;
}

export interface MpMailInbox {
  mails: MpMailMessage[];
  unreadCount: number;
  total: number | null;
  hasMore: boolean;
}

export interface MpMailSent {
  mails: MpMailMessage[];
  total: number | null;
  hasMore: boolean;
}

/** One serialized PlayerMail entry; null invalidates the whole page, never a row. */
function parseMailMessage(entry: unknown): MpMailMessage | null {
  const item = asRecord(entry);
  const id = item ? asTrimmedString(item._id) : null;
  if (!item || !id || !HEX_OBJECT_ID.test(id)) return null;
  const subject = asTrimmedString(item.subject ?? null);
  const body = asTrimmedString(item.body ?? null);
  // Subject and body are the message: a blank or missing one signals a
  // drifting or hostile payload, so the page fails closed.
  if (!subject || !body) return null;
  const fromRaw = item.fromCharacterId;
  const fromCharacterId =
    fromRaw === undefined || fromRaw === null ? null : asTrimmedString(fromRaw);
  if (fromCharacterId !== null && !HEX_OBJECT_ID.test(fromCharacterId)) return null;
  const toCharacterId = asTrimmedString(item.toCharacterId ?? null);
  if (!toCharacterId || !HEX_OBJECT_ID.test(toCharacterId)) return null;
  return {
    id,
    fromCharacterId,
    fromName: asTrimmedString(item.fromCharacterName ?? null),
    toCharacterId,
    toName: asTrimmedString(item.toCharacterName ?? null),
    subject,
    body,
    read: asBoolean(item.read) ?? false,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : null,
  };
}

/** GET /api/mail: mails + unreadCount required; the sent shape is separate. */
export function parseMailInbox(bodyText: string): MpMailInbox | null {
  const record = asRecord(parseJsonBody(bodyText));
  if (!record || !Array.isArray(record.mails)) return null;
  const unreadCount = asNumber(record.unreadCount);
  if (unreadCount === null) return null;
  const mails: MpMailMessage[] = [];
  for (const entry of record.mails) {
    const message = parseMailMessage(entry);
    if (!message) return null;
    mails.push(message);
  }
  // A present-but-non-numeric total signals a drifting or hostile payload,
  // so the page fails closed instead of coercing it to null.
  let total: number | null = null;
  if (record.total !== undefined) {
    const parsed = asNumber(record.total);
    if (parsed === null) return null;
    total = parsed;
  }
  return {
    mails,
    unreadCount,
    total,
    hasMore: asBoolean(record.hasMore) ?? false,
  };
}

/** GET /api/mail/sent: mails required; there is no unread count on this shape. */
export function parseMailSent(bodyText: string): MpMailSent | null {
  const record = asRecord(parseJsonBody(bodyText));
  if (!record || !Array.isArray(record.mails)) return null;
  const mails: MpMailMessage[] = [];
  for (const entry of record.mails) {
    const message = parseMailMessage(entry);
    if (!message) return null;
    mails.push(message);
  }
  // Same fail-closed total as the inbox page: a present non-number is a
  // drifting payload, never a silent null.
  let total: number | null = null;
  if (record.total !== undefined) {
    const parsed = asNumber(record.total);
    if (parsed === null) return null;
    total = parsed;
  }
  return {
    mails,
    total,
    hasMore: asBoolean(record.hasMore) ?? false,
  };
}

/**
 * Send pre-check mirroring sendMailSchema in AHDGame
 * src/app/api/mail/route.ts: a 24-hex recipient, a 1..80 subject, and a
 * 1..1000 body, all trimmed. Lengths are UTF-16 units, matching the server.
 * Returns the canonical body or a refusal reason; the Rust bridge
 * re-validates before anything is sent.
 */
export function validateMailSend(
  args: { toCharacterId: unknown; subject: unknown; body: unknown },
): { ok: true; body: { toCharacterId: string; subject: string; body: string } } | { ok: false; reason: string } {
  const toCharacterId =
    typeof args.toCharacterId === "string" ? args.toCharacterId.trim() : "";
  if (!HEX_OBJECT_ID.test(toCharacterId)) {
    return { ok: false, reason: "Recipient must be a 24-character character ID." };
  }
  if (typeof args.subject !== "string" || !args.subject.trim()) {
    return { ok: false, reason: "Subject is required." };
  }
  if (args.subject.trim().length > MP_MAIL_SUBJECT_MAX) {
    return { ok: false, reason: `Subject must be ${MP_MAIL_SUBJECT_MAX} characters or fewer.` };
  }
  if (typeof args.body !== "string" || !args.body.trim()) {
    return { ok: false, reason: "Message body is required." };
  }
  if (args.body.trim().length > MP_MAIL_BODY_MAX) {
    return { ok: false, reason: `Message body must be ${MP_MAIL_BODY_MAX} characters or fewer.` };
  }
  return {
    ok: true,
    body: { toCharacterId, subject: args.subject.trim(), body: args.body.trim() },
  };
}

/** Mail ids are 24-hex ObjectIds; anything else never leaves the UI. */
export function validateMailId(id: unknown): { ok: true; id: string } | { ok: false; reason: string } {
  if (typeof id !== "string" || !HEX_OBJECT_ID.test(id)) {
    return { ok: false, reason: "That mail reference is invalid." };
  }
  return { ok: true, id };
}

export interface MpClientNavPermissions {
  isAdmin: boolean;
  isModerator: boolean;
}

/**
 * client-nav permission gate (#359 admin slice): the ONLY admin signal
 * Native trusts. Both flags must be real booleans; a missing, numeric, or
 * string flag never means admin — it means malformed.
 */
export function parseClientNavPermissions(bodyText: string): MpClientNavPermissions | null {
  const record = asRecord(parseJsonBody(bodyText));
  const user = record ? asRecord(record.user) : null;
  if (!user) return null;
  const isAdmin = asBoolean(user.isAdmin);
  const isModerator = asBoolean(user.isModerator);
  if (isAdmin === null || isModerator === null) return null;
  return { isAdmin, isModerator };
}

export type MpMaintenanceMode = "off" | "partial" | "full";

export interface MpMaintenanceStatus {
  mode: MpMaintenanceMode;
  enabled: boolean;
  reason: string;
  expectedEnd: string;
  enabledBy: string;
  enabledAt: string;
}

function asStringField(value: unknown): string | null {
  return typeof value === "string" ? value.slice(0, 500) : null;
}

/** admin-maintenance GET: fixed six-field DTO; anything else is malformed. */
export function parseMaintenanceStatus(bodyText: string): MpMaintenanceStatus | null {
  const record = asRecord(parseJsonBody(bodyText));
  if (!record) return null;
  const mode = record.mode;
  if (mode !== "off" && mode !== "partial" && mode !== "full") return null;
  const enabled = asBoolean(record.enabled);
  const reason = asStringField(record.reason);
  const expectedEnd = asStringField(record.expectedEnd);
  const enabledBy = asStringField(record.enabledBy);
  const enabledAt = asStringField(record.enabledAt);
  if (enabled === null || reason === null || expectedEnd === null || enabledBy === null || enabledAt === null) {
    return null;
  }
  return { mode, enabled, reason, expectedEnd, enabledBy, enabledAt };
}

/**
 * Preference pre-check mirroring notificationPreferenceActionSchema (#361):
 * only mute/unmute with an allowlisted notification type. Preference
 * snooze/unsnooze stay absent and are refused here.
 */
export function validateNotificationPreference(
  args: { action: unknown; type: unknown },
): { ok: true; body: { action: MpNotificationPreferenceAction; type: MpNotificationType } } | { ok: false; reason: string } {
  if (!isMpNotificationPreferenceAction(args.action)) {
    return { ok: false, reason: "Preference action must be mute or unmute." };
  }
  if (!isMpNotificationType(args.type)) {
    return { ok: false, reason: "That notification type cannot take a preference here." };
  }
  return { ok: true, body: { action: args.action, type: args.type } };
}
