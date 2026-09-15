//! Read-only multiplayer view relay (#359).
//!
//! The live AHDGame session cookie is `HttpOnly; SameSite=Lax` (see
//! `src/lib/auth.ts` in AHDGame). It only travels in first-party live-site
//! requests, so this relay deliberately carries **no cookies and no
//! credentials**: it can never exfiltrate or mint a session, and no token
//! store exists anywhere in Native (#149 boundary holds).
//!
//! What this relay does:
//! - GET-only fetches against the pinned `https://ahousedividedgame.com`
//!   origin, restricted to the read endpoints in [`MpEndpoint`].
//! - Query strings are rebuilt from validated parameters; raw caller query
//!   text is never forwarded.
//! - Responses must be JSON and fit [`MP_VIEW_MAX_BODY_BYTES`]; nothing is
//!   written to disk and nothing is cached (`Cache-Control: no-store` is sent
//!   and no response is stored).
//! - Redirects are never followed, so an allowlisted URL cannot bounce the
//!   relay off-origin.
//!
//! Authenticated server bodies need the first-party cookie jar, which this
//! process cannot and must not touch. Until AHDGame ships a read contract the
//! native origin may use (child issue), authenticated endpoints answer 401
//! here and the TypeScript adapter reports `signed-out` instead of inventing
//! data. Public endpoints (turn status, game time, guest nav) work end to end.

use std::sync::OnceLock;

const MP_VIEW_SCHEME: &str = "https";
const MP_VIEW_HOST: &str = "ahousedividedgame.com";
const MP_VIEW_ORIGIN: &str = "https://ahousedividedgame.com";

/// Largest single endpoint body accepted; larger bodies are rejected before
/// parsing so a hostile or drifting endpoint cannot blow up device memory.
const MP_VIEW_MAX_BODY_BYTES: usize = 256 * 1024;
const MP_VIEW_TIMEOUT_SECS: u64 = 15;
const MP_VIEW_USER_AGENT: &str = concat!(
    "AHDNative/",
    env!("CARGO_PKG_VERSION"),
    " (read-only multiplayer view)"
);

/// Read-only endpoints the native multiplayer view may fetch. Every variant
/// maps to one pinned path; see [`mp_view_url`]. Anything else the UI asks
/// for fails closed with `unsupported-endpoint`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MpEndpoint {
    /// Navbar essentials; public, returns guest data when signed out.
    ClientNav,
    /// Turn/year/processing/countdown; public.
    TurnStatus,
    /// Turn/year/iteration fallback; public.
    GameTime,
    /// Legacy read-only session probe; 401 with `{active:false}` signed out.
    AuthSession,
    /// Paginated inbox; requires first-party session, 401 otherwise.
    Notifications,
}

impl MpEndpoint {
    fn from_id(id: &str) -> Option<Self> {
        match id {
            "client-nav" => Some(Self::ClientNav),
            "turn-status" => Some(Self::TurnStatus),
            "game-time" => Some(Self::GameTime),
            "auth-session" => Some(Self::AuthSession),
            "notifications" => Some(Self::Notifications),
            _ => None,
        }
    }

    fn path(self) -> &'static str {
        match self {
            Self::ClientNav => "/api/client-nav",
            Self::TurnStatus => "/api/game/turn/status",
            Self::GameTime => "/api/game-time",
            Self::AuthSession => "/api/auth/session",
            Self::Notifications => "/api/notifications",
        }
    }
}

/// Stable relay error strings surfaced to the TypeScript adapter.
pub mod error {
    pub const UNSUPPORTED_ENDPOINT: &str = "unsupported-endpoint";
    pub const BAD_LIMIT: &str = "bad-notifications-limit";
    pub const NETWORK_UNAVAILABLE: &str = "network-unavailable";
    pub const OVERSIZE_BODY: &str = "oversize-body";
    pub const UNEXPECTED_CONTENT: &str = "unexpected-content";
}

/// Build the exact request URL for an endpoint. Query parameters are rebuilt
/// from validated inputs; callers cannot smuggle raw query text through.
fn mp_view_url(endpoint: MpEndpoint, notifications_limit: Option<u32>) -> Result<String, String> {
    match endpoint {
        MpEndpoint::Notifications => {
            let limit = notifications_limit.ok_or_else(|| error::BAD_LIMIT.to_string())?;
            if !(1..=50).contains(&limit) {
                return Err(error::BAD_LIMIT.to_string());
            }
            Ok(format!("{MP_VIEW_ORIGIN}{}?limit={limit}", endpoint.path()))
        }
        _ => {
            if notifications_limit.is_some() {
                return Err(error::UNSUPPORTED_ENDPOINT.to_string());
            }
            Ok(format!("{MP_VIEW_ORIGIN}{}", endpoint.path()))
        }
    }
}

