/**
 * Audited multiplayer endpoint registry (#359).
 *
 * Pinned against public AHDGame at e364c04954ed628beef73a993a8e9e156650a31e.
 * Every entry records the method, auth gate, rate limit, and response shapes
 * the Native adapter relies on. The server is authoritative: this file models
 * the contract, it never reimplements it.
 *
 * Auth model (src/lib/auth.ts, src/lib/api/requireAuth.ts):
 * - JWT in an HttpOnly SameSite=Lax cookie. Native holds no session
 *   material; reads/writes run as first-party fetch() inside the persistent
 *   live-site window (#149), so the jar attaches by itself.
 * - Human mutation endpoints run assertSameOrigin: header-less or
 *   same-origin requests pass; cross-origin or X-Bot-Token requests get 403.
 *   The bridge sends no custom headers, so same-origin fetch passes.
 * - 401 envelope: { error, code: "UNAUTHORIZED" } (auth/session legacy probe:
 *   { active: false } with `Cache-Control: private, no-store` + Vary: Cookie).
 * - 429 envelope: { error, code: "rate_limited", retryAfterSeconds } plus a
 *   Retry-After response header (same-origin fetch can read it).
 * - Generic envelope: { error, code?, details? } (src/lib/api/errors.ts).
 *
 * Audited reads (all GET):
 * - auth-session      /api/auth/session        200 {active:true,sub,username,email,iat,exp}
 *                                                  401 {active:false}  503 {error} (dep failure, NOT invalid)
 * - character-me      /api/character/me        requireAuthWithCharacter/basic; 401
 *   {foundingCooldownTurnsRemaining, character:{_id,name,party,homeState,
 *   cashOnHand,actions,countryId,...}, corporation:{...}|null}
 *   Cache: no-store. (PATCH /api/character/me exists for onboarding flags;
 *   not modeled: absent in v1.)
 * - client-nav        /api/client-nav          optional auth, guest fallback
 * - turn-status       /api/game/turn/status    public; 404 uninitialized
 *   {singleplayer,currentTurn,currentYear,isActive,isProcessing,
 *   nextScheduledTurn|null,processingPhaseLabel,...}
 * - game-time         /api/game-time           public fallback
 * - notifications     /api/notifications       requireBasicAuth; 401
 *   query limit (default 50, hard max 100), offset; response {notifications[]
 *   (string _id/userId), unreadCount, total, hasMore, ...}
 *
 * Audited writes:
 * - execute-action    POST /api/actions/execute  requireHumanSession
 *   (bot tokens rejected); 30 req/min per userId -> 429
 *   body {actionType x9, count?: 1|5|10, targetState?: trimmed string,
 *   convertAmount?: positive number}
 *   route rules mirrored in the bridge: count>1 needs a batchable type
 *   (fundraise, campaign, advertise, buildDonorBase, poll, pollLarge),
 *   never convertCash, never count+convertAmount together; requiresState
 *   actions need targetState (all nine registry actions set
 *   requiresState:false, but the route guard stands).
 *   400 validation/refusal with server message, 404 no character,
 *   409 paused ("The game is currently paused."), 429 limited.
 *   200 {success:true, message, character: updatedCharacter}.
 *   Batch refusal ("Batch execution is not available for this action.", 400)
 *   surfaces verbatim; prior state stands, no refresh is claimed.
 * - notification-read    PATCH /api/notifications {id: 24-hex, action:"read"}
 *   30/min -> 429; 200 {success:true}. Idempotent (updateOne $set read:true).
 * - notification-archive PATCH /api/notifications {id, action:"archive"}
 *   same gate; sets archivedAt + read:true.
 * - notification-mark-all-read PATCH /api/notifications {} (no id)
 *   updateMany read:true in scope. 200 {success:true}.
 * - notification-snooze    PATCH /api/notifications {id: 24-hex,
 *   action:"snooze", snoozeMinutes?: 5..10080 int} (omitted: server
 *   defaults to 720). Sets snoozedUntil; 30/min -> 429; 200 {success:true}.
 * - notification-unsnooze  PATCH /api/notifications {id, action:"unsnooze"}
 *   $unset snoozedUntil. 200 {success:true}.
 * - notification-unarchive PATCH /api/notifications {id, action:"unarchive"}
 *   $unset archivedAt. 200 {success:true}.
 * - notification-preference PUT /api/notifications/preferences
 *   {action:"mute"|"unmute", type: NOTIFICATION_TYPES member}
 *   (notificationPreferenceActionSchema; preference snooze/unsnooze and
 *   DELETE exist server-side, not modeled: absent).
 *   requireBasicAuth; 30/min -> 429; 200 {success:true}.
 *
 * Deliberately absent (#361 shrinks the v1 set to the above): every other
 * mutation surface (legislature, elections, travel, finance, corporations,
 * guilds, messaging), preference snooze/unsnooze, notification DELETE, and
 * local turn advancement — MP turns advance on the server schedule only.
 */

