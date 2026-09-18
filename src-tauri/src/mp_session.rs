//! Authenticated multiplayer session bridge (#359).
//!
//! Desktop reads and writes run as first-party `fetch()` calls inside the
//! persistent `online` WebView delivered under #149. Mobile has one WebView,
//! so it reads only the current account cookie from that platform-owned jar
//! and relays the same tightly allowlisted requests directly. Neither path
//! persists session material, tokens, or passwords, and there is no login
//! form anywhere in Native. The server stays authoritative for auth,
//! validation, rate limits, conflicts, and errors; Native only projects
//! results and surfaces server messages.
//!
//! What this bridge does:
//! - `mp_session_fetch`: GET-only reads against the pinned
//!   `https://ahousedividedgame.com` origin, restricted to [`MpFetchOp`].
//! - `mp_session_mutate`: POST/PATCH/PUT/DELETE writes against the same
//!   origin, restricted to [`MpMutateOp`] with per-operation payload validation.
//! - Every dynamic script fragment (request id, path, method, body) is
//!   JSON-serialized in Rust, never interpolated, so caller input cannot
//!   break out of the evaluated script.
//! - The page script sends `Accept: application/json` (plus `Content-Type`
//!   on writes) and nothing else: no bot headers, no explicit Origin — the
//!   browser attaches the first-party Origin itself, which is exactly what
//!   the server's same-origin guard accepts.
//! - Redirects are `manual`: a bounced bridge call fails closed instead of
//!   following off-origin.
//! - Responses must be JSON and fit [`MP_SESSION_MAX_BODY_BYTES`]; nothing
//!   is written to disk and nothing is cached.
//!
//! Transport contract: on 2xx the command resolves with the raw server body
//! text (validation into view models happens in the TypeScript adapter).
//! Anything else rejects with a stable string:
//! `remote-error:{status}:{retry_after_secs}:{body_prefix}` preserves the
//! server status and message so the adapter can distinguish signed-out (401)
//! from refusal (400/403/404), conflict (409), rate limit (429), and outage
//! (5xx). `session-unavailable` means no online window could be provided
//! (creation failed, or a single-view mobile build with no session cookie):
//! the UI must offer the live-site sign-in path and retry, never invent data.
//!
//! Desktop cold-boot restore (#149): after a full relaunch no online window
//! exists yet, so the first call lazily provides a hidden persistent one at
//! the pinned origin and waits (bounded) for first-party navigation before
//! probing. A valid durable cookie then restores silently; only a real 401
//! reports signed out. A window that never commits reports
//! `session-transport` (offline with retry): neither failure is ever misread
//! as signed out.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use tauri::Manager;

const MP_SESSION_SCHEME: &str = "https";
const MP_SESSION_HOST: &str = "ahousedividedgame.com";

/// The only origin the bridge ever talks to, composed from the pinned parts
/// so the scheme and host pins are load-bearing in non-test code too.
fn session_origin() -> String {
    format!("{MP_SESSION_SCHEME}://{MP_SESSION_HOST}")
}
const MP_SESSION_WINDOW_LABEL: &str = "online";

/// Largest single endpoint body accepted; larger bodies are rejected before
/// parsing so a hostile or drifting endpoint cannot blow up device memory.
const MP_SESSION_MAX_BODY_BYTES: usize = 256 * 1024;
/// Page-side fetch budget per call; the Rust poll loop runs slightly longer.
const MP_SESSION_FETCH_TIMEOUT_SECS: u64 = 15;
const MP_SESSION_POLL_INTERVAL_MS: u64 = 120;
const MP_SESSION_POLL_ROUNDS: u32 = 170;
/// JSON server error bodies forwarded inside `remote-error` are capped;
/// server refusal messages are short. Non-JSON error bodies (proxy or
/// captive-portal markup) forward empty, so full pages never cross the bridge.
const MP_SESSION_ERROR_BODY_CHARS: usize = 2000;
/// Longest region/state identifier the server shape accepts
/// (`MAX_REGION_ID_LENGTH` in AHDGame `src/lib/constants/states.ts`).
const MP_SESSION_MAX_STATE_ID_CHARS: usize = 15;

/// Stable bridge error strings surfaced to the TypeScript adapter.
pub mod error {
    pub const UNSUPPORTED_OP: &str = "unsupported-op";
    pub const BAD_ARG: &str = "bad-arg";
    pub const SESSION_UNAVAILABLE: &str = "session-unavailable";
    pub const SESSION_TIMEOUT: &str = "session-timeout";
    pub const SESSION_TRANSPORT: &str = "session-transport";
    pub const OVERSIZE_BODY: &str = "oversize-body";
    pub const UNEXPECTED_CONTENT: &str = "unexpected-content";
    pub const UNEXPECTED_REDIRECT: &str = "unexpected-redirect";
}

/// Authenticated GET reads the native multiplayer mode may perform. Every
/// variant maps to one pinned path; see [`fetch_path_and_query`]. The
/// election detail read takes an id parameter instead; see
/// [`fetch_election_path`]. The corporation detail read takes an id
/// parameter instead; see [`fetch_corporation_path`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MpFetchOp {
    /// Legacy read-only session probe; 200 `{active:true,...}` signed in,
    /// 401 `{active:false}` signed out.
    AuthSession,
    /// Authenticated character sheet; 401 signed out.
    CharacterMe,
    /// Navbar essentials; guest data when signed out.
    ClientNav,
    /// Turn/year/processing/countdown; public but fresher via the session.
    TurnStatus,
    /// Players active within the last hour; public, no session required.
    /// Audited against `GET /api/players/online` (route comment pins the
    /// one-hour window and the banned exclusion); answers `{online, asOf}`
    /// with a 120s public cache. The adapter treats every failure as
    /// absent, never as zero, and a 401 here must never expire the session.
    PlayersOnline,
    /// Turn/year/iteration fallback; public.
    GameTime,
    /// Paginated inbox; requires the session, 401 otherwise.
    Notifications,
    /// Received player mail page; requireAuthWithCharacter, 401 otherwise.
    MailInbox,
    /// Sent player mail page; same gate and paging, no unread count.
    MailSent,
    /// Read-only site maintenance status; requireAdmin, 403 for non-admins.
    AdminMaintenance,
    /// Standing active-election detail; GET /api/elections single mode with
    /// `view=summary` (optional auth, 404 when the race is gone). The id is
    /// a 24-hex ObjectId or a bounded seatId; see [`is_election_id`].
    ElectionDetail,
    /// Standing corporation detail; GET /api/corporations/[id] (public with
    /// optional auth, 400 on an invalid id, 404 when the company is gone).
    /// The id is a sequential numeric id or a 24-hex ObjectId; see
    /// [`is_corporation_id`].
    CorporationDetail,
}

impl MpFetchOp {
    fn from_id(id: &str) -> Option<Self> {
        match id {
            "auth-session" => Some(Self::AuthSession),
            "character-me" => Some(Self::CharacterMe),
            "client-nav" => Some(Self::ClientNav),
            "turn-status" => Some(Self::TurnStatus),
            "players-online" => Some(Self::PlayersOnline),
            "game-time" => Some(Self::GameTime),
            "notifications" => Some(Self::Notifications),
            "mail-inbox" => Some(Self::MailInbox),
            "mail-sent" => Some(Self::MailSent),
            "admin-maintenance" => Some(Self::AdminMaintenance),
            "election-detail" => Some(Self::ElectionDetail),
            "corporation-detail" => Some(Self::CorporationDetail),
            _ => None,
        }
    }

    fn path(self) -> &'static str {
        match self {
            Self::AuthSession => "/api/auth/session",
            Self::CharacterMe => "/api/character/me",
            Self::ClientNav => "/api/client-nav",
            Self::TurnStatus => "/api/game/turn/status",
            Self::PlayersOnline => "/api/players/online",
            Self::GameTime => "/api/game-time",
            Self::Notifications => "/api/notifications",
            Self::MailInbox => "/api/mail",
            Self::MailSent => "/api/mail/sent",
            Self::AdminMaintenance => "/api/admin/maintenance",
            Self::ElectionDetail => "/api/elections",
            Self::CorporationDetail => "/api/corporations",
        }
    }
}

/// Authenticated writes the native multiplayer mode may perform. Every
/// variant maps to one pinned method+path with a validated body; see
/// [`mutate_call`]. Anything else the UI asks for fails closed — unsupported
/// mutations are absent, never sent anywhere.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MpMutateOp {
    /// POST /api/actions/execute — one political action run. Nine server
    /// action types; count/convert rules mirror the route schema.
    ExecuteAction,
    /// PATCH /api/notifications `{id, action:"read"}`.
    NotificationRead,
    /// PATCH /api/notifications `{id, action:"archive"}`.
    NotificationArchive,
    /// PATCH /api/notifications `{}` (no id) — mark-all-read in scope.
    NotificationMarkAllRead,
    /// PATCH /api/notifications `{id, action:"snooze", snoozeMinutes?}` —
    /// snoozeMinutes is 5..=10080, server default 720 when omitted.
    NotificationSnooze,
    /// PATCH /api/notifications `{id, action:"unsnooze"}`.
    NotificationUnsnooze,
    /// PATCH /api/notifications `{id, action:"unarchive"}`.
    NotificationUnarchive,
    /// PUT /api/notifications/preferences `{action:"mute"|"unmute",
    /// type: NOTIFICATION_TYPES member}` — preference snooze/unsnooze stay
    /// absent, never sent.
    NotificationPreference,
    /// POST /api/mail — one player mail send. Body mirrors sendMailSchema.
    MailSend,
    /// PATCH /api/mail/{id} — mark one received mail read (empty body).
    MailRead,
    /// DELETE /api/mail/{id} — soft-delete the recipient copy (empty body).
    MailDelete,
    /// DELETE /api/mail/sent/{id} — soft-delete the sender copy (empty body).
    MailSentDelete,
    /// POST /api/mail/{id}/report — one moderator report (empty body).
    MailReport,
    /// POST /api/auth/logout — unlink the current account (empty body).
    /// Public route: clears the auth cookie and revokes issued tokens
    /// server-side (`authRevokedAt`), answering 200 `{ok:true}`. This is the
    /// only bridge call that ends an account link; everything else reads or
    /// acts through the live session.
    AuthLogout,
}

impl MpMutateOp {
    fn from_id(id: &str) -> Option<Self> {
        match id {
            "execute-action" => Some(Self::ExecuteAction),
            "notification-read" => Some(Self::NotificationRead),
            "notification-archive" => Some(Self::NotificationArchive),
            "notification-mark-all-read" => Some(Self::NotificationMarkAllRead),
            "notification-snooze" => Some(Self::NotificationSnooze),
            "notification-unsnooze" => Some(Self::NotificationUnsnooze),
            "notification-unarchive" => Some(Self::NotificationUnarchive),
            "notification-preference" => Some(Self::NotificationPreference),
            "mail-send" => Some(Self::MailSend),
            "mail-read" => Some(Self::MailRead),
            "mail-delete" => Some(Self::MailDelete),
            "mail-sent-delete" => Some(Self::MailSentDelete),
            "mail-report" => Some(Self::MailReport),
            "auth-logout" => Some(Self::AuthLogout),
            _ => None,
        }
    }

    fn method(self) -> &'static str {
        match self {
            Self::ExecuteAction | Self::MailSend | Self::MailReport | Self::AuthLogout => "POST",
            Self::NotificationPreference => "PUT",
            Self::MailDelete | Self::MailSentDelete => "DELETE",
            Self::NotificationRead
            | Self::NotificationArchive
            | Self::NotificationMarkAllRead
            | Self::NotificationSnooze
            | Self::NotificationUnsnooze
            | Self::NotificationUnarchive
            | Self::MailRead => "PATCH",
        }
    }

    /// Static collection path. Ops addressed to one mail id build their exact
    /// path in [`mutate_path`]; this base exists so the allowlist and the
    /// transport share one pin per collection.
    fn path(self) -> &'static str {
        match self {
            Self::ExecuteAction => "/api/actions/execute",
            Self::NotificationPreference => "/api/notifications/preferences",
            Self::NotificationRead
            | Self::NotificationArchive
            | Self::NotificationMarkAllRead
            | Self::NotificationSnooze
            | Self::NotificationUnsnooze
            | Self::NotificationUnarchive => "/api/notifications",
            Self::MailSend | Self::MailRead | Self::MailDelete | Self::MailReport => "/api/mail",
            Self::MailSentDelete => "/api/mail/sent",
            Self::AuthLogout => "/api/auth/logout",
        }
    }
}