/// Re-check a fully formed URL against the allowlist. Defense in depth: the
/// URL is built by [`mp_view_url`], but the fetch path re-validates so a
/// future refactor cannot bypass the pin by editing one side.
fn is_allowlisted_url(url: &str) -> bool {
    let parsed = match reqwest::Url::parse(url) {
        Ok(parsed) => parsed,
        Err(_) => return false,
    };
    if parsed.scheme() != MP_VIEW_SCHEME || parsed.host_str() != Some(MP_VIEW_HOST) {
        return false;
    }
    if parsed.port_or_known_default() != Some(443) {
        return false;
    }
    match parsed.path() {
        "/api/client-nav" | "/api/game/turn/status" | "/api/game-time" | "/api/auth/session" => {
            !parsed.query().is_some_and(|query| !query.is_empty())
        }
        "/api/notifications" => match parsed.query() {
            Some(query) => {
                let mut pairs = query.split('&');
                match (pairs.next(), pairs.next()) {
                    (Some(pair), None) => {
                        let (key, value) = pair.split_once('=').unwrap_or(("", ""));
                        key == "limit"
                            && value
                                .parse::<u32>()
                                .is_ok_and(|limit| (1..=50).contains(&limit))
                    }
                    _ => false,
                }
            }
            None => false,
        },
        _ => false,
    }
}

fn check_content_type(header: Option<&reqwest::header::HeaderValue>) -> Result<(), String> {
    let value = header
        .and_then(|header| header.to_str().ok())
        .unwrap_or_default();
    if value
        .split(';')
        .next()
        .is_some_and(|mime| mime.trim().eq_ignore_ascii_case("application/json"))
    {
        Ok(())
    } else {
        Err(error::UNEXPECTED_CONTENT.to_string())
    }
}

fn check_body_len(len: usize) -> Result<(), String> {
    if len <= MP_VIEW_MAX_BODY_BYTES {
        Ok(())
    } else {
        Err(error::OVERSIZE_BODY.to_string())
    }
}

fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent(MP_VIEW_USER_AGENT)
            // Never follow redirects: an allowlisted URL must not bounce the
            // relay off-origin, and 3xx bodies are not view data.
            .redirect(reqwest::redirect::Policy::none())
            // No cookie store is enabled (the `cookies` feature is off), so
            // no session material can attach to or leak from these requests.
            .timeout(std::time::Duration::from_secs(MP_VIEW_TIMEOUT_SECS))
            .build()
            .expect("mp view HTTP client must build")
    })
}

