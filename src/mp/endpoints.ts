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
 *   v1 UI sends single runs (count omitted) only; batch is a later slice.
 * - notification-read    PATCH /api/notifications {id: 24-hex, action:"read"}
 *   30/min -> 429; 200 {success:true}. Idempotent (updateOne $set read:true).
 * - notification-archive PATCH /api/notifications {id, action:"archive"}
 *   same gate; sets archivedAt + read:true.
 * - notification-mark-all-read PATCH /api/notifications {} (no id)
 *   updateMany read:true in scope. 200 {success:true}.
 *   (snooze/unsnooze/unarchive/preferences/DELETE exist server-side;
 *   not modeled: absent in v1.)
 *
 * Deliberately absent in v1 (no control, inert or otherwise): every other
 * mutation surface (legislature, elections, travel, finance, corporations,
 * guilds, messaging), batch counts, and local turn advancement — MP turns
 * advance on the server schedule only.
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
  | "notification-mark-all-read";

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
    description: "Increase your political influence (cost scales with influence and state GDP)",
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
    description: "Commission a quick poll: topline appeal and best/worst demographic groups ($25,000)",
  },
  {
    type: "pollLarge",
    name: "Full Demographic Poll",
    description: "Commission a comprehensive poll across every demographic group ($75,000)",
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