/// Action types accepted by POST /api/actions/execute (audited against
/// `executeActionSchema` in AHDGame `src/lib/api/schemas/actions.ts`).
const EXECUTE_ACTION_TYPES: &[&str] = &[
    "fundraise",
    "campaign",
    "advertise",
    "buildDonorBase",
    "poll",
    "pollLarge",
    "convertCash",
    "rest",
    "debatePrep",
];

/// Batch counts accepted by the route schema (`count` omitted or 1 = single).
const EXECUTE_ACTION_COUNTS: &[u64] = &[1, 5, 10];

/// Snooze window from `notificationsPatchSchema` in AHDGame
/// `src/lib/api/schemas/notifications.ts` (minutes, server default 720).
const NOTIFICATION_SNOOZE_MINUTES_MIN: u64 = 5;
const NOTIFICATION_SNOOZE_MINUTES_MAX: u64 = 7 * 24 * 60;

/// Player-mail send limits from `sendMailSchema` in AHDGame
/// `src/app/api/mail/route.ts`. The server counts UTF-16 units (zod string
/// max, like JS length), so the bridge counts `encode_utf16` units too.
const MP_MAIL_SUBJECT_MAX_UTF16: usize = 80;
const MP_MAIL_BODY_MAX_UTF16: usize = 1000;

/// Preference actions modeled in Native (`notificationPreferenceActionSchema`
/// also accepts snooze/unsnooze; those stay absent, never sent).
const NOTIFICATION_PREFERENCE_ACTIONS: &[&str] = &["mute", "unmute"];

/// Notification types accepted by `notificationPreferenceActionSchema`,
/// pinned to `NOTIFICATION_TYPES` in AHDGame
/// `src/lib/db/types/notifications.ts`.
const NOTIFICATION_TYPES: &[&str] = &[
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
];

fn is_hex_object_id(value: &str) -> bool {
    value.len() == 24 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

/// Election reference accepted by GET /api/elections single mode: a 24-hex
/// ObjectId or a seatId such as `US-senate-PA-1` (mirrors `isSeatId` in
/// AHDGame `src/lib/elections/resolveElection.ts`, bounded so the id stays
/// URL-safe without encoding and cannot smuggle query text: only ASCII
/// alphanumerics and dashes, at most 64 chars).
fn is_election_id(value: &str) -> bool {
    if value.is_empty() || value.len() > 64 {
        return false;
    }
    if is_hex_object_id(value) {
        return true;
    }
    let mut parts = value.split('-');
    match parts.next() {
        Some(country)
            if country.len() == 2 && country.bytes().all(|byte| byte.is_ascii_alphabetic()) => {}
        _ => return false,
    }
    let mut segments = 0;
    for part in parts {
        if part.is_empty()
            || part.len() > 16
            || !part.bytes().all(|byte| byte.is_ascii_alphanumeric())
        {
            return false;
        }
        segments += 1;
    }
    segments >= 1
}

/// Length in UTF-16 code units, matching the server's zod string limits.
fn utf16_len(value: &str) -> usize {
    value.encode_utf16().count()
}

/// Extract one validated 24-hex mail id from a mutation payload. Anything
/// else never leaves the bridge.
fn mail_id_from(payload: &serde_json::Value) -> Result<&str, String> {
    let object = payload
        .as_object()
        .ok_or_else(|| error::BAD_ARG.to_string())?;
    let id = object
        .get("id")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| error::BAD_ARG.to_string())?;
    if !is_hex_object_id(id) {
        return Err(error::BAD_ARG.to_string());
    }
    Ok(id)
}

/// Build the exact request path+query for a fetch op. Pagination is rebuilt
/// from validated integers; callers cannot smuggle raw query text through.
fn fetch_path_and_query(
    op: MpFetchOp,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<String, String> {
    match op {
        MpFetchOp::Notifications | MpFetchOp::MailInbox | MpFetchOp::MailSent => {
            let limit = limit.ok_or_else(|| error::BAD_ARG.to_string())?;
            if !(1..=50).contains(&limit) {
                return Err(error::BAD_ARG.to_string());
            }
            let offset = offset.unwrap_or(0);
            if offset > 100_000 {
                return Err(error::BAD_ARG.to_string());
            }
            Ok(format!("{}?limit={limit}&offset={offset}", op.path()))
        }
        _ => {
            if limit.is_some() || offset.is_some() {
                return Err(error::UNSUPPORTED_OP.to_string());
            }
            Ok(op.path().to_string())
        }
    }
}

/// Build the exact election detail request path+query from a validated id.
/// The summary view keeps the body small and stable; the id charset is
/// URL-safe by construction ([`is_election_id`]), so no encoding step can
/// smuggle extra query pairs. Pagination never applies to this read.
fn fetch_election_path(election_id: &str) -> Result<String, String> {
    if !is_election_id(election_id) {
        return Err(error::BAD_ARG.to_string());
    }
    Ok(format!(
        "{}?id={election_id}&view=summary",
        MpFetchOp::ElectionDetail.path()
    ))
}

/// Corporation reference accepted by GET /api/corporations/[id]: a
/// sequential numeric id (what client-nav `myCorporationId` carries) or a
/// 24-hex ObjectId (mirrors `corporationQueryFromParamId` in AHDGame
/// `src/lib/api/corporations/resolveQuery.ts`, where the ObjectId check
/// runs first). Bounded and URL-safe by construction, so the id embeds in
/// the path with no encoding step that could smuggle query text.
fn is_corporation_id(value: &str) -> bool {
    if value.is_empty() || value.len() > 24 {
        return false;
    }
    if is_hex_object_id(value) {
        return true;
    }
    !value.is_empty() && value.len() <= 10 && value.bytes().all(|byte| byte.is_ascii_digit())
}

/// Build the exact corporation detail request path from a validated id.
/// The id is a path segment (never a query pair) and carries no pagination.
fn fetch_corporation_path(corporation_id: &str) -> Result<String, String> {
    if !is_corporation_id(corporation_id) {
        return Err(error::BAD_ARG.to_string());
    }
    Ok(format!(
        "{}/{}",
        MpFetchOp::CorporationDetail.path(),
        corporation_id
    ))
}

/// Validate a mutation payload and return the canonical body to send. Unknown
/// fields are stripped; the server ignores them, and the bridge never
/// forwards what it did not explicitly model.
fn mutate_body(op: MpMutateOp, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let object = payload
        .as_object()
        .ok_or_else(|| error::BAD_ARG.to_string())?;
    let get_str = |key: &str| object.get(key).and_then(serde_json::Value::as_str);
    match op {
        MpMutateOp::ExecuteAction => {
            let action_type = get_str("actionType").ok_or_else(|| error::BAD_ARG.to_string())?;
            if !EXECUTE_ACTION_TYPES.contains(&action_type) {
                return Err(error::BAD_ARG.to_string());
            }
            let mut body = serde_json::Map::with_capacity(4);
            body.insert(
                "actionType".to_string(),
                serde_json::Value::String(action_type.to_string()),
            );
            if let Some(count_value) = object.get("count") {
                let count = count_value
                    .as_u64()
                    .ok_or_else(|| error::BAD_ARG.to_string())?;
                if !EXECUTE_ACTION_COUNTS.contains(&count) {
                    return Err(error::BAD_ARG.to_string());
                }
                if count != 1 {
                    body.insert(
                        "count".to_string(),
                        serde_json::Value::Number(serde_json::Number::from(count)),
                    );
                }
            }
            if let Some(target_state) = object.get("targetState") {
                let state = target_state
                    .as_str()
                    .ok_or_else(|| error::BAD_ARG.to_string())?;
                let trimmed = state.trim();
                if trimmed.is_empty() || trimmed.chars().count() > MP_SESSION_MAX_STATE_ID_CHARS {
                    return Err(error::BAD_ARG.to_string());
                }
                body.insert(
                    "targetState".to_string(),
                    serde_json::Value::String(trimmed.to_string()),
                );
            }
            if let Some(amount_value) = object.get("convertAmount") {
                let amount = amount_value
                    .as_f64()
                    .ok_or_else(|| error::BAD_ARG.to_string())?;
                if !amount.is_finite() || amount <= 0.0 {
                    return Err(error::BAD_ARG.to_string());
                }
                // Mirrors the route: batch runs and convert amounts never mix,
                // and convertCash is single-run only.
                if action_type != "convertCash"
                    || object.get("count").is_some_and(|count| count != 1)
                {
                    return Err(error::BAD_ARG.to_string());
                }
                body.insert(
                    "convertAmount".to_string(),
                    serde_json::Value::Number(
                        serde_json::Number::from_f64(amount)
                            .ok_or_else(|| error::BAD_ARG.to_string())?,
                    ),
                );
            }
            Ok(serde_json::Value::Object(body))
        }
        MpMutateOp::NotificationRead | MpMutateOp::NotificationArchive => {
            let id = get_str("id").ok_or_else(|| error::BAD_ARG.to_string())?;
            if !is_hex_object_id(id) {
                return Err(error::BAD_ARG.to_string());
            }
            let action = match op {
                MpMutateOp::NotificationRead => "read",
                _ => "archive",
            };
            Ok(serde_json::json!({ "id": id, "action": action }))
        }
        MpMutateOp::NotificationSnooze => {
            let id = get_str("id").ok_or_else(|| error::BAD_ARG.to_string())?;
            if !is_hex_object_id(id) {
                return Err(error::BAD_ARG.to_string());
            }
            let mut body = serde_json::Map::with_capacity(3);
            body.insert("id".to_string(), serde_json::Value::String(id.to_string()));
            body.insert(
                "action".to_string(),
                serde_json::Value::String("snooze".to_string()),
            );
            // Omitted minutes fall through to the server default (720); when
            // present the value must sit inside the schema window.
            if let Some(minutes_value) = object.get("snoozeMinutes") {
                let minutes = minutes_value
                    .as_u64()
                    .ok_or_else(|| error::BAD_ARG.to_string())?;
                if !(NOTIFICATION_SNOOZE_MINUTES_MIN..=NOTIFICATION_SNOOZE_MINUTES_MAX)
                    .contains(&minutes)
                {
                    return Err(error::BAD_ARG.to_string());
                }
                body.insert(
                    "snoozeMinutes".to_string(),
                    serde_json::Value::Number(serde_json::Number::from(minutes)),
                );
            }
            Ok(serde_json::Value::Object(body))
        }
        MpMutateOp::NotificationUnsnooze | MpMutateOp::NotificationUnarchive => {
            let id = get_str("id").ok_or_else(|| error::BAD_ARG.to_string())?;
            if !is_hex_object_id(id) {
                return Err(error::BAD_ARG.to_string());
            }
            let action = match op {
                MpMutateOp::NotificationUnsnooze => "unsnooze",
                _ => "unarchive",
            };
            Ok(serde_json::json!({ "id": id, "action": action }))
        }
        MpMutateOp::NotificationPreference => {
            let action = get_str("action").ok_or_else(|| error::BAD_ARG.to_string())?;
            if !NOTIFICATION_PREFERENCE_ACTIONS.contains(&action) {
                return Err(error::BAD_ARG.to_string());
            }
            let kind = get_str("type").ok_or_else(|| error::BAD_ARG.to_string())?;
            if !NOTIFICATION_TYPES.contains(&kind) {
                return Err(error::BAD_ARG.to_string());
            }
            Ok(serde_json::json!({ "action": action, "type": kind }))
        }
        MpMutateOp::NotificationMarkAllRead => {
            if !object.is_empty() {
                return Err(error::BAD_ARG.to_string());
            }
            Ok(serde_json::json!({}))
        }
        MpMutateOp::MailSend => {
            let to_character_id =
                get_str("toCharacterId").ok_or_else(|| error::BAD_ARG.to_string())?;
            if !is_hex_object_id(to_character_id.trim()) {
                return Err(error::BAD_ARG.to_string());
            }
            let subject = get_str("subject").ok_or_else(|| error::BAD_ARG.to_string())?;
            let subject = subject.trim();
            if subject.is_empty() || utf16_len(subject) > MP_MAIL_SUBJECT_MAX_UTF16 {
                return Err(error::BAD_ARG.to_string());
            }
            let body = get_str("body").ok_or_else(|| error::BAD_ARG.to_string())?;
            let body = body.trim();
            if body.is_empty() || utf16_len(body) > MP_MAIL_BODY_MAX_UTF16 {
                return Err(error::BAD_ARG.to_string());
            }
            Ok(serde_json::json!({
                "toCharacterId": to_character_id.trim(),
                "subject": subject,
                "body": body,
            }))
        }
        MpMutateOp::MailRead
        | MpMutateOp::MailDelete
        | MpMutateOp::MailSentDelete
        | MpMutateOp::MailReport => {
            // The id travels in the path (see `mutate_path`); the wire body
            // stays empty. Unknown fields are never forwarded.
            mail_id_from(payload)?;
            Ok(serde_json::json!({}))
        }
        MpMutateOp::AuthLogout => {
            // Unlink takes no arguments: the live session cookie is the
            // identity. The payload must still be an object so stray fields
            // are stripped rather than forwarded.
            payload
                .as_object()
                .ok_or_else(|| error::BAD_ARG.to_string())?;
            Ok(serde_json::json!({}))
        }
    }
}

/// Build the exact request path for a mutation. Collection ops use their
/// pinned path; mail id ops embed one validated 24-hex id, so caller input
/// can only ever address a single mail or its report endpoint.
fn mutate_path(op: MpMutateOp, payload: &serde_json::Value) -> Result<String, String> {
    match op {
        MpMutateOp::MailRead | MpMutateOp::MailDelete => {
            Ok(format!("/api/mail/{}", mail_id_from(payload)?))
        }
        MpMutateOp::MailSentDelete => Ok(format!("/api/mail/sent/{}", mail_id_from(payload)?)),
        MpMutateOp::MailReport => Ok(format!("/api/mail/{}/report", mail_id_from(payload)?)),
        _ => Ok(op.path().to_string()),
    }
}

/// One mail id addressed as a recipient item: `/api/mail/{24-hex}`.
fn is_mail_item_path(path: &str) -> bool {
    path.strip_prefix("/api/mail/")
        .is_some_and(is_hex_object_id)
}

/// One mail id addressed as a sender item: `/api/mail/sent/{24-hex}`.
fn is_mail_sent_item_path(path: &str) -> bool {
    path.strip_prefix("/api/mail/sent/")
        .is_some_and(is_hex_object_id)
}

/// One mail id addressed as a report endpoint: `/api/mail/{24-hex}/report`.
fn is_mail_report_path(path: &str) -> bool {
    path.strip_prefix("/api/mail/")
        .and_then(|rest| rest.strip_suffix("/report"))
        .is_some_and(is_hex_object_id)
}

/// Paged `limit&offset` query shared by the notification and mail reads.
fn is_paged_query(query: &str) -> bool {
    let mut limit_ok = false;
    let mut offset_ok = false;
    for pair in query.split('&') {
        let (key, value) = pair.split_once('=').unwrap_or(("", ""));
        match key {
            "limit" => {
                if !value
                    .parse::<u32>()
                    .is_ok_and(|limit| (1..=50).contains(&limit))
                {
                    return false;
                }
                limit_ok = true;
            }
            "offset" => {
                if !value.parse::<u32>().is_ok_and(|offset| offset <= 100_000) {
                    return false;
                }
                offset_ok = true;
            }
            _ => return false,
        }
    }
    limit_ok && offset_ok
}

/// Election detail query: exactly `id=<validated>` plus `view=summary`,
/// in either order, nothing else. The summary pin is load-bearing: the
/// default full view is a far larger per-user body Native never projects.
fn is_election_query(query: &str) -> bool {
    let mut id_ok = false;
    let mut view_ok = false;
    for pair in query.split('&') {
        let (key, value) = pair.split_once('=').unwrap_or(("", ""));
        match key {
            "id" => {
                if id_ok || !is_election_id(value) {
                    return false;
                }
                id_ok = true;
            }
            "view" => {
                if view_ok || value != "summary" {
                    return false;
                }
                view_ok = true;
            }
            _ => return false,
        }
    }
    id_ok && view_ok
}

/// Corporation detail path: exactly `/api/corporations/<validated id>`
/// with no query string. The id segment re-validates here so a future
/// refactor of [`fetch_corporation_path`] cannot widen the pin.
fn is_corporation_path(path: &str) -> bool {
    let id = path.strip_prefix("/api/corporations/");
    match id {
        Some(id) => !id.is_empty() && !id.contains('/') && is_corporation_id(id),
        None => false,
    }
}

/// Re-check a fully formed method+path+query against the allowlist. Defense
/// in depth: the call is built by [`fetch_path_and_query`]/[`mutate_path`],
/// [`fetch_election_path`], or [`fetch_corporation_path`], but the transport
/// re-validates so a future refactor cannot bypass the pin.
fn is_allowlisted_call(method: &str, path_and_query: &str) -> bool {
    let (path, query) = match path_and_query.split_once('?') {
        Some((path, query)) => (path, Some(query)),
        None => (path_and_query, None),
    };
    match (method, path) {
        ("GET", "/api/auth/session")
        | ("GET", "/api/character/me")
        | ("GET", "/api/client-nav")
        | ("GET", "/api/game/turn/status")
        | ("GET", "/api/players/online")
        | ("GET", "/api/admin/maintenance")
        | ("GET", "/api/game-time") => query.is_none(),
        ("GET", "/api/notifications") | ("GET", "/api/mail") | ("GET", "/api/mail/sent") => {
            match query {
                Some(query) => is_paged_query(query),
                None => false,
            }
        }
        ("GET", "/api/elections") => match query {
            Some(query) => is_election_query(query),
            None => false,
        },
        ("GET", path) if path.starts_with("/api/corporations/") => {
            query.is_none() && is_corporation_path(path)
        }
        ("POST", "/api/actions/execute") | ("PATCH", "/api/notifications") => query.is_none(),
        ("PUT", "/api/notifications/preferences") => query.is_none(),
        ("POST", "/api/mail") | ("POST", "/api/auth/logout") => query.is_none(),
        ("PATCH", path) if is_mail_item_path(path) => query.is_none(),
        ("DELETE", path) if is_mail_item_path(path) || is_mail_sent_item_path(path) => {
            query.is_none()
        }
        ("POST", path) if is_mail_report_path(path) => query.is_none(),
        _ => false,
    }
}

fn next_request_id() -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(1);
    let sequence = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("mp-{}-{sequence}", std::process::id())
}