/// Fetch one allowlisted read endpoint. Returns the raw JSON body text;
/// validation into view models happens in the TypeScript adapter, which can
/// report per-endpoint `malformed` without losing the other endpoints.
///
/// `remote-error:<status>` preserves the server status so the adapter can
/// distinguish signed-out (401) from a server outage (5xx).
#[tauri::command(rename_all = "camelCase")]
pub async fn mp_view_fetch(
    endpoint_id: String,
    notifications_limit: Option<u32>,
) -> Result<String, String> {
    let endpoint = MpEndpoint::from_id(endpoint_id.trim())
        .ok_or_else(|| error::UNSUPPORTED_ENDPOINT.to_string())?;
    let url = mp_view_url(endpoint, notifications_limit)?;
    debug_assert!(is_allowlisted_url(&url));

    let response = client()
        .get(&url)
        .header(reqwest::header::CACHE_CONTROL, "no-store")
        .send()
        .await
        .map_err(|_| error::NETWORK_UNAVAILABLE.to_string())?;
    if !response.status().is_success() {
        return Err(format!("remote-error:{}", response.status().as_u16()));
    }
    check_content_type(response.headers().get(reqwest::header::CONTENT_TYPE))?;
    let bytes = response
        .bytes()
        .await
        .map_err(|_| error::NETWORK_UNAVAILABLE.to_string())?;
    check_body_len(bytes.len())?;
    String::from_utf8(bytes.to_vec()).map_err(|_| error::UNEXPECTED_CONTENT.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn endpoint_ids_resolve_to_pinned_paths() {
        assert_eq!(
            MpEndpoint::from_id("client-nav"),
            Some(MpEndpoint::ClientNav)
        );
        assert_eq!(
            MpEndpoint::from_id("turn-status"),
            Some(MpEndpoint::TurnStatus)
        );
        assert_eq!(MpEndpoint::from_id("game-time"), Some(MpEndpoint::GameTime));
        assert_eq!(
            MpEndpoint::from_id("auth-session"),
            Some(MpEndpoint::AuthSession)
        );
        assert_eq!(
            MpEndpoint::from_id("notifications"),
            Some(MpEndpoint::Notifications)
        );
        assert_eq!(MpEndpoint::from_id("../admin"), None);
        assert_eq!(MpEndpoint::from_id(""), None);
        assert_eq!(MpEndpoint::from_id("CLIENT-NAV"), None);
    }

    #[test]
    fn public_endpoints_build_bare_pinned_urls() {
        for (id, path) in [
            ("client-nav", "/api/client-nav"),
            ("turn-status", "/api/game/turn/status"),
            ("game-time", "/api/game-time"),
            ("auth-session", "/api/auth/session"),
        ] {
            let endpoint = MpEndpoint::from_id(id).unwrap();
            let url = mp_view_url(endpoint, None).unwrap();
            assert_eq!(url, format!("{MP_VIEW_ORIGIN}{path}"));
            assert!(is_allowlisted_url(&url));
        }
    }

    #[test]
    fn query_text_is_rebuilt_never_forwarded() {
        // A limit on a non-paginated endpoint is rejected outright.
        assert_eq!(
            mp_view_url(MpEndpoint::ClientNav, Some(10)).unwrap_err(),
            error::UNSUPPORTED_ENDPOINT
        );
        // Missing or out-of-range limits fail closed.
        assert_eq!(
            mp_view_url(MpEndpoint::Notifications, None).unwrap_err(),
            error::BAD_LIMIT
        );
        for bad in [0, 51, 500, u32::MAX] {
            assert_eq!(
                mp_view_url(MpEndpoint::Notifications, Some(bad)).unwrap_err(),
                error::BAD_LIMIT,
                "limit {bad} must be rejected"
            );
        }
        let url = mp_view_url(MpEndpoint::Notifications, Some(25)).unwrap();
        assert_eq!(url, format!("{MP_VIEW_ORIGIN}/api/notifications?limit=25"));
        assert!(is_allowlisted_url(&url));
    }

    #[test]
    fn allowlist_rejects_off_origin_and_injected_urls() {
        for denied in [
            "http://ahousedividedgame.com/api/client-nav",
            "https://ahousedividedgame.com:444/api/client-nav",
            "https://evil.com/api/client-nav",
            "https://ahousedividedgame.com.evil.com/api/client-nav",
            "https://ahousedividedgame.com/api/admin/users",
            "https://ahousedividedgame.com/api/client-nav?x=1",
            "https://ahousedividedgame.com/api/notifications",
            "https://ahousedividedgame.com/api/notifications?limit=500",
            "https://ahousedividedgame.com/api/notifications?limit=10&admin=true",
            "https://ahousedividedgame.com/api/notifications?offset=10",
            "https://ahousedividedgame.com/api/notifications?LIMIT=10",
            "https://ahousedividedgame.com/api/character/me",
            "not a url",
        ] {
            assert!(!is_allowlisted_url(denied), "{denied} must be rejected");
        }
    }

    #[test]
    fn body_size_cap_rejects_oversize_payloads() {
        assert!(check_body_len(0).is_ok());
        assert!(check_body_len(MP_VIEW_MAX_BODY_BYTES).is_ok());
        assert_eq!(
            check_body_len(MP_VIEW_MAX_BODY_BYTES + 1).unwrap_err(),
            error::OVERSIZE_BODY
        );
    }

    #[test]
    fn content_type_must_be_json() {
        use reqwest::header::HeaderValue;
        assert!(check_content_type(Some(&HeaderValue::from_static("application/json"))).is_ok());
        assert!(check_content_type(Some(&HeaderValue::from_static(
            "application/json; charset=utf-8"
        )))
        .is_ok());
        for bad in [
            "text/html",
            "text/html; charset=utf-8",
            "application/javascript",
            "",
        ] {
            assert!(
                check_content_type(Some(&HeaderValue::from_str(bad).unwrap())).is_err(),
                "{bad} must be rejected"
            );
        }
        assert_eq!(
            check_content_type(None).unwrap_err(),
            error::UNEXPECTED_CONTENT
        );
    }

    #[test]
    fn relay_wiring_stays_read_only() {
        // Structural guard: this module must never grow methods, cookies, or
        // persistence. If any of these change, the #149 boundary needs review.
        let source = include_str!("mp_view.rs");
        assert!(source.contains("redirect(reqwest::redirect::Policy::none())"));
        // Doc comments may say "cookie" to describe the boundary; what must
        // never appear is handling: a jar/store, a Cookie header, or a token.
        // Tokens are joined so this test itself does not self-match.
        for forbidden in [
            ["cookie", "store"].join("_"),
            ["Cookie", "Store"].join(""),
            [".cookie", ""].join("("),
            ["cookie", ""].join("::"),
            ["SET", "COOKIE"].join("_"),
            ["set", "cookie"].join("-"),
            ["Set", "Cookie"].join("-"),
            ["auth", "token"].join("-"),
            ["Authori", "zation"].join(""),
        ] {
            assert!(
                !source.contains(&forbidden),
                "no cookie handling may be added ({forbidden})"
            );
        }
        // Method and persistence tokens are joined for the same reason.
        for forbidden in [
            [".post", ""].join("("),
            [".put", ""].join("("),
            [".patch", ""].join("("),
            [".delete", ""].join("("),
            ["fs", ""].join("::"),
            ["std", "fs"].join("::"),
        ] {
            assert!(
                !source.contains(&forbidden),
                "relay must stay read-only ({forbidden})"
            );
        }
    }
}
