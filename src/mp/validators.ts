import {
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