/// JSON-encode a dynamic fragment for embedding in the evaluated script.
/// Serialization (never interpolation) is what keeps caller input inert.
fn json_fragment(value: &serde_json::Value) -> String {
    serde_json::to_string(value).expect("bridge fragments must serialize")
}

/// Build the fire-and-forget script that starts one session call in the
/// online window and parks its outcome at
/// `window.__ahdMpPending[<id>]`. Returns the script plus the request id.
fn start_script(
    method: &str,
    path_and_query: &str,
    body: Option<&serde_json::Value>,
) -> (String, String) {
    let request_id = next_request_id();
    let id_json = json_fragment(&serde_json::Value::String(request_id.clone()));
    let url_json = json_fragment(&serde_json::Value::String(format!(
        "{}{path_and_query}",
        session_origin()
    )));
    let method_json = json_fragment(&serde_json::Value::String(method.to_string()));
    let body_json = match body {
        Some(body) => json_fragment(body),
        None => "null".to_string(),
    };
    let max_bytes = serde_json::Value::Number(serde_json::Number::from(MP_SESSION_MAX_BODY_BYTES));
    let timeout_ms = serde_json::Value::Number(serde_json::Number::from(
        MP_SESSION_FETCH_TIMEOUT_SECS * 1000,
    ));
    let script = format!(
        r#"(function(){{var id={id_json};window.__ahdMpPending=window.__ahdMpPending||{{}};if(window.__ahdMpPending[id]){{return "already-running";}}window.__ahdMpPending[id]={{done:false}};var headers={{"Accept":"application/json"}};var init={{method:{method_json},credentials:"same-origin",redirect:"manual",headers:headers}};if({body_json}!==null){{headers["Content-Type"]="application/json";init.body=JSON.stringify({body_json});}}var max={max_bytes};var budget={timeout_ms};var ctl=new AbortController();init.signal=ctl.signal;setTimeout(function(){{try{{ctl.abort();}}catch(e){{}}}},budget);fetch({url_json},init).then(function(r){{var redirected=(typeof r.type==="string"&&r.type==="opaqueredirect");if(redirected){{return {{redirected:true}};}}return r.text().then(function(t){{return {{status:r.status,retryAfter:r.headers.get("Retry-After"),contentType:r.headers.get("content-type"),oversize:t.length>max,body:t.slice(0,max+1)}};}});}}).then(function(out){{window.__ahdMpPending[id]={{done:true,ok:true,out:out}};}},function(e){{window.__ahdMpPending[id]={{done:true,ok:false}};}});return "started";}})()"#,
    );
    (script, request_id)
}

/// Build the polling probe for one in-flight request id.
fn poll_script(request_id: &str) -> String {
    let id_json = json_fragment(&serde_json::Value::String(request_id.to_string()));
    format!(
        r#"(function(){{var s=(window.__ahdMpPending||{{}})[{id_json}];return s?JSON.stringify(s):JSON.stringify({{done:false}});}})()"#
    )
}

/// Build the cleanup script that drops one parked outcome.
fn cleanup_script(request_id: &str) -> String {
    let id_json = json_fragment(&serde_json::Value::String(request_id.to_string()));
    format!(
        r#"(function(){{try{{delete (window.__ahdMpPending||{{}})[{id_json}];}}catch(e){{}}return "ok";}})()"#
    )
}

/// Page outcome parked by the start script.
#[derive(Debug, serde::Deserialize)]
struct PageOutcome {
    #[serde(default)]
    done: bool,
    #[serde(default)]
    ok: bool,
    #[serde(default)]
    out: Option<PageCall>,
}

/// Successful `fetch()` resolution (or redirect marker).
#[derive(Debug, serde::Deserialize)]
struct PageCall {
    #[serde(default)]
    redirected: bool,
    #[serde(default)]
    status: u16,
    #[serde(default, rename = "retryAfter")]
    retry_after: Option<String>,
    #[serde(default, rename = "contentType")]
    content_type: Option<String>,
    #[serde(default)]
    oversize: bool,
    #[serde(default)]
    body: String,
}

fn retry_after_secs(raw: Option<&str>) -> u64 {
    raw.and_then(|value| value.trim().parse::<u64>().ok())
        .unwrap_or(0)
}

fn content_type_is_json(raw: Option<&str>) -> bool {
    raw.and_then(|value| value.split(';').next())
        .is_some_and(|mime| mime.trim().eq_ignore_ascii_case("application/json"))
}