export const MP_AUDIT_REVISION = "e364c04954ed628beef73a993a8e9e156650a31e";
export const MP_ORIGIN = "https://ahousedividedgame.com";

export type MpFetchOpId =
  | "auth-session"
  | "character-me"
  | "client-nav"
  | "turn-status"
  | "game-time"
  | "notifications";

export type MpMutateOpId =
  | "execute-action"
  | "notification-read"
  | "notification-archive"
  | "notification-mark-all-read"
  | "notification-snooze"
  | "notification-unsnooze"
  | "notification-unarchive"
  | "notification-preference";

export type MpExecuteActionType =
  | "fundraise"
  | "campaign"
  | "advertise"
  | "buildDonorBase"
  | "poll"
  | "pollLarge"
  | "convertCash"
  | "rest"
  | "debatePrep";

/** Server action names/descriptions (AHDGame src/lib/actions.ts). UI labels must match these. */
export const MP_EXECUTE_ACTIONS: ReadonlyArray<{
  type: MpExecuteActionType;
  name: string;
  description: string;
}> = [
  { type: "fundraise", name: "Fundraise", description: "Raise money from your donor base" },
  {
    type: "campaign",
    name: "Campaign",
    description:
      "Increase your political influence — up to +1%, with diminishing returns above 50% (cost scales with current influence and state GDP)",
  },
  { type: "advertise", name: "Run Advertisements", description: "Run ads to boost your favorability rating" },
  {
    type: "buildDonorBase",
    name: "Build Donor Network",
    description: "Expand your donor base to increase fundraising effectiveness",
  },
  {
    type: "poll",
    name: "Quick Poll",
    description:
      "Commission a quick poll — see your topline appeal and best/worst demographic groups ($25,000)",
  },
  {
    type: "pollLarge",
    name: "Full Demographic Poll",
    description:
      "Commission a comprehensive poll — full breakdown across every demographic group and category ($75,000)",
  },
  {
    type: "convertCash",
    name: "Personal Campaign Donation",
    description: "Convert personal cash on hand into campaign funds at a 50% rate (infamy scales with amount)",
  },
  { type: "rest", name: "Rest", description: "Take a break (does nothing)" },
  {
    type: "debatePrep",
    name: "Debate Prep",
    description: "Study briefing books and rehearse. 10% chance to raise your Debate skill by 1. No fund cost.",
  },
];

export const MP_EXECUTE_ACTION_TYPES: ReadonlyArray<MpExecuteActionType> = MP_EXECUTE_ACTIONS.map(
  (entry) => entry.type,
);

export function isMpExecuteActionType(value: unknown): value is MpExecuteActionType {
  return (
    typeof value === "string" &&
    (MP_EXECUTE_ACTION_TYPES as ReadonlyArray<string>).includes(value)
  );
}

/**
 * Server-batchable action types (#361), pinned to BATCHABLE_ACTION_TYPES in
 * AHDGame src/lib/actions.ts: the only types the execute route accepts with
 * count 5 or 10. Everything else (convertCash, rest, debatePrep) is
 * single-run; the server refuses batches with 400
 * "Batch execution is not available for this action."
 */
export const MP_BATCHABLE_ACTION_TYPES: ReadonlyArray<MpExecuteActionType> = [
  "fundraise",
  "campaign",
  "advertise",
  "buildDonorBase",
  "poll",
  "pollLarge",
];

export function isMpBatchableActionType(value: unknown): value is MpExecuteActionType {
  return (
    typeof value === "string" &&
    (MP_BATCHABLE_ACTION_TYPES as ReadonlyArray<string>).includes(value)
  );
}

/** Batch counts the execute route schema accepts (omitted or 1 = single). */
export const MP_EXECUTE_COUNTS: ReadonlyArray<number> = [1, 5, 10];

/** Snooze window from notificationsPatchSchema (minutes); omitted = 720. */
export const MP_SNOOZE_MINUTES_MIN = 5;
export const MP_SNOOZE_MINUTES_MAX = 7 * 24 * 60;
export const MP_SNOOZE_MINUTES_DEFAULT = 12 * 60;

export type MpNotificationPreferenceAction = "mute" | "unmute";

export function isMpNotificationPreferenceAction(
  value: unknown,
): value is MpNotificationPreferenceAction {
  return value === "mute" || value === "unmute";
}

