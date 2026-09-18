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
 * - players-online    GET /api/players/online    public, no session required.
 *   Count of non-banned players active within the last hour
 *   (src/app/api/players/online/route.ts): 200 {online: number, asOf: ISO}.
 *   Cache: public, max-age=120, s-maxage=120, stale-while-revalidate=60.
 *   No documented rate limit or error envelope: every failure (including a
 *   surprising 401) means absent, never zero, and never expires the session.
 *   The reference StatusBar polls it every 5 minutes plus on visibility and
 *   renders nothing until a fetch succeeds; Native mirrors that posture with
 *   an independent loadPresence that never touches phase or error state.
 * - game-time         /api/game-time           public fallback
 * - notifications     /api/notifications       requireBasicAuth; 401
 *   query limit (default 50, hard max 100), offset; response {notifications[]
 *   (string _id/userId), unreadCount, total, hasMore, ...}
 * - election-detail   /api/elections?id={id}&view=summary  GET, optional auth
 *   (AHDGame src/app/api/elections/route.ts single mode; the page shell at
 *   src/app/elections/[id]/page.tsx and ElectionDetailClient poll the same
 *   `?id=&view=full` shape, Native reads the summary view). The id accepts a
 *   24-hex ObjectId or a seatId (e.g. US-senate-PA-1); client-nav
 *   `activeElection` carries both (`seatId ?? id` is the live-site target).
 *   Optional auth via the first-party session cookie: signed-in readers get
 *   the fog-of-war personalization, signed-out readers get the public shape.
 *   Cache: no-store — resolveElection personalizes by userId/character, so
 *   the response must never be shared-cached (the route answers conditional
 *   ETag/304 for its own 60s poll; Native keeps no copy beyond memory).
 *   Errors: 400 missing/invalid id (or country/cycle on sibling modes),
 *   404 election not found, generic { error } envelope (src/lib/api/errors).
 *   No per-route rate limit is documented; a 429 still maps through the
 *   shared remote-error contract. Native projects identity + phase + field
 *   size + leader only; candidacy, campaigns, endorsements, and every write
 *   stay absent.
 * - corporation-detail  GET /api/corporations/[id]  public with optional auth
 *   (AHDGame src/app/api/corporations/[id]/route.ts; the page shell at
 *   src/app/corporation/[id]/page.tsx reads the same shape via
 *   fetch(`/api/corporations/${id}`)). The id accepts a sequential numeric
 *   id (client-nav `myCorporationId`, the live-site /corporation/[id]
 *   target) or a 24-hex ObjectId (see corporationQueryFromParamId in
 *   src/lib/api/corporations/resolveQuery.ts). Optional auth via the
 *   first-party session cookie: signed-in readers get the insider/redaction
 *   personalization, signed-out readers get the public shape (private corps
 *   redact financials, public corps fog them for outsiders). Cache: no-store
 *   — the response personalizes by viewer, so it must never be shared-cached
 *   and Native keeps no copy beyond memory. Errors: 400 invalid id,
 *   404 corporation not found, generic { error } envelope
 *   (src/lib/api/errors handleRouteError). No per-route rate limit is
 *   documented; a 429 still maps through the shared remote-error contract.
 *   Native projects identity + leadership + scale only (name, ticker, type,
 *   headquarters, CEO, sector count, public/private); financials, balance
 *   sheet, and every write stay absent, so fog/redaction drift cannot leak
 *   into exact figures.
 * - union-detail  GET /api/unions/[id]  public, no auth required
 *   (AHDGame src/app/api/unions/[id]/route.ts; the page shell at
 *   src/app/unions/[id]/page.tsx reads the same shape via
 *   fetch(`/api/unions/${id}`)). The id is the 24-hex ObjectId client-nav
 *   `myUnionId` carries (resolved by resolveMyUnionNav in
 *   src/lib/navigation/resolveMyUnionNav.ts: the led union, else the
 *   strongest organized union). The route itself checks ObjectId.isValid,
 *   but Native pins strict 24-hex and fails closed on anything else.
 *   No auth is required: the viewer resolves optionally server-side (only
 *   to personalize ratification ballots on campaigns under ratification),
 *   so signed-out readers get the same public shape through the
 *   first-party session. Cache: no-store — Native keeps no copy beyond
 *   memory. Errors: 403 while the labour system is not in full mode
 *   ("Player-run unions are not enabled."), 400 invalid id, 404 union not
 *   found, generic { error } envelope (src/lib/api/errors
 *   handleRouteError). No per-route rate limit is documented; a 429 still
 *   maps through the shared remote-error contract. Native projects
 *   identity + leadership + scale only (name, sector, country, leader,
 *   members, approval, treasury, sector count, leadership-election flag);
 *   bargaining campaigns, dues/services panels, pension, endorsements, and
 *   every write stay absent.
 * - cabinet-detail  GET /api/country/[code]/executive/cabinet/[positionId]/briefing
 *   (AHDGame src/app/api/country/[code]/executive/cabinet/[positionId]/briefing/route.ts;
 *   the office page at src/app/country/[code]/executive/cabinet/[positionId]/office/page.tsx
 *   reads the same shape via useCabinetOffice). Auth is public with an
 *   optional viewer (getAuthUserWithCharacter personalizes canView/canAct);
 *   the first-party session cookie carries it. The country code is the
 *   lowercase client-nav `cabinetOffice.countryCode` (COUNTRY_CONFIGS key,
 *   e.g. us/sco/wal); the position id is the snake_case (one camelCase:
 *   generalSecretary) client-nav `cabinetOffice.positionId` (e.g.
 *   secretary_of_state). Errors: 400 invalid country, 404 unknown position
 *   or a gone seat, generic { error } envelope (src/lib/api/errors
 *   handleRouteError). A viewer who may not work the office still gets the
 *   withheld shape ({canView:false, position, member, restriction}) rather
 *   than an error: the seat, its department, and its holder are roster
 *   facts published on the cabinet list and the holder page. Cache:
 *   no-store — Native keeps no copy beyond memory. Native projects the
 *   letterhead plus roster facts only (seat id/name/department, holder
 *   name/party/acting/tenure, canView/canAct, withheld restriction
 *   titles); mechanics, settings, orders, metrics, budgets, military,
 *   monetary, and every write stay absent, so privileged departmental
 *   record cannot leak into exact figures.
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
 * - auth-logout  POST /api/auth/logout  public (verifyAuth optional), empty
 *   body. Clears the auth cookie (Set-Cookie expiry) and revokes issued
 *   tokens via authRevokedAt, answering 200 {ok:true}. This is the only
 *   bridge call that ends an account link: login, register, password, and
 *   delete-account surfaces stay absent, never sent. Neighboring logout
 *   semantics: no rate limit documented; 401 means the session is already
 *   dead (unlink achieved), anything else surfaces through the shared
 *   remote-error contract.
 *
 * Audited admin reads (#359 admin slice; GET only, no mutations modeled):
 * - client-nav (above) doubles as the authoritative permission gate: the
 *   response `user.isAdmin` / `user.isModerator` booleans (resolved in
 *   src/lib/auth.ts mapUserToAuthUser from the DB user + JWT claims) are
 *   the ONLY admin signal Native trusts. The legacy /api/auth/session
 *   probe carries no role flags and must never gate admin.
 * - admin-maintenance  GET /api/admin/maintenance  requireAdmin
 *   (src/app/api/admin/maintenance/route.ts): 200 {mode
 *   ("off"|"partial"|"full"), enabled, reason, expectedEnd, enabledBy,
 *   enabledAt}; 403 {error} for signed-in non-admins; 401 signed out.
 *   Read-only site-status triage. The PATCH sibling (maintenance mode
 *   writes) is deliberately absent: mode changes can take the site
 *   offline and stay out of the mobile slice.
 *
 * Deliberately absent (#361 shrinks the v1 set to the above): every other
 * mutation surface (legislature, elections, travel, finance, corporations,
 * guilds), preference snooze/unsnooze, notification DELETE, and
 * local turn advancement — MP turns advance on the server schedule only.
 *
 * Player mail (#359 chat slice), audited against AHDGame at the same
 * revision (src/app/api/mail/*, src/lib/mail/{commands,queries,dto}):
 * - mail-inbox  GET /api/mail?limit&offset  requireAuthWithCharacter; 401
 *   otherwise. Query limit 1..50 (default 20), offset >= 0; response
 *   {mails[] (serialized PlayerMail: string _id/fromCharacterId|null,
 *   toUserId/toCharacterId, subject, body, read, createdAt ISO),
 *   unreadCount, total, hasMore}. Cache: no-store.
 * - mail-sent   GET /api/mail/sent?limit&offset  same gate and paging;
 *   response {mails[], total, hasMore} (no unread count).
 * - mail-send   POST /api/mail  requireAuthWithCharacter;
 *   body {toCharacterId: ObjectId, subject: 1..80, body: 1..1000}
 *   (zod sendMailSchema; limits count UTF-16 units, like JS length).
 *   1 req/min per character id -> 429 with Retry-After. 400 validation,
 *   self-send ("Cannot send mail to yourself"), or banned recipient
 *   ("Cannot send mail to this player"); 404 recipient not found
 *   ("Recipient not found"). 200 {success:true}. No optimistic send is
 *   modeled: the adapter refreshes the mail pages before claiming success.
 * - mail-read   PATCH /api/mail/[id] (empty body)  requireAuthWithCharacter;
 *   30/min per userId -> 429; 200 {success:true}; 404 mail not found.
 * - mail-delete DELETE /api/mail/[id] (empty body)  same gate; soft-deletes
 *   the recipient copy (hard-deletes when the sender already deleted it).
 *   200 {success:true}; 404.
 * - mail-sent-delete DELETE /api/mail/sent/[id] (empty body)  same gate;
 *   soft-deletes the sender copy. 200 {success:true}; 404.
 * - mail-report POST /api/mail/[id]/report (empty body)
 *   requireAuthWithCharacter; recipient only, one report per mail.
 *   10/min per userId -> 429; 200 {success:true}; 403 non-recipient or bad
 *   id ("Forbidden"); 409 already reported ("Already reported"). Reports
 *   notify staff server-side; there is no client-visible admin surface.
 *
 * Mail auth notes: the mail routes use plain requireAuthWithCharacter (no
 * X-Bot-Token rejection, no in-route assertSameOrigin); the bridge still
 * sends no custom headers over the first-party session, same posture as the
 * other audited calls. Human-mutation Bot/CSRF guards stay documented on
 * execute-action only.
 *
 * Deliberately absent from the mail slice:
 * - GET /api/mail/[id]: no such endpoint exists server-side. Native can only
 *   show mail already loaded in a page, never fetch one message directly.
 * - /api/admin/mail-reports (requireModerator: admins AND moderators) and
 *   any staff-gated mail creation: Native's admin surface is only the
 *   read-only GET /api/admin/maintenance gated by client-nav `user.isAdmin`.
 *   Moderators never get that read. /api/auth/me carries extra admin
 *   material but is not allowlisted, and mail-reports stay absent.
 * - Thread grouping (AHDGame src/lib/inbox/mailThreads groups inbox+sent by
 *   counterpart+normalized subject client-side): Native shows the flat
 *   audited inbox/sent pages; grouping stays an explicit gap.
 * - Recipient lookup: POST /api/mail takes a raw character ObjectId and the
 *   reference composer opens from a profile with the id known. No player
 *   search endpoint is allowlisted, so Native compose takes a pasted
 *   24-hex character id.
 */

export const MP_AUDIT_REVISION = "e364c04954ed628beef73a993a8e9e156650a31e";
export const MP_ORIGIN = "https://ahousedividedgame.com";

export type MpFetchOpId =
  | "auth-session"
  | "character-me"
  | "client-nav"
  | "turn-status"
  | "players-online"
  | "game-time"
  | "notifications"
  | "mail-inbox"
  | "mail-sent"
  | "admin-maintenance"
  | "election-detail"
  | "corporation-detail"
  | "union-detail"
  | "cabinet-detail";

export type MpMutateOpId =
  | "execute-action"
  | "notification-read"
  | "notification-archive"
  | "notification-mark-all-read"
  | "notification-snooze"
  | "notification-unsnooze"
  | "notification-unarchive"
  | "notification-preference"
  | "mail-send"
  | "mail-read"
  | "mail-delete"
  | "mail-sent-delete"
  | "mail-report"
  | "auth-logout";

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

/**
 * Player-mail send schema limits (#359 chat slice), pinned to
 * sendMailSchema in AHDGame src/app/api/mail/route.ts. The server counts in
 * UTF-16 units (zod string max), so the TS pre-check uses string length and
 * the Rust bridge counts UTF-16 units too.
 */
export const MP_MAIL_SUBJECT_MAX = 80;
export const MP_MAIL_BODY_MAX = 1000;