/// Classify one parked outcome into the transport contract. `Ok` carries the
/// raw server body; `Err` carries a stable bridge string (possibly with the
/// `remote-error:{status}:{retry}:{prefix}` envelope).
fn classify_outcome(outcome: &PageOutcome) -> Result<String, String> {
    if !outcome.done {
        return Err(error::SESSION_TRANSPORT.to_string());
    }
    if !outcome.ok {
        // A rejected first-party fetch is a network failure, an aborted page,
        // or a navigated-away session window: reconnect and retry.
        return Err(error::SESSION_TRANSPORT.to_string());
    }
    let call = outcome
        .out
        .as_ref()
        .ok_or_else(|| error::SESSION_TRANSPORT.to_string())?;
    if call.redirected {
        return Err(error::UNEXPECTED_REDIRECT.to_string());
    }
    if !(200..300).contains(&call.status) {
        // Error pages are not always the server's JSON refusal: proxies,
        // captive portals, and HTML fallbacks answer with markup. Forward the
        // body only when it is JSON so markup never crosses the bridge into
        // UI text; the status and retry delay still map phases exactly (401
        // expiry, 429 backoff, 409 conflict), and the adapter degrades an
        // empty body to its generic refusal. Mirrors the mobile relay, which
        // rejects non-JSON bodies before reading them.
        let prefix: String = if content_type_is_json(call.content_type.as_deref()) {
            call.body
                .chars()
                .take(MP_SESSION_ERROR_BODY_CHARS)
                .collect()
        } else {
            String::new()
        };
        return Err(format!(
            "remote-error:{}:{}:{prefix}",
            call.status,
            retry_after_secs(call.retry_after.as_deref())
        ));
    }
    if !content_type_is_json(call.content_type.as_deref()) {
        return Err(error::UNEXPECTED_CONTENT.to_string());
    }
    if call.oversize || call.body.len() > MP_SESSION_MAX_BODY_BYTES {
        return Err(error::OVERSIZE_BODY.to_string());
    }
    Ok(call.body.clone())
}

/// Parse one poll probe result body into a [`PageOutcome`].
fn parse_poll_result(raw: &str) -> Result<PageOutcome, String> {
    serde_json::from_str(raw).map_err(|_| error::SESSION_TRANSPORT.to_string())
}

async fn poll_for_outcome(
    window: &tauri::WebviewWindow,
    request_id: &str,
) -> Result<PageOutcome, String> {
    let probe = poll_script(request_id);
    for _ in 0..MP_SESSION_POLL_ROUNDS {
        let (sender, receiver) = std::sync::mpsc::channel();
        window
            .eval_with_callback(probe.clone(), move |value| {
                let _ = sender.send(value);
            })
            .map_err(|_| error::SESSION_TRANSPORT.to_string())?;
        let raw = tauri::async_runtime::spawn_blocking(move || {
            receiver.recv_timeout(Duration::from_secs(5))
        })
        .await
        .map_err(|_| error::SESSION_TRANSPORT.to_string())?
        .map_err(|_| error::SESSION_TRANSPORT.to_string())?;
        let outcome = parse_poll_result(&raw)?;
        if outcome.done {
            return Ok(outcome);
        }
        tauri::async_runtime::spawn_blocking(|| {
            std::thread::sleep(Duration::from_millis(MP_SESSION_POLL_INTERVAL_MS));
        })
        .await
        .map_err(|_| error::SESSION_TRANSPORT.to_string())?;
    }
    Err(error::SESSION_TIMEOUT.to_string())
}

/// Cold-boot restore budget: how long the lazily created online window may
/// take to commit its first-party navigation before a session call runs.
/// Reads never proceed on an uncommitted window: evaluating the session
/// script outside live-site context would answer 401 and misreport a valid
/// durable session as signed out.
#[cfg(desktop)]
const MP_RESTORE_WINDOW_WAIT_ROUNDS: u32 = 50;
#[cfg(desktop)]
const MP_RESTORE_WINDOW_WAIT_INTERVAL_MS: u64 = 200;

/// Whether a window URL is first-party live-site context: only then does the
/// evaluated session script run same-origin with the platform cookie jar
/// attached. Pure so the contract is unit-testable without a WebView.
#[cfg(desktop)]
fn online_window_url_ready(current: &tauri::Url) -> bool {
    current.scheme() == MP_SESSION_SCHEME
        && current.host_str() == Some(MP_SESSION_HOST)
        && current.port_or_known_default() == Some(443)
}

/// Provide the persistent online window for one session call, creating it
/// lazily on desktop cold boot (#149). After a full process relaunch no
/// window exists yet, but the platform profile jar may still hold a valid
/// durable server session: the hidden window restores first-party context so
/// the auth-session probe answers honestly (200 restores, 401 stays signed
/// out) instead of forcing a provider round trip. The window uses the
/// platform's normal persistent jar (never incognito), loads only the pinned
/// origin under the same navigation guard as the sign-in window, shows no UI,
/// accepts no popups, and persists nothing itself.
#[cfg(desktop)]
fn ensure_online_window(app: &tauri::AppHandle) -> Result<tauri::WebviewWindow, String> {
    if let Some(window) = app.get_webview_window(MP_SESSION_WINDOW_LABEL) {
        return Ok(window);
    }
    let url: tauri::Url = session_origin()
        .parse()
        .map_err(|_| error::SESSION_UNAVAILABLE.to_string())?;
    let built = tauri::WebviewWindowBuilder::new(
        app,
        MP_SESSION_WINDOW_LABEL,
        tauri::WebviewUrl::External(url),
    )
    .visible(false)
    .on_navigation(crate::is_online_navigation_allowed)
    .on_new_window(|_url, _features| tauri::webview::NewWindowResponse::Deny)
    .build();
    match built {
        Ok(window) => Ok(window),
        // Concurrent first calls can race creation: the loser hits a
        // duplicate-label build error, so recover the winner instead of
        // reporting the session missing.
        Err(_) => app
            .get_webview_window(MP_SESSION_WINDOW_LABEL)
            .ok_or_else(|| error::SESSION_UNAVAILABLE.to_string()),
    }
}

/// Wait for a lazily created online window to commit first-party navigation.
/// A window that never commits is a transport failure (offline with retry),
/// never a signed-out verdict: only a real probe answer may expire a session.
#[cfg(desktop)]
async fn wait_for_online_window(window: &tauri::WebviewWindow) -> Result<(), String> {
    for _ in 0..MP_RESTORE_WINDOW_WAIT_ROUNDS {
        if window
            .url()
            .ok()
            .is_some_and(|current| online_window_url_ready(&current))
        {
            return Ok(());
        }
        tauri::async_runtime::spawn_blocking(|| {
            std::thread::sleep(Duration::from_millis(MP_RESTORE_WINDOW_WAIT_INTERVAL_MS));
        })
        .await
        .map_err(|_| error::SESSION_TRANSPORT.to_string())?;
    }
    if window
        .url()
        .ok()
        .is_some_and(|current| online_window_url_ready(&current))
    {
        Ok(())
    } else {
        Err(error::SESSION_TRANSPORT.to_string())
    }
}

/// Run one allowlisted call in the persistent online window and resolve it
/// per [`classify_outcome`]. Only the `online` window is ever touched: any
/// other label (including the app's own main view) fails closed, so bridge
/// scripts can only execute in first-party live-site context.
#[cfg(desktop)]
async fn run_session_call(
    app: &tauri::AppHandle,
    method: &str,
    path_and_query: &str,
    body: Option<&serde_json::Value>,
) -> Result<String, String> {
    if !is_allowlisted_call(method, path_and_query) {
        return Err(error::UNSUPPORTED_OP.to_string());
    }
    // No window yet after a cold boot: provide the hidden persistent
    // restore window so a valid durable session probes 200 instead of
    // forcing a provider round trip. Creation failure keeps the old
    // `session-unavailable` verdict and the sign-in path.
    let window = match app.get_webview_window(MP_SESSION_WINDOW_LABEL) {
        Some(window) => window,
        None => ensure_online_window(app)?,
    };
    if window.label() != MP_SESSION_WINDOW_LABEL {
        return Err(error::SESSION_UNAVAILABLE.to_string());
    }
    // Gate every call on first-party commit, not just the creation path: a
    // pre-existing window may still be uncommitted (a previous restore timed
    // out offline and left it at about:blank, or a provider trip is
    // mid-flight on an auxiliary host). Evaluating outside live-site context
    // would answer 401 and misreport a valid durable session as signed out,
    // so wait (bounded) first; a window that never commits stays a
    // transport failure with retry.
    if !window
        .url()
        .ok()
        .is_some_and(|current| online_window_url_ready(&current))
    {
        wait_for_online_window(&window).await?;
    }
    let (script, request_id) = start_script(method, path_and_query, body);
    window
        .eval(script)
        .map_err(|_| error::SESSION_TRANSPORT.to_string())?;
    let outcome = poll_for_outcome(&window, &request_id).await;
    let _ = window.eval(cleanup_script(&request_id));
    classify_outcome(&outcome?)
}

#[cfg(mobile)]
fn account_session_header(app: &tauri::AppHandle) -> Option<String> {
    let url: tauri::Url = format!("{}/api/auth/session", session_origin())
        .parse()
        .ok()?;
    for label in ["online", "main"] {
        let Some(view) = app.get_webview_window(label) else {
            continue;
        };
        let Ok(cookies) = view.cookies_for_url(url.clone()) else {
            continue;
        };
        let header = cookies
            .into_iter()
            .filter(|cookie| {
                crate::is_account_session_cookie(cookie.name()) && !cookie.value().is_empty()
            })
            .map(|cookie| format!("{}={}", cookie.name(), cookie.value()))
            .collect::<Vec<_>>()
            .join("; ");
        if !header.is_empty() {
            return Some(header);
        }
    }
    None
}

#[cfg(mobile)]
pub(crate) fn has_account_session(app: &tauri::AppHandle) -> bool {
    account_session_header(app).is_some()
}

/// Drop recognized account-session cookies from the platform jar after the
/// server confirms logout. The mobile relay sends the session as an explicit
/// `Cookie` header through its own ephemeral client, so the server's
/// `Set-Cookie` expiry never reaches the platform jar: without this step a
/// revoked (dead) token value would linger on the device. Only names the
/// [`crate::is_account_session_cookie`] filter recognizes are touched;
/// every other cookie (OAuth flow state, analytics, character gate) stands.
/// Values never leave the jar: deletion reuses the cookie objects read from
/// it, and failures are ignored because the server already revoked the
/// session — a leftover dead cookie only ever probes 401 (signed out).
#[cfg(mobile)]
fn evict_account_session_cookies(app: &tauri::AppHandle) {
    let Ok(url): Result<tauri::Url, _> = format!("{}/api/auth/session", session_origin()).parse()
    else {
        return;
    };
    for label in ["online", "main"] {
        let Some(view) = app.get_webview_window(label) else {
            continue;
        };
        let Ok(cookies) = view.cookies_for_url(url.clone()) else {
            continue;
        };
        for cookie in cookies {
            if crate::is_account_session_cookie(cookie.name()) {
                let _ = view.delete_cookie(cookie);
            }
        }
    }
}

/// Mobile transport (#362): the single webview cannot host a persistent
/// first-party online window, so the bridge reads only the current account
/// cookie from the platform-owned jar and relays the same allowlisted calls
/// directly. The cookie value never reaches JavaScript, is never persisted,
/// and is sent only to the pinned origin. These requests are not browser
/// fetches (no CORS preflight, no automatic Origin), so each operation's
/// server acceptance must be proven on a real signed build (#363). Refusals
/// surface as `remote-error` through the same contract; the bridge never
/// invents data.
#[cfg(mobile)]
async fn run_session_call(
    app: &tauri::AppHandle,
    method: &str,
    path_and_query: &str,
    body: Option<&serde_json::Value>,
) -> Result<String, String> {
    if !is_allowlisted_call(method, path_and_query) {
        return Err(error::UNSUPPORTED_OP.to_string());
    }
    let session =
        account_session_header(app).ok_or_else(|| error::SESSION_UNAVAILABLE.to_string())?;
    let url = format!("{}{path_and_query}", session_origin());
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(MP_SESSION_FETCH_TIMEOUT_SECS))
        .build()
        .map_err(|_| error::SESSION_TRANSPORT.to_string())?;
    let mut request = match method {
        "GET" => client.get(url),
        "POST" => client.post(url),
        "PATCH" => client.patch(url),
        "PUT" => client.put(url),
        "DELETE" => client.delete(url),
        _ => return Err(error::UNSUPPORTED_OP.to_string()),
    }
    .header(reqwest::header::COOKIE, session)
    .header(reqwest::header::ACCEPT, "application/json");
    if let Some(payload) = body {
        request = request
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .body(payload.to_string());
    }
    let response = request
        .send()
        .await
        .map_err(|_| error::SESSION_TRANSPORT.to_string())?;
    if response.status().is_redirection() {
        return Err(error::UNEXPECTED_REDIRECT.to_string());
    }
    let status = response.status().as_u16();
    let retry_after = retry_after_secs(
        response
            .headers()
            .get(reqwest::header::RETRY_AFTER)
            .and_then(|value| value.to_str().ok()),
    );
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    if !content_type_is_json(content_type.as_deref()) {
        return Err(error::UNEXPECTED_CONTENT.to_string());
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|_| error::SESSION_TRANSPORT.to_string())?;
    if bytes.len() > MP_SESSION_MAX_BODY_BYTES {
        return Err(error::OVERSIZE_BODY.to_string());
    }
    let text =
        String::from_utf8(bytes.to_vec()).map_err(|_| error::UNEXPECTED_CONTENT.to_string())?;
    if (200..300).contains(&status) {
        // Confirmed unlink: the server revoked the session, so evict the
        // now-dead cookie value from the platform jar. Desktop needs no
        // equivalent step: its first-party fetch lets the server's
        // Set-Cookie expiry clear the online window jar directly.
        if path_and_query == "/api/auth/logout" {
            evict_account_session_cookies(app);
        }
        Ok(text)
    } else {
        Err(format!(
            "remote-error:{status}:{retry_after}:{}",
            text.chars()
                .take(MP_SESSION_ERROR_BODY_CHARS)
                .collect::<String>()
        ))
    }
}