/**
 * Notification types accepted by notificationPreferenceActionSchema (#361),
 * pinned to NOTIFICATION_TYPES in AHDGame src/lib/db/types/notifications.ts.
 * Only mute/unmute are modeled in Native; preference snooze/unsnooze stay
 * absent.
 */
export const MP_NOTIFICATION_TYPES = [
  "welcome",
  "primary_win",
  "primary_loss",
  "general_win",
  "general_loss",
  "impeachment_filed",
  "impeachment_convicted",
  "player_attack",
  "player_support",
  "system",
  "leadership_elected",
  "leadership_lost",
  "leadership_appointed",
  "command_appointed",
  "treaty_defence_invoked",
  "leadership_removed",
  "leadership_candidacy",
  "leadership_election_opened",
  "national_leadership_elected",
  "national_leadership_lost",
  "national_leadership_appointed",
  "national_leadership_removed",
  "national_leadership_candidacy",
  "national_leadership_election_opened",
  "committee_election_opened",
  "committee_elected",
  "committee_lost",
  "committee_removed",
  "committee_candidacy",
  "bill_vote_open",
  "bill_passed_chamber",
  "crisis",
  "bill_failed_chamber",
  "bill_enrolled",
  "bill_signed",
  "bill_vetoed",
  "feedback_status_changed",
  "new_feedback",
  "new_player_suggestion",
  "player_suggestion_status_changed",
  "player_suggestion_new_comment",
  "player_suggestion_merged",
  "new_post",
  "turn_advance",
  "resource_income",
  "election_opened",
  "ceo_vote_offer",
  "ceo_resigned",
  "ceo_elected",
  "corp_sector_sold",
  "corp_sector_attacked",
  "corp_nationalization_notice",
  "corp_nationalization_cancelled",
  "corp_nationalization_risk",
  "corp_privatization_offered",
  "corp_privatization_resolved",
  "corp_credit_rating_change",
  "corp_bond_due_soon",
  "corp_bond_repaid",
  "corp_bond_auto_refinanced",
  "corp_bond_auto_restructured",
  "cb_auction_shortfall",
  "corp_inactive_ceo_share_release_warning",
  "wire_received",
  "coalition_invite_received",
  "coalition_invite_accepted",
  "coalition_invite_declined",
  "coalition_join_request",
  "coalition_join_accepted",
  "coalition_join_declined",
  "coalition_kicked",
  "coalition_disband_vote_started",
  "coalition_disbanded",
  "coalition_chair_transferred",
  "share_listing_offer_received",
  "share_offer_accepted",
  "share_offer_expired",
  "corp_hostile_takeover_available",
  "party_whip_issued",
  "party_kicked",
  "party_join_request",
  "party_join_accepted",
  "party_join_declined",
  "caucus_chair_election_opened",
  "caucus_chair_elected",
  "caucus_chair_lost",
  "caucus_chair_removed",
  "rd_breakthrough",
  "wiki_submission_pending",
  "wiki_submission_approved",
  "wiki_submission_rejected",
  "supporter_request_pending",
  "supporter_request_approved",
  "supporter_request_rejected",
  "corp_vote_opened",
  "corp_vote_reminder",
  "corp_vote_passed",
  "corp_vote_failed",
  "corp_vote_cancelled",
  "charter_invited",
  "charter_replacement_needed",
  "charter_ratified",
  "share_invite_received",
  "share_invite_cancelled",
  "share_invite_declined",
  "share_invite_accepted",
  "player_event",
  "player_event_resolved",
  "extraction_capacity_bound",
  "union_leader_offer",
  "union_busting_attempted",
  "bargaining_dispute_lapsed",
  "overtime_ban_defunded",
  "bargaining_ratification_open",
  "bargaining_ratification_closed",
  "world_event_offered",
  "world_event_resolved",
  "prospect_succeeded",
  "prospect_failed",
  "contract_offered",
  "contract_royalty_missed",
  "contract_defaulted",
  "contract_expired",
  "merger_review_opened",
  "merger_review_decided",
  "merger_remedy_overdue",
  "transfer_pricing_assessed",
  "corp_supply_agreement_damages",
  "bank_supervision_breach",
  "bank_supervision_cleared",
  "defence_contract_offered",
  "defence_contract_cancelled",
  "ask_refund",
  "ask_correction",
  "ask_watch",
] as const;

export type MpNotificationType = (typeof MP_NOTIFICATION_TYPES)[number];

export function isMpNotificationType(value: unknown): value is MpNotificationType {
  return (
    typeof value === "string" &&
    (MP_NOTIFICATION_TYPES as ReadonlyArray<string>).includes(value)
  );
}