/// Fetch one allowlisted read through the live-site session. Resolves with
/// the raw JSON body; the TypeScript adapter validates and projects it.
/// `election_id` serves the election detail read only and `corporation_id`
/// serves the corporation detail read only: each must be absent on every
/// other op and present (validated) on its own.
#[tauri::command(rename_all = "camelCase")]
pub async fn mp_session_fetch(
    app: tauri::AppHandle,
    op_id: String,
    limit: Option<u32>,
    offset: Option<u32>,
    election_id: Option<String>,
    corporation_id: Option<String>,
) -> Result<String, String> {
    let op = MpFetchOp::from_id(op_id.trim()).ok_or_else(|| error::UNSUPPORTED_OP.to_string())?;
    let path_and_query = match op {
        MpFetchOp::ElectionDetail => {
            if limit.is_some() || offset.is_some() || corporation_id.is_some() {
                return Err(error::UNSUPPORTED_OP.to_string());
            }
            let id = election_id
                .as_deref()
                .ok_or_else(|| error::BAD_ARG.to_string())?;
            fetch_election_path(id)?
        }
        MpFetchOp::CorporationDetail => {
            if limit.is_some() || offset.is_some() || election_id.is_some() {
                return Err(error::UNSUPPORTED_OP.to_string());
            }
            let id = corporation_id
                .as_deref()
                .ok_or_else(|| error::BAD_ARG.to_string())?;
            fetch_corporation_path(id)?
        }
        _ => {
            if election_id.is_some() || corporation_id.is_some() {
                return Err(error::BAD_ARG.to_string());
            }
            fetch_path_and_query(op, limit, offset)?
        }
    };
    run_session_call(&app, "GET", &path_and_query, None).await
}

/// Perform one allowlisted mutation through the live-site session. Resolves
/// with the raw JSON body; the adapter must refresh authoritative reads
/// before the UI claims completion.
#[tauri::command(rename_all = "camelCase")]
pub async fn mp_session_mutate(
    app: tauri::AppHandle,
    op_id: String,
    payload: Option<serde_json::Value>,
) -> Result<String, String> {
    let op = MpMutateOp::from_id(op_id.trim()).ok_or_else(|| error::UNSUPPORTED_OP.to_string())?;
    let payload = payload.unwrap_or(serde_json::Value::Null);
    let body = mutate_body(op, &payload)?;
    let path_and_query = mutate_path(op, &payload)?;
    run_session_call(&app, op.method(), &path_and_query, Some(&body)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fetch_ids_resolve_to_pinned_paths() {
        assert_eq!(
            MpFetchOp::from_id("auth-session"),
            Some(MpFetchOp::AuthSession)
        );
        assert_eq!(
            MpFetchOp::from_id("character-me"),
            Some(MpFetchOp::CharacterMe)
        );
        assert_eq!(MpFetchOp::from_id("client-nav"), Some(MpFetchOp::ClientNav));
        assert_eq!(
            MpFetchOp::from_id("turn-status"),
            Some(MpFetchOp::TurnStatus)
        );
        assert_eq!(
            MpFetchOp::from_id("players-online"),
            Some(MpFetchOp::PlayersOnline)
        );
        assert_eq!(MpFetchOp::PlayersOnline.path(), "/api/players/online");
        assert_eq!(MpFetchOp::from_id("game-time"), Some(MpFetchOp::GameTime));
        assert_eq!(
            MpFetchOp::from_id("notifications"),
            Some(MpFetchOp::Notifications)
        );
        assert_eq!(
            MpFetchOp::from_id("admin-maintenance"),
            Some(MpFetchOp::AdminMaintenance)
        );
        assert_eq!(MpFetchOp::AdminMaintenance.path(), "/api/admin/maintenance");
        assert_eq!(MpFetchOp::from_id("../admin"), None);
        assert_eq!(MpFetchOp::from_id("CHARACTER-ME"), None);
        assert_eq!(MpFetchOp::from_id(""), None);
    }

    #[test]
    fn mutate_ids_resolve_to_pinned_method_and_path() {
        assert_eq!(
            MpMutateOp::from_id("execute-action"),
            Some(MpMutateOp::ExecuteAction)
        );
        assert_eq!(
            MpMutateOp::from_id("notification-read"),
            Some(MpMutateOp::NotificationRead)
        );
        assert_eq!(
            MpMutateOp::from_id("notification-archive"),
            Some(MpMutateOp::NotificationArchive)
        );
        assert_eq!(
            MpMutateOp::from_id("notification-mark-all-read"),
            Some(MpMutateOp::NotificationMarkAllRead)
        );
        assert_eq!(MpMutateOp::from_id("delete-account"), None);
        assert_eq!(MpMutateOp::from_id("EXECUTE-ACTION"), None);
        let op = MpMutateOp::ExecuteAction;
        assert_eq!((op.method(), op.path()), ("POST", "/api/actions/execute"));
        let op = MpMutateOp::NotificationRead;
        assert_eq!((op.method(), op.path()), ("PATCH", "/api/notifications"));
    }

    #[cfg(desktop)]
    #[test]
    fn restore_window_targets_the_pinned_first_party_origin() {
        assert_eq!(session_origin(), "https://ahousedividedgame.com");
    }

    #[cfg(desktop)]
    #[test]
    fn restore_readiness_requires_first_party_live_site_context() {
        use tauri::Url;
        for ready in [
            "https://ahousedividedgame.com/",
            "https://ahousedividedgame.com/api/auth/session",
        ] {
            let url: Url = ready.parse().unwrap();
            assert!(
                online_window_url_ready(&url),
                "{ready} must count as restored"
            );
        }
        for cold in [
            "about:blank",
            "http://ahousedividedgame.com/",
            "https://ahousedividedgame.com:444/",
            "https://www.ahousedividedgame.com/",
            "https://evil.com/",
            "tauri://localhost/?view=mp",
        ] {
            let url: Url = cold.parse().unwrap();
            assert!(
                !online_window_url_ready(&url),
                "{cold} must not count as restored"
            );
        }
    }

    #[test]
    fn pagination_is_rebuilt_never_forwarded() {
        assert_eq!(
            fetch_path_and_query(MpFetchOp::ClientNav, Some(10), None).unwrap_err(),
            error::UNSUPPORTED_OP
        );
        assert_eq!(
            fetch_path_and_query(MpFetchOp::Notifications, None, None).unwrap_err(),
            error::BAD_ARG
        );
        for bad in [0, 51, 500, u32::MAX] {
            assert_eq!(
                fetch_path_and_query(MpFetchOp::Notifications, Some(bad), None).unwrap_err(),
                error::BAD_ARG,
                "limit {bad} must be rejected"
            );
        }
        assert_eq!(
            fetch_path_and_query(MpFetchOp::Notifications, Some(25), Some(100_001)).unwrap_err(),
            error::BAD_ARG
        );
        assert_eq!(
            fetch_path_and_query(MpFetchOp::Notifications, Some(25), None).unwrap(),
            "/api/notifications?limit=25&offset=0"
        );
        assert_eq!(
            fetch_path_and_query(MpFetchOp::Notifications, Some(50), Some(100)).unwrap(),
            "/api/notifications?limit=50&offset=100"
        );
    }

    #[test]
    fn execute_action_bodies_mirror_the_route_schema() {
        let ok = mutate_body(
            MpMutateOp::ExecuteAction,
            &serde_json::json!({ "actionType": "fundraise" }),
        )
        .unwrap();
        assert_eq!(ok, serde_json::json!({ "actionType": "fundraise" }));

        // Unknown fields are stripped, never forwarded.
        let stripped = mutate_body(
            MpMutateOp::ExecuteAction,
            &serde_json::json!({ "actionType": "rest", "admin": true, "count": 1 }),
        )
        .unwrap();
        assert_eq!(stripped, serde_json::json!({ "actionType": "rest" }));

        // Batch counts mirror the server enum; anything else fails closed.
        let batched = mutate_body(
            MpMutateOp::ExecuteAction,
            &serde_json::json!({ "actionType": "campaign", "count": 5 }),
        )
        .unwrap();
        assert_eq!(
            batched,
            serde_json::json!({ "actionType": "campaign", "count": 5 })
        );
        for bad_count in [0, 2, 7, 100] {
            assert!(
                mutate_body(
                    MpMutateOp::ExecuteAction,
                    &serde_json::json!({ "actionType": "campaign", "count": bad_count }),
                )
                .is_err(),
                "count {bad_count} must be rejected"
            );
        }

        // convertCash is the only amount action, single-run only, positive only.
        assert!(mutate_body(
            MpMutateOp::ExecuteAction,
            &serde_json::json!({ "actionType": "convertCash", "convertAmount": 250 }),
        )
        .is_ok());
        for bad in [
            serde_json::json!({ "actionType": "convertCash", "convertAmount": 0 }),
            serde_json::json!({ "actionType": "convertCash", "convertAmount": -5 }),
            serde_json::json!({ "actionType": "convertCash", "convertAmount": "many" }),
            serde_json::json!({ "actionType": "fundraise", "convertAmount": 10 }),
            serde_json::json!({ "actionType": "convertCash", "convertAmount": 10, "count": 5 }),
            serde_json::json!({ "actionType": "campaign", "convertAmount": 10, "count": 5 }),
        ] {
            assert!(
                mutate_body(MpMutateOp::ExecuteAction, &bad).is_err(),
                "must reject {bad}"
            );
        }

        // targetState is trimmed shape validation; blank or huge fails closed.
        let with_state = mutate_body(
            MpMutateOp::ExecuteAction,
            &serde_json::json!({ "actionType": "campaign", "targetState": "  CA  " }),
        )
        .unwrap();
        assert_eq!(
            with_state,
            serde_json::json!({ "actionType": "campaign", "targetState": "CA" })
        );
        assert!(mutate_body(
            MpMutateOp::ExecuteAction,
            &serde_json::json!({ "actionType": "campaign", "targetState": "   " }),
        )
        .is_err());
        // Server cap is MAX_REGION_ID_LENGTH (15): 15 passes, 16 fails.
        assert!(mutate_body(
            MpMutateOp::ExecuteAction,
            &serde_json::json!({ "actionType": "campaign", "targetState": "x".repeat(15) }),
        )
        .is_ok());
        assert!(mutate_body(
            MpMutateOp::ExecuteAction,
            &serde_json::json!({ "actionType": "campaign", "targetState": "x".repeat(16) }),
        )
        .is_err());
        assert!(mutate_body(
            MpMutateOp::ExecuteAction,
            &serde_json::json!({ "actionType": "nuke" }),
        )
        .is_err());
        assert!(mutate_body(MpMutateOp::ExecuteAction, &serde_json::Value::Null).is_err());
    }

    #[test]
    fn notification_bodies_require_hex_ids_and_fixed_actions() {
        let id = "507f1f77bcf86cd799439011";
        assert_eq!(
            mutate_body(
                MpMutateOp::NotificationRead,
                &serde_json::json!({ "id": id }),
            )
            .unwrap(),
            serde_json::json!({ "id": id, "action": "read" })
        );
        assert_eq!(
            mutate_body(
                MpMutateOp::NotificationArchive,
                &serde_json::json!({ "id": id, "action": "delete", "ids": [id] }),
            )
            .unwrap(),
            serde_json::json!({ "id": id, "action": "archive" })
        );
        for bad in [
            "",
            "507f1f77bcf86cd79943901",
            "507f1f77bcf86cd79943901zz",
            "not-an-id",
        ] {
            assert!(
                mutate_body(
                    MpMutateOp::NotificationRead,
                    &serde_json::json!({ "id": bad }),
                )
                .is_err(),
                "{bad} must be rejected"
            );
        }
        assert!(mutate_body(MpMutateOp::NotificationMarkAllRead, &serde_json::json!({}),).is_ok());
        assert!(mutate_body(
            MpMutateOp::NotificationMarkAllRead,
            &serde_json::json!({ "id": id }),
        )
        .is_err());
    }

    #[test]
    fn snooze_unsnooze_unarchive_bodies_match_the_patch_schema() {
        let id = "507f1f77bcf86cd799439011";
        // Snooze without minutes is accepted: the server defaults to 720.
        assert_eq!(
            mutate_body(
                MpMutateOp::NotificationSnooze,
                &serde_json::json!({ "id": id }),
            )
            .unwrap(),
            serde_json::json!({ "id": id, "action": "snooze" })
        );
        assert_eq!(
            mutate_body(
                MpMutateOp::NotificationSnooze,
                &serde_json::json!({ "id": id, "snoozeMinutes": 60 }),
            )
            .unwrap(),
            serde_json::json!({ "id": id, "action": "snooze", "snoozeMinutes": 60 })
        );
        // Server window is 5..10080 minutes; anything else fails closed.
        for bad_minutes in [
            serde_json::json!(0),
            serde_json::json!(4),
            serde_json::json!(10081),
            serde_json::json!(7.5),
            serde_json::json!("60"),
        ] {
            assert!(
                mutate_body(
                    MpMutateOp::NotificationSnooze,
                    &serde_json::json!({ "id": id, "snoozeMinutes": bad_minutes }),
                )
                .is_err(),
                "snoozeMinutes {bad_minutes} must be rejected"
            );
        }
        assert!(mutate_body(
            MpMutateOp::NotificationSnooze,
            &serde_json::json!({ "id": "short", "snoozeMinutes": 60 }),
        )
        .is_err());
        assert_eq!(
            mutate_body(
                MpMutateOp::NotificationUnsnooze,
                &serde_json::json!({ "id": id, "action": "snooze" }),
            )
            .unwrap(),
            serde_json::json!({ "id": id, "action": "unsnooze" })
        );
        assert_eq!(
            mutate_body(
                MpMutateOp::NotificationUnarchive,
                &serde_json::json!({ "id": id }),
            )
            .unwrap(),
            serde_json::json!({ "id": id, "action": "unarchive" })
        );
        assert!(mutate_body(
            MpMutateOp::NotificationUnarchive,
            &serde_json::json!({ "id": "not-an-id" }),
        )
        .is_err());
    }

    #[test]
    fn preference_bodies_match_the_preference_schema() {
        assert_eq!(
            mutate_body(
                MpMutateOp::NotificationPreference,
                &serde_json::json!({ "action": "mute", "type": "turn_advance" }),
            )
            .unwrap(),
            serde_json::json!({ "action": "mute", "type": "turn_advance" })
        );
        assert_eq!(
            mutate_body(
                MpMutateOp::NotificationPreference,
                &serde_json::json!({ "action": "unmute", "type": "system", "admin": true }),
            )
            .unwrap(),
            serde_json::json!({ "action": "unmute", "type": "system" })
        );
        // Preference snooze/unsnooze are not modeled; unknown types never send.
        for bad in [
            serde_json::json!({ "action": "snooze", "type": "system" }),
            serde_json::json!({ "action": "unsnooze", "type": "system" }),
            serde_json::json!({ "action": "mute", "type": "nuke" }),
            serde_json::json!({ "action": "mute", "type": "" }),
            serde_json::json!({ "action": "mute" }),
            serde_json::json!({ "type": "system" }),
        ] {
            assert!(
                mutate_body(MpMutateOp::NotificationPreference, &bad).is_err(),
                "must reject {bad}"
            );
        }
    }

    #[test]
    fn new_mutate_ids_resolve_to_pinned_method_and_path() {
        assert_eq!(
            MpMutateOp::from_id("notification-snooze"),
            Some(MpMutateOp::NotificationSnooze)
        );
        assert_eq!(
            MpMutateOp::from_id("notification-unsnooze"),
            Some(MpMutateOp::NotificationUnsnooze)
        );
        assert_eq!(
            MpMutateOp::from_id("notification-unarchive"),
            Some(MpMutateOp::NotificationUnarchive)
        );
        assert_eq!(
            MpMutateOp::from_id("notification-preference"),
            Some(MpMutateOp::NotificationPreference)
        );
        assert_eq!(MpMutateOp::from_id("notification-delete"), None);
        assert_eq!(MpMutateOp::from_id("NOTIFICATION-SNOOZE"), None);
        let op = MpMutateOp::NotificationSnooze;
        assert_eq!((op.method(), op.path()), ("PATCH", "/api/notifications"));
        let op = MpMutateOp::NotificationPreference;
        assert_eq!(
            (op.method(), op.path()),
            ("PUT", "/api/notifications/preferences")
        );
        assert!(is_allowlisted_call("PUT", "/api/notifications/preferences"));
        assert!(!is_allowlisted_call(
            "PATCH",
            "/api/notifications/preferences"
        ));
        assert!(!is_allowlisted_call("PUT", "/api/notifications"));
        assert!(!is_allowlisted_call("DELETE", "/api/notifications"));
    }

    #[test]
    fn auth_logout_unlinks_through_the_pinned_endpoint_only() {
        // Unlink (#149) is one POST with an empty body: the live session
        // cookie is the identity, so there is nothing to validate or embed.
        assert_eq!(
            MpMutateOp::from_id("auth-logout"),
            Some(MpMutateOp::AuthLogout)
        );
        assert_eq!(MpMutateOp::from_id("AUTH-LOGOUT"), None);
        assert_eq!(MpMutateOp::from_id("logout"), None);
        let op = MpMutateOp::AuthLogout;
        assert_eq!((op.method(), op.path()), ("POST", "/api/auth/logout"));
        assert_eq!(
            mutate_path(op, &serde_json::json!({})).unwrap(),
            "/api/auth/logout"
        );
        // Stray fields are stripped, never forwarded; non-objects fail.
        assert_eq!(
            mutate_body(
                MpMutateOp::AuthLogout,
                &serde_json::json!({ "userId": "x", "token": "y" }),
            )
            .unwrap(),
            serde_json::json!({})
        );
        assert_eq!(
            mutate_body(MpMutateOp::AuthLogout, &serde_json::Value::Null).unwrap_err(),
            error::BAD_ARG
        );
        // The allowlist admits exactly this call: no query, no GET sibling,
        // and no neighboring auth surface (login/register/delete-account
        // stay absent, never sent).
        assert!(is_allowlisted_call("POST", "/api/auth/logout"));
        assert!(!is_allowlisted_call("POST", "/api/auth/logout?x=1"));
        assert!(!is_allowlisted_call("GET", "/api/auth/logout"));
        assert!(!is_allowlisted_call("POST", "/api/auth/login"));
        assert!(!is_allowlisted_call("POST", "/api/auth/delete-account"));
    }

    #[test]
    fn allowlist_rejects_off_origin_and_injected_calls() {
        for allowed in [
            ("GET", "/api/auth/session"),
            ("GET", "/api/character/me"),
            ("GET", "/api/client-nav"),
            ("GET", "/api/game/turn/status"),
            ("GET", "/api/players/online"),
            ("GET", "/api/game-time"),
            ("GET", "/api/admin/maintenance"),
            ("GET", "/api/notifications?limit=25&offset=0"),
            ("GET", "/api/notifications?offset=10&limit=1"),
            ("POST", "/api/actions/execute"),
            ("PATCH", "/api/notifications"),
        ] {
            assert!(
                is_allowlisted_call(allowed.0, allowed.1),
                "{allowed:?} must be allowed"
            );
        }
        for denied in [
            ("GET", "https://ahousedividedgame.com/api/client-nav"),
            ("POST", "/api/client-nav"),
            ("GET", "/api/actions/execute"),
            ("DELETE", "/api/notifications"),
            ("PATCH", "/api/notifications?limit=10"),
            ("GET", "/api/client-nav?x=1"),
            ("GET", "/api/players/online?x=1"),
            ("GET", "/api/notifications"),
            ("GET", "/api/notifications?limit=500&offset=0"),
            ("GET", "/api/notifications?limit=10"),
            ("GET", "/api/notifications?limit=10&offset=0&admin=true"),
            ("GET", "/api/notifications?LIMIT=10&offset=0"),
            ("GET", "/api/character/me?x=1"),
            ("POST", "/api/auth/login"),
            ("GET", "/api/admin/users"),
            ("PATCH", "/api/admin/maintenance"),
            ("POST", "/api/admin/maintenance"),
            ("GET", "/api/admin/maintenance?x=1"),
        ] {
            assert!(
                !is_allowlisted_call(denied.0, denied.1),
                "{denied:?} must be rejected"
            );
        }
        // Off-origin smuggling through the path slot is impossible: pins are
        // relative, and anything else fails the match above.
        for sneaky in [
            "https://evil.com/api/client-nav",
            "https://ahousedividedgame.com.evil.com/api/client-nav",
            "//evil.com/api/client-nav",
            "/api/client-nav#x",
        ] {
            assert!(
                !is_allowlisted_call("GET", sneaky),
                "{sneaky} must be rejected"
            );
        }
        // The origin pin itself is scheme+host exact.
        assert_eq!(MP_SESSION_SCHEME, "https");
        assert_eq!(MP_SESSION_HOST, "ahousedividedgame.com");
        assert_eq!(session_origin(), "https://ahousedividedgame.com");
    }

    #[test]
    fn election_detail_resolves_to_the_pinned_summary_read() {
        assert_eq!(
            MpFetchOp::from_id("election-detail"),
            Some(MpFetchOp::ElectionDetail)
        );
        assert_eq!(MpFetchOp::ElectionDetail.path(), "/api/elections");
        assert_eq!(MpFetchOp::from_id("ELECTION-DETAIL"), None);
        assert_eq!(MpFetchOp::from_id("elections"), None);
        // Valid references build the exact summary query; pagination never
        // applies to this read.
        assert_eq!(
            fetch_election_path("68a000000000000000000001").unwrap(),
            "/api/elections?id=68a000000000000000000001&view=summary"
        );
        assert_eq!(
            fetch_election_path("US-senate-PA-1").unwrap(),
            "/api/elections?id=US-senate-PA-1&view=summary"
        );
        // Traversal, query smuggling, and drift all fail closed.
        for bad in [
            "",
            "e1",
            "seat-9",
            "US",
            "US-",
            "-senate-PA",
            "US--PA",
            "US-senate-PA-1!",
            "US senate",
            "68a000000000000000000001&view=full",
            "US-senate-PA-1&view=full",
            "../../admin/maintenance",
            "/api/elections?id=x",
            "US-senate-PA-1?view=full",
            "classifier-that-is-far-too-long-for-any-real-seat-identifier-x",
        ] {
            assert!(
                fetch_election_path(bad).is_err(),
                "{bad:?} must be rejected"
            );
        }
    }

    #[test]
    fn election_allowlist_pins_summary_view_and_validated_id() {
        for allowed in [
            "/api/elections?id=68a000000000000000000001&view=summary",
            "/api/elections?id=US-senate-PA-1&view=summary",
            "/api/elections?view=summary&id=US-senate-PA-1",
        ] {
            assert!(
                is_allowlisted_call("GET", allowed),
                "{allowed} must be allowed"
            );
        }
        for denied in [
            "/api/elections",
            "/api/elections?id=68a000000000000000000001",
            "/api/elections?view=summary",
            "/api/elections?id=68a000000000000000000001&view=full",
            "/api/elections?id=US-senate-PA-1&view=summary&cycle=3",
            "/api/elections?id=e1&view=summary",
            "/api/elections?id=US-senate-PA-1&view=summary&id=US-senate-PA-1",
            "/api/elections?id=US-senate-PA-1&view=Summary",
            "https://ahousedividedgame.com/api/elections?id=US-senate-PA-1&view=summary",
        ] {
            assert!(
                !is_allowlisted_call("GET", denied),
                "{denied} must be rejected"
            );
        }
        assert!(!is_allowlisted_call(
            "POST",
            "/api/elections?id=US-senate-PA-1&view=summary"
        ));
        assert!(!is_allowlisted_call(
            "PATCH",
            "/api/elections?id=US-senate-PA-1&view=summary"
        ));
    }

    #[test]
    fn corporation_detail_resolves_to_the_pinned_company_read() {
        assert_eq!(
            MpFetchOp::from_id("corporation-detail"),
            Some(MpFetchOp::CorporationDetail)
        );
        assert_eq!(MpFetchOp::CorporationDetail.path(), "/api/corporations");
        assert_eq!(MpFetchOp::from_id("CORPORATION-DETAIL"), None);
        assert_eq!(MpFetchOp::from_id("corporations"), None);
        assert_eq!(MpFetchOp::from_id("corporation"), None);
        // Sequential ids and hex ObjectIds build the exact item path;
        // pagination never applies to this read.
        assert_eq!(
            fetch_corporation_path("42").unwrap(),
            "/api/corporations/42"
        );
        assert_eq!(
            fetch_corporation_path("68a000000000000000000001").unwrap(),
            "/api/corporations/68a000000000000000000001"
        );
        // The digit bound is ten digits in every layer (shared with the TS
        // `isCorporationId` number/string forms); an 11-digit reference
        // never leaves the bridge even though the live route is unbounded.
        assert_eq!(
            fetch_corporation_path("9999999999").unwrap(),
            "/api/corporations/9999999999"
        );
        assert!(fetch_corporation_path("12345678901").is_err());
        // Traversal, query smuggling, and drift all fail closed.
        for bad in [
            "",
            "e1",
            "corp-42",
            "42 ",
            " 42",
            "4.5",
            "-1",
            "0x2A",
            "42&view=full",
            "42?view=full",
            "42/sectors",
            "../admin/maintenance",
            "/api/corporations/42",
            "68a000000000000000000001&view=full",
            "0000000000000000000000000",
            "99999999999999999999999999",
        ] {
            assert!(
                fetch_corporation_path(bad).is_err(),
                "{bad:?} must be rejected"
            );
        }
    }

    #[test]
    fn corporation_allowlist_pins_item_path_and_validated_id() {
        for allowed in [
            "/api/corporations/42",
            "/api/corporations/0",
            "/api/corporations/9999999999",
            "/api/corporations/68a000000000000000000001",
        ] {
            assert!(
                is_allowlisted_call("GET", allowed),
                "{allowed} must be allowed"
            );
        }
        for denied in [
            "/api/corporations",
            "/api/corporations/",
            "/api/corporations/42/",
            "/api/corporations/12345678901",
            "/api/corporations/e1",
            "/api/corporations/corp-42",
            "/api/corporations/42?view=summary",
            "/api/corporations/42?limit=1&offset=0",
            "/api/corporations/42/sectors",
            "/api/corporations/42/../43",
            "/api/corporations/68a000000000000000000001&view=full",
            "https://ahousedividedgame.com/api/corporations/42",
        ] {
            assert!(
                !is_allowlisted_call("GET", denied),
                "{denied} must be rejected"
            );
        }
        assert!(!is_allowlisted_call("POST", "/api/corporations/42"));
        assert!(!is_allowlisted_call("PATCH", "/api/corporations/42"));
        assert!(!is_allowlisted_call("DELETE", "/api/corporations/42"));
    }

    #[test]
    fn start_scripts_embed_dynamics_as_json_only() {
        let hostile = serde_json::json!({
            "actionType": "campaign",
            "targetState": "\");alert(1);//",
        });
        let body = mutate_body(MpMutateOp::ExecuteAction, &hostile).unwrap();
        let (script, request_id) = start_script("POST", "/api/actions/execute", Some(&body));
        // The hostile fragment survives only inside a JSON string literal.
        assert!(script.contains("alert(1)"));
        assert!(script.contains("https://ahousedividedgame.com/api/actions/execute"));
        assert!(script.contains("credentials:\"same-origin\""));
        assert!(script.contains("redirect:\"manual\""));
        assert!(!script.contains("document.cookie"));
        assert!(!script.contains("localStorage"));
        assert!(!script.contains("sessionStorage"));
        assert!(!script.contains("X-Bot-Token"));
        assert!(!script.contains("XMLHttpRequest"));
        // Poll and cleanup round-trip the same id without executing calls.
        let poll = poll_script(&request_id);
        assert!(poll.contains(&request_id));
        assert!(!poll.contains("fetch("));
        let cleanup = cleanup_script(&request_id);
        assert!(cleanup.contains(&request_id));
        assert!(!cleanup.contains("fetch("));
        // Ids are unique per call so concurrent actions cannot collide.
        let (_, second_id) = start_script("GET", "/api/game-time", None);
        assert_ne!(request_id, second_id);
    }

    #[test]
    fn outcomes_classify_server_statuses_honestly() {
        let ok_outcome = PageOutcome {
            done: true,
            ok: true,
            out: Some(PageCall {
                redirected: false,
                status: 200,
                retry_after: None,
                content_type: Some("application/json; charset=utf-8".to_string()),
                oversize: false,
                body: "{\"active\":true}".to_string(),
            }),
        };
        assert_eq!(classify_outcome(&ok_outcome).unwrap(), "{\"active\":true}");

        // Non-2xx preserves status, retry delay, and the server message.
        let limited = PageOutcome {
            done: true,
            ok: true,
            out: Some(PageCall {
                redirected: false,
                status: 429,
                retry_after: Some("45".to_string()),
                content_type: Some("application/json".to_string()),
                oversize: false,
                body: "{\"error\":\"too quick\",\"code\":\"rate_limited\"}".to_string(),
            }),
        };
        let err = classify_outcome(&limited).unwrap_err();
        assert!(err.starts_with("remote-error:429:45:"), "got {err}");
        assert!(err.contains("rate_limited"));

        let refused = PageOutcome {
            done: true,
            ok: true,
            out: Some(PageCall {
                redirected: false,
                status: 403,
                retry_after: None,
                content_type: Some("application/json".to_string()),
                oversize: false,
                body: "{\"error\":\"Forbidden\"}".to_string(),
            }),
        };
        assert!(classify_outcome(&refused)
            .unwrap_err()
            .starts_with("remote-error:403:0:"));

        // Non-JSON error bodies never cross the bridge: a proxy or
        // captive-portal markup page keeps its status and retry mapping
        // (so 401 still expires and 429 still backs off) but forwards an
        // empty body, which the adapter degrades to its generic refusal.
        // The reference 401 JSON body still forwards for signed-out mapping.
        for (status, retry_after, content_type, body, expected) in [
            (
                401,
                None,
                Some("text/html"),
                "<html><head><title>Login</title></head></html>",
                "remote-error:401:0:",
            ),
            (
                502,
                None,
                Some("text/html; charset=utf-8"),
                "<html><body>Bad Gateway</body></html>",
                "remote-error:502:0:",
            ),
            (
                429,
                Some("45".to_string()),
                None,
                "<html>limited</html>",
                "remote-error:429:45:",
            ),
            (
                401,
                None,
                Some("application/json"),
                "{\"active\":false}",
                "remote-error:401:0:{\"active\":false}",
            ),
        ] {
            let outcome = PageOutcome {
                done: true,
                ok: true,
                out: Some(PageCall {
                    redirected: false,
                    status,
                    retry_after,
                    content_type: content_type.map(str::to_string),
                    oversize: false,
                    body: body.to_string(),
                }),
            };
            assert_eq!(classify_outcome(&outcome).unwrap_err(), expected);
        }

        // Long error bodies are capped; redirects, wrong types, and oversize
        // fail closed with stable strings.
        let big = PageOutcome {
            done: true,
            ok: true,
            out: Some(PageCall {
                redirected: false,
                status: 500,
                retry_after: None,
                content_type: Some("application/json".to_string()),
                oversize: false,
                body: "x".repeat(10_000),
            }),
        };
        let err = classify_outcome(&big).unwrap_err();
        assert!(err.starts_with("remote-error:500:0:"));
        assert!(err.len() < 10_000);
        for (outcome, expected) in [
            (
                PageOutcome {
                    done: true,
                    ok: true,
                    out: Some(PageCall {
                        redirected: true,
                        status: 0,
                        retry_after: None,
                        content_type: None,
                        oversize: false,
                        body: String::new(),
                    }),
                },
                error::UNEXPECTED_REDIRECT,
            ),
            (
                PageOutcome {
                    done: true,
                    ok: true,
                    out: Some(PageCall {
                        redirected: false,
                        status: 200,
                        retry_after: None,
                        content_type: Some("text/html".to_string()),
                        oversize: false,
                        body: "<html>".to_string(),
                    }),
                },
                error::UNEXPECTED_CONTENT,
            ),
            (
                PageOutcome {
                    done: true,
                    ok: true,
                    out: Some(PageCall {
                        redirected: false,
                        status: 200,
                        retry_after: None,
                        content_type: Some("application/json".to_string()),
                        oversize: true,
                        body: "x".repeat(10),
                    }),
                },
                error::OVERSIZE_BODY,
            ),
            (
                PageOutcome {
                    done: false,
                    ok: false,
                    out: None,
                },
                error::SESSION_TRANSPORT,
            ),
            (
                PageOutcome {
                    done: true,
                    ok: false,
                    out: None,
                },
                error::SESSION_TRANSPORT,
            ),
        ] {
            assert_eq!(classify_outcome(&outcome).unwrap_err(), expected);
        }
        assert!(parse_poll_result("not json").is_err());
        assert!(!parse_poll_result("{\"done\":false}").unwrap().done);
    }

    #[test]
    fn retry_after_parsing_is_lenient_but_bounded() {
        assert_eq!(retry_after_secs(None), 0);
        assert_eq!(retry_after_secs(Some("45")), 45);
        assert_eq!(retry_after_secs(Some("  60  ")), 60);
        assert_eq!(retry_after_secs(Some("soon")), 0);
        assert_eq!(retry_after_secs(Some("-5")), 0);
        // `u64::MAX + 1` cannot parse, so absurd server values become 0.
        assert_eq!(retry_after_secs(Some("18446744073709551616")), 0);
        assert!(content_type_is_json(Some("application/json")));
        assert!(content_type_is_json(Some(
            "Application/JSON; charset=utf-8"
        )));
        assert!(!content_type_is_json(Some("text/html")));
        assert!(!content_type_is_json(None));
    }

    #[test]
    fn bridge_wiring_stays_session_scoped() {
        // Structural guard: neither transport may persist credentials or
        // permit arbitrary traffic. Desktop remains same-origin in its
        // authenticated WebView; mobile relays only allowlisted calls with a
        // platform-owned account cookie to the pinned origin.
        let (start, id) = start_script(
            "POST",
            "/api/actions/execute",
            Some(&serde_json::json!({ "actionType": "rest" })),
        );
        let pages = [start, poll_script(&id), cleanup_script(&id)];
        for page in &pages {
            for forbidden in [
                ["document", "cookie"].join("."),
                ["local", "Storage"].join(""),
                ["session", "Storage"].join(""),
                ["X", "Bot-Token"].join("-"),
                ["Authori", "zation"].join(""),
                ["pass", "word"].join(""),
            ] {
                assert!(
                    !page.contains(&forbidden),
                    "bridge scripts must stay session-scoped ({forbidden})"
                );
            }
        }
        let source = include_str!("mp_session.rs");
        assert!(source.contains(MP_SESSION_WINDOW_LABEL));
        assert!(source.contains("redirect:\"manual\""));
        assert!(source.contains("credentials:\"same-origin\""));
        assert!(source.contains("account_session_header"));
        assert!(source.contains("redirect(reqwest::redirect::Policy::none())"));
        assert!(source.contains("header(reqwest::header::COOKIE, session)"));
        for forbidden in [
            ["std", "fs"].join("::"),
            ["fs", ""].join("::"),
            ["cookie", "store"].join("_"),
            ["Cookie", "Store"].join(""),
        ] {
            assert!(
                !source.contains(&forbidden),
                "bridge wiring must stay session-scoped ({forbidden})"
            );
        }
    }

    #[test]
    fn mail_fetch_ids_resolve_to_pinned_paths() {
        assert_eq!(MpFetchOp::from_id("mail-inbox"), Some(MpFetchOp::MailInbox));
        assert_eq!(MpFetchOp::from_id("mail-sent"), Some(MpFetchOp::MailSent));
        assert_eq!(MpFetchOp::MailInbox.path(), "/api/mail");
        assert_eq!(MpFetchOp::MailSent.path(), "/api/mail/sent");
        // No single-mail fetch exists server-side. Staff mail-report ids stay
        // absent; the separate admin-maintenance fetch is allowlisted above.
        for bad in [
            "mail",
            "mail-read",
            "MAIL-INBOX",
            "Mail-Sent",
            "",
            "../mail",
            "/api/mail",
            "admin-mail-reports",
        ] {
            assert_eq!(MpFetchOp::from_id(bad), None, "{bad} must be rejected");
        }
    }

    #[test]
    fn mail_fetch_pagination_is_rebuilt_never_forwarded() {
        assert_eq!(
            fetch_path_and_query(MpFetchOp::MailInbox, Some(50), Some(0)).unwrap(),
            "/api/mail?limit=50&offset=0"
        );
        assert_eq!(
            fetch_path_and_query(MpFetchOp::MailSent, Some(20), Some(40)).unwrap(),
            "/api/mail/sent?limit=20&offset=40"
        );
        // Same window as the notification read: 1..=50 with a required limit.
        for bad in [0, 51, 500, u32::MAX] {
            assert_eq!(
                fetch_path_and_query(MpFetchOp::MailInbox, Some(bad), None).unwrap_err(),
                error::BAD_ARG,
                "limit {bad} must be rejected"
            );
        }
        assert_eq!(
            fetch_path_and_query(MpFetchOp::MailSent, None, None).unwrap_err(),
            error::BAD_ARG
        );
        assert_eq!(
            fetch_path_and_query(MpFetchOp::MailInbox, Some(25), Some(100_001)).unwrap_err(),
            error::BAD_ARG
        );
    }

    #[test]
    fn mail_mutate_ids_resolve_to_pinned_method_and_path() {
        assert_eq!(MpMutateOp::from_id("mail-send"), Some(MpMutateOp::MailSend));
        assert_eq!(MpMutateOp::from_id("mail-read"), Some(MpMutateOp::MailRead));
        assert_eq!(
            MpMutateOp::from_id("mail-delete"),
            Some(MpMutateOp::MailDelete)
        );
        assert_eq!(
            MpMutateOp::from_id("mail-sent-delete"),
            Some(MpMutateOp::MailSentDelete)
        );
        assert_eq!(
            MpMutateOp::from_id("mail-report"),
            Some(MpMutateOp::MailReport)
        );
        assert_eq!(MpMutateOp::from_id("mail-inbox"), None);
        assert_eq!(MpMutateOp::from_id("MAIL-SEND"), None);
        assert_eq!(MpMutateOp::from_id("admin-mail"), None);
        assert_eq!(MpMutateOp::MailSend.method(), "POST");
        assert_eq!(MpMutateOp::MailRead.method(), "PATCH");
        assert_eq!(MpMutateOp::MailDelete.method(), "DELETE");
        assert_eq!(MpMutateOp::MailSentDelete.method(), "DELETE");
        assert_eq!(MpMutateOp::MailReport.method(), "POST");
    }

    #[test]
    fn mail_send_bodies_mirror_the_route_schema() {
        let recipient = "507f1f77bcf86cd799439012";
        let ok = mutate_body(
            MpMutateOp::MailSend,
            &serde_json::json!({ "toCharacterId": recipient, "subject": "  Hi  ", "body": " Hello " }),
        )
        .unwrap();
        assert_eq!(
            ok,
            serde_json::json!({ "toCharacterId": recipient, "subject": "Hi", "body": "Hello" })
        );
        // Unknown fields are stripped, never forwarded.
        let stripped = mutate_body(
            MpMutateOp::MailSend,
            &serde_json::json!({ "toCharacterId": recipient, "subject": "Hi", "body": "Hello", "admin": true }),
        )
        .unwrap();
        assert_eq!(
            stripped,
            serde_json::json!({ "toCharacterId": recipient, "subject": "Hi", "body": "Hello" })
        );
        // Boundary lengths pass; one unit more fails.
        assert!(mutate_body(
            MpMutateOp::MailSend,
            &serde_json::json!({ "toCharacterId": recipient, "subject": "x".repeat(80), "body": "x".repeat(1000) }),
        )
        .is_ok());
        for bad in [
            serde_json::json!({ "toCharacterId": "short", "subject": "Hi", "body": "Hello" }),
            serde_json::json!({ "toCharacterId": recipient, "subject": "   ", "body": "Hello" }),
            serde_json::json!({ "toCharacterId": recipient, "subject": "x".repeat(81), "body": "Hello" }),
            serde_json::json!({ "toCharacterId": recipient, "subject": "Hi", "body": "" }),
            serde_json::json!({ "toCharacterId": recipient, "subject": "Hi", "body": "x".repeat(1001) }),
            serde_json::json!({ "toCharacterId": recipient, "subject": 42, "body": "Hello" }),
            serde_json::json!({ "toCharacterId": recipient, "subject": "Hi" }),
            serde_json::json!({ "subject": "Hi", "body": "Hello" }),
        ] {
            assert!(
                mutate_body(MpMutateOp::MailSend, &bad).is_err(),
                "must reject {bad}"
            );
        }
        // Limits count UTF-16 units like the server: 80 emoji are 160 units.
        assert!(mutate_body(
            MpMutateOp::MailSend,
            &serde_json::json!({ "toCharacterId": recipient, "subject": "😀".repeat(40), "body": "ok" }),
        )
        .is_ok());
        assert!(mutate_body(
            MpMutateOp::MailSend,
            &serde_json::json!({ "toCharacterId": recipient, "subject": "😀".repeat(41), "body": "ok" }),
        )
        .is_err());
    }

    #[test]
    fn mail_id_bodies_require_hex_ids_and_empty_wire_bodies() {
        let id = "607f1f77bcf86cd799439011";
        for op in [
            MpMutateOp::MailRead,
            MpMutateOp::MailDelete,
            MpMutateOp::MailSentDelete,
            MpMutateOp::MailReport,
        ] {
            assert_eq!(
                mutate_body(op, &serde_json::json!({ "id": id })),
                Ok(serde_json::json!({})),
                "{op:?} must send an empty body"
            );
            // Unknown fields are tolerated but never forwarded.
            assert_eq!(
                mutate_body(op, &serde_json::json!({ "id": id, "action": "delete" })),
                Ok(serde_json::json!({})),
                "{op:?} must strip unknown fields"
            );
            for bad in ["", "short", "607f1f77bcf86cd79943901zz", "not-an-id"] {
                assert!(
                    mutate_body(op, &serde_json::json!({ "id": bad })).is_err(),
                    "{op:?} must reject id {bad}"
                );
            }
            assert!(mutate_body(op, &serde_json::json!({})).is_err());
            assert!(mutate_body(op, &serde_json::Value::Null).is_err());
        }
    }

    #[test]
    fn mail_id_paths_embed_one_validated_id() {
        let id = "607f1f77bcf86cd799439011";
        let payload = serde_json::json!({ "id": id });
        assert_eq!(
            mutate_path(MpMutateOp::MailRead, &payload).unwrap(),
            format!("/api/mail/{id}")
        );
        assert_eq!(
            mutate_path(MpMutateOp::MailDelete, &payload).unwrap(),
            format!("/api/mail/{id}")
        );
        assert_eq!(
            mutate_path(MpMutateOp::MailSentDelete, &payload).unwrap(),
            format!("/api/mail/sent/{id}")
        );
        assert_eq!(
            mutate_path(MpMutateOp::MailReport, &payload).unwrap(),
            format!("/api/mail/{id}/report")
        );
        assert_eq!(
            mutate_path(
                MpMutateOp::MailSend,
                &serde_json::json!({ "toCharacterId": "507f1f77bcf86cd799439012", "subject": "Hi", "body": "Hello" }),
            )
            .unwrap(),
            "/api/mail"
        );
        // A hostile id never reaches the path: traversal and bad hex fail.
        for bad in [
            serde_json::json!({ "id": "../admin" }),
            serde_json::json!({ "id": "607f1f77bcf86cd799439011/report" }),
            serde_json::json!({ "id": "short" }),
        ] {
            assert!(mutate_path(MpMutateOp::MailRead, &bad).is_err());
            assert!(mutate_path(MpMutateOp::MailReport, &bad).is_err());
        }
    }

    #[test]
    fn mail_allowlist_pins_method_path_and_body_shape() {
        let id = "607f1f77bcf86cd799439011";
        let mail_item = format!("/api/mail/{id}");
        let mail_sent_item = format!("/api/mail/sent/{id}");
        let mail_report = format!("/api/mail/{id}/report");
        for allowed in [
            ("GET", "/api/mail?limit=50&offset=0"),
            ("GET", "/api/mail?offset=10&limit=1"),
            ("GET", "/api/mail/sent?limit=25&offset=0"),
            ("POST", "/api/mail"),
            ("PATCH", mail_item.as_str()),
            ("DELETE", mail_item.as_str()),
            ("DELETE", mail_sent_item.as_str()),
            ("POST", mail_report.as_str()),
        ] {
            assert!(
                is_allowlisted_call(allowed.0, allowed.1),
                "{allowed:?} must be allowed"
            );
        }
        let mail_query = format!("/api/mail/{id}?limit=10");
        for denied in [
            // No single-mail fetch exists server-side.
            ("GET", mail_item.as_str()),
            ("GET", "/api/mail"),
            ("GET", "/api/mail/sent"),
            ("GET", "/api/mail?limit=500&offset=0"),
            ("GET", "/api/mail?limit=10"),
            ("GET", "/api/mail/sent?limit=10&offset=0&admin=true"),
            ("GET", "/api/mail/sent?LIMIT=10&offset=0"),
            // Wrong methods on the mail collections and items.
            ("POST", "/api/mail/sent"),
            ("PUT", "/api/mail"),
            ("DELETE", "/api/mail"),
            ("GET", mail_report.as_str()),
            ("PATCH", mail_report.as_str()),
            ("DELETE", mail_report.as_str()),
            ("PATCH", mail_sent_item.as_str()),
            ("POST", mail_sent_item.as_str()),
            ("POST", mail_item.as_str()),
            // Query strings never ride on mutations.
            ("PATCH", mail_query.as_str()),
            ("POST", "/api/mail?limit=10"),
            // Non-hex ids and traversal fail closed.
            ("PATCH", "/api/mail/short"),
            ("DELETE", "/api/mail/../admin"),
            ("POST", "/api/mail/not-an-id/report"),
            ("DELETE", "/api/mail/sent/not-an-id"),
            // Staff and channel surfaces stay absent.
            ("GET", "/api/admin/mail-reports"),
            ("POST", "/api/admin/mail-reports"),
            ("GET", "/api/channels"),
            ("POST", "/api/channels"),
        ] {
            assert!(
                !is_allowlisted_call(denied.0, denied.1),
                "{denied:?} must be rejected"
            );
        }
    }
}
