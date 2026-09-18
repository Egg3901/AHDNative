mod ask;
mod mp_session;
mod mp_view;
mod save_store;

use ask::AskStreamState;
use save_store::{SaveMeta, SaveStore};
use tauri::{Manager, State, Url};
#[cfg(desktop)]
use tauri::{WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_opener::OpenerExt;

const ONLINE_URL: &str = "https://ahousedividedgame.com";

#[cfg(any(mobile, test))]
pub(crate) fn is_account_session_cookie(name: &str) -> bool {
    matches!(
        name,
        "auth-token"
            | "authjs.session-token"
            | "__Secure-authjs.session-token"
            | "next-auth.session-token"
            | "__Secure-next-auth.session-token"
    ) || name.strip_prefix("auth-token-").is_some_and(|suffix| {
        !suffix.is_empty()
            && suffix
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-')
    }) || [
        "authjs.session-token.",
        "__Secure-authjs.session-token.",
        "next-auth.session-token.",
        "__Secure-next-auth.session-token.",
    ]
    .iter()
    .any(|prefix| {
        name.strip_prefix(prefix)
            .is_some_and(|suffix| !suffix.is_empty() && suffix.chars().all(|c| c.is_ascii_digit()))
    })
}

/// Player Q&A service. Desktop opens it in a dedicated zero-capability
/// auth window plus a local panel window; mobile signs in through the main
/// webview itself. Sign-in is automatic for players already signed in
/// anywhere in the app: the Ask bounce reads the existing game session
/// without another password prompt.
pub(crate) const ASK_URL: &str = "https://ask.lakesidegames.net/";
/// Hosts the Ask sign-in bounce may legitimately touch: the Ask service
/// itself, the Lakeside auth broker, the game origins it reads the session
/// from, and the OAuth hosts the game sign-in uses.
const ASK_NAVIGATION_HOSTS: &[&str] = &[
    "ask.lakesidegames.net",
    "auth.ahousedividedgame.com",
    "auth.lakesidegames.net",
    "ahousedividedgame.com",
    "www.ahousedividedgame.com",
    "sandbox.ahousedividedgame.com",
    "discord.com",
    "accounts.google.com",
    "www.google.com",
];

/// The Ask auth surface may stay inside the Ask service, the auth broker
/// and game origins the sign-in bounce touches, and the OAuth hosts the
/// game sign-in uses. Anything else opens in the system browser.
pub(crate) fn is_ask_navigation_allowed(url: &Url) -> bool {
    url.scheme() == "https"
        && url.port_or_known_default() == Some(443)
        && url
            .host_str()
            .is_some_and(|host| ASK_NAVIGATION_HOSTS.contains(&host))
}

fn external_destination_url(destination: &str) -> Result<&'static str, String> {
    // Public routes mirrored from AHDGame HelpDropdown at pinned revision
    // e364c04954ed628beef73a993a8e9e156650a31e.
    match destination {
        "wiki" => Ok("https://wiki.ahousedividedgame.com"),
        "guides" => Ok("https://ahousedividedgame.com/guides"),
        "about" => Ok("https://ahousedividedgame.com/about"),
        "discord" => Ok("https://discord.gg/DmF8zJJuqN"),
        "patreon" => Ok("https://www.patreon.com/cw/AHouseDividedGame/membership"),
        "supporters" => Ok("https://lakesidegames.net/supporters"),
        "email" => Ok("mailto:admin@ahousedividedgame.com"),
        "status" => Ok("https://ops.ahousedividedgame.com/status"),
        _ => Err("unsupported external destination".to_string()),
    }
}

#[tauri::command]
fn open_external_destination(app: tauri::AppHandle, destination: String) -> Result<(), String> {
    app.opener()
        .open_url(external_destination_url(&destination)?, None::<&str>)
        .map_err(|error| error.to_string())
}
#[cfg(desktop)]
const ONLINE_HOST: &str = "ahousedividedgame.com";
#[cfg(desktop)]
const AUXILIARY_ONLINE_HOSTS: &[&str] = &[
    "www.ahousedividedgame.com",
    "discord.com",
    "accounts.google.com",
    "www.google.com",
];

#[cfg(desktop)]
fn is_online_origin(url: &Url) -> bool {
    url.scheme() == "https"
        && url.host_str() == Some(ONLINE_HOST)
        && url.port_or_known_default() == Some(443)
}

#[cfg(desktop)]
pub(crate) fn is_online_navigation_allowed(url: &Url) -> bool {
    let secure_default_port = url.scheme() == "https" && url.port_or_known_default() == Some(443);
    is_online_origin(url)
        || (secure_default_port
            && url
                .host_str()
                .is_some_and(|host| AUXILIARY_ONLINE_HOSTS.contains(&host)))
}

#[cfg(desktop)]
async fn open_mp_auth_window(app: tauri::AppHandle, url: Url) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window("online") {
        existing.navigate(url).map_err(|error| error.to_string())?;
        // A cold-boot restore window is hidden: an explicit provider trip
        // always brings it on screen before focusing it.
        existing.show().map_err(|error| error.to_string())?;
        existing.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }

    let navigation_app = app.clone();
    let new_window_app = app.clone();
    let close_app = app.clone();
    let window = WebviewWindowBuilder::new(&app, "online", WebviewUrl::External(url))
        .title("Sign in to A House Divided")
        .inner_size(1280.0, 800.0)
        .center()
        .resizable(true)
        .on_navigation(move |url| {
            if is_online_navigation_allowed(url) {
                true
            } else {
                let _ = navigation_app
                    .opener()
                    .open_url(url.to_string(), None::<&str>);
                false
            }
        })
        .on_new_window(move |url, _features| {
            let _ = new_window_app
                .opener()
                .open_url(url.to_string(), None::<&str>);
            tauri::webview::NewWindowResponse::Deny
        })
        .build()
        .map_err(|error| error.to_string())?;

    window.on_window_event(move |event| {
        if matches!(
            event,
            WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed
        ) {
            if let Some(main) = close_app.get_webview_window("main") {
                let _ = main.set_focus();
            }
        }
    });
    Ok(())
}

#[tauri::command]
#[cfg(desktop)]
async fn open_mp_sign_in(app: tauri::AppHandle, provider: String) -> Result<(), String> {
    let path = mp_sign_in_path(&provider)?;
    let url: Url = format!("{ONLINE_URL}{path}")
        .parse()
        .map_err(|error| format!("bad multiplayer sign-in URL: {error}"))?;
    open_mp_auth_window(app, url).await
}

/// Mobile multiplayer launcher (#362 return path): the app boot reads
/// `?view=mp` into the MP screen, mirroring the Ask `?view=ask` launcher.
#[cfg(any(mobile, test))]
fn mobile_mp_launcher_url() -> Url {
    let raw = if cfg!(target_os = "android") {
        "http://tauri.localhost/?view=mp"
    } else {
        "tauri://localhost/?view=mp"
    };
    raw.parse().expect("static multiplayer launcher URL")
}

/// Pure stop rule for the mobile sign-in watch below: stop when the session
/// cookie appeared (navigate back to the MP launcher), or when the main view
/// is already back on the app origin (the player returned on their own, so a
/// late navigate must never yank the view).
#[cfg(any(mobile, test))]
fn mp_signin_watch_done(signed_in: bool, on_app_origin: bool) -> bool {
    signed_in || on_app_origin
}

/// End-of-watch decision for the mobile multiplayer sign-in bounce:
/// navigate back to the local MP launcher whenever the only webview is still
/// showing remote content after the watch ends. A linked session lands on
/// the screen (which re-probes); a failed, cancelled, or cookie-invisible
/// callback lands on the sign-in path with retry instead of stranding the
/// player on a dead remote page. Never navigate when the player already
/// came back on their own.
#[cfg(any(mobile, test))]
fn mp_signin_return_home(gave_up: bool, on_app_origin: bool) -> bool {
    gave_up && !on_app_origin
}

/// Whether the main view currently shows app content rather than the borrowed
/// live-site sign-in page. Mirrors the Ask watcher stop condition.
#[cfg(mobile)]
fn main_view_on_app_origin(app: &tauri::AppHandle) -> bool {
    app.get_webview_window("main")
        .and_then(|view| view.url().ok())
        .is_some_and(|current| {
            current.scheme() == "tauri"
                || (current.scheme() == "http" && current.host_str() == Some("tauri.localhost"))
        })
}

#[tauri::command]
#[cfg(mobile)]
async fn open_mp_sign_in(app: tauri::AppHandle, provider: String) -> Result<(), String> {
    let path = mp_sign_in_path(&provider)?;
    let url: Url = format!("{ONLINE_URL}{path}")
        .parse()
        .map_err(|error| format!("bad multiplayer sign-in URL: {error}"))?;
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "main webview is unavailable".to_string())?;
    main.navigate(url).map_err(|error| error.to_string())?;
    std::thread::spawn(move || {
        let mut gave_up = true;
        for _ in 0..600 {
            std::thread::sleep(std::time::Duration::from_secs(1));
            let signed_in = mp_session::has_account_session(&app);
            if !mp_signin_watch_done(signed_in, main_view_on_app_origin(&app)) {
                continue;
            }
            if signed_in {
                if let Some(main) = app.get_webview_window("main") {
                    let _ = main.navigate(mobile_mp_launcher_url());
                }
            }
            gave_up = false;
            break;
        }
        // The bounce ended without a visible session while the only webview
        // still shows remote content: bring it home so the screen re-probes
        // and offers the sign-in path again instead of stranding the player.
        if mp_signin_return_home(gave_up, main_view_on_app_origin(&app)) {
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.navigate(mobile_mp_launcher_url());
            }
        }
    });
    Ok(())
}

fn mp_sign_in_path(provider: &str) -> Result<&'static str, String> {
    match provider {
        "discord" => Ok("/api/auth/discord/login"),
        "google" => Ok("/api/auth/google/login"),
        _ => Err("unsupported sign-in provider".to_string()),
    }
}

#[tauri::command(rename_all = "camelCase")]
async fn save_game(
    slot_id: String,
    contents: String,
    store: State<'_, SaveStore>,
) -> Result<(), String> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || store.save(&slot_id, &contents))
        .await
        .map_err(|err| err.to_string())?
        .map_err(|err| err.to_string())
}

#[tauri::command(rename_all = "camelCase")]
async fn load_game(slot_id: String, store: State<'_, SaveStore>) -> Result<String, String> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || store.load(&slot_id))
        .await
        .map_err(|err| err.to_string())?
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn list_saves(store: State<'_, SaveStore>) -> Result<Vec<SaveMeta>, String> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || store.list())
        .await
        .map_err(|err| err.to_string())?
        .map_err(|err| err.to_string())
}

#[tauri::command(rename_all = "camelCase")]
async fn delete_save(slot_id: String, store: State<'_, SaveStore>) -> Result<(), String> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || store.delete(&slot_id))
        .await
        .map_err(|err| err.to_string())?
        .map_err(|err| err.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let saves_dir = app.path().app_data_dir()?.join("saves");
            app.manage(SaveStore::open(saves_dir)?);
            app.manage(AskStreamState::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_game,
            load_game,
            list_saves,
            delete_save,
            open_mp_sign_in,
            open_external_destination,
            mp_view::mp_view_fetch,
            mp_session::mp_session_fetch,
            mp_session::mp_session_mutate,
            ask::open_ask_window,
            ask::ask_api,
            ask::ask_send,
            ask::ask_stop,
            ask::open_ask_link
        ])
        .run(tauri::generate_context!())
        .expect("failed to run AHDNative");
}

#[cfg(all(test, desktop))]
mod tests {
    use super::{
        external_destination_url, is_account_session_cookie, is_ask_navigation_allowed,
        is_online_navigation_allowed, is_online_origin, mobile_mp_launcher_url, mp_sign_in_path,
        mp_signin_return_home, mp_signin_watch_done, ASK_URL,
    };

    #[test]
    fn mobile_sign_in_returns_to_the_mp_launcher() {
        // The app boot reads `?view=mp` into the MP screen, so the mobile
        // watcher landing here is the reliable return path (#362).
        assert_eq!(
            mobile_mp_launcher_url().to_string(),
            "tauri://localhost/?view=mp"
        );
    }

    #[test]
    fn mobile_sign_in_watcher_stops_once_home_or_signed_in() {
        assert!(mp_signin_watch_done(true, false));
        assert!(mp_signin_watch_done(false, true));
        assert!(mp_signin_watch_done(true, true));
        assert!(!mp_signin_watch_done(false, false));
    }

    #[test]
    fn mobile_sign_in_returns_home_unless_player_came_back() {
        // Linked session (already navigated home in the watch): the tail
        // stays quiet.
        assert!(!mp_signin_return_home(false, false));
        // Failed, cancelled, or cookie-invisible callback with the only
        // webview still on remote content: home so the sign-in path offers
        // retry instead of stranding the player.
        assert!(mp_signin_return_home(true, false));
        // Player came back on their own (or never left): never yank the view.
        assert!(!mp_signin_return_home(false, true));
        assert!(!mp_signin_return_home(true, true));
    }

    #[test]
    fn multiplayer_sign_in_uses_only_native_provider_entrypoints() {
        assert_eq!(
            mp_sign_in_path("discord").unwrap(),
            "/api/auth/discord/login"
        );
        assert_eq!(mp_sign_in_path("google").unwrap(), "/api/auth/google/login");
        assert!(mp_sign_in_path("password").is_err());
        assert!(mp_sign_in_path("https://example.com").is_err());
    }

    #[test]
    fn account_cookie_filter_matches_the_current_client_contract() {
        // Canonical live names: AHDGame `AUTH_COOKIE_NAME` is
        // `auth-token-<railway-tag>` (`computeAuthCookieName` lowercases the
        // service/environment name and collapses non-alphanumerics to single
        // dashes, falling back to `local`), and `/api/client/account` still
        // bridges the historic literal `auth-token`. Auth.js-era session
        // names (plain and sharded) stay recognized for older profiles.
        for recognized in [
            "auth-token",
            "auth-token-production",
            "auth-token-staging",
            "auth-token-local",
            "auth-token-ahd-game-prod",
            "auth-token-123",
            "authjs.session-token",
            "__Secure-authjs.session-token",
            "__Secure-authjs.session-token.0",
            "next-auth.session-token",
            "__Secure-next-auth.session-token.2",
        ] {
            assert!(
                is_account_session_cookie(recognized),
                "{recognized} must be recognized"
            );
        }
        // Transient OAuth flow cookies (`discord/google_oauth_state|mode`,
        // return-url cookies), the analytics cookie, the character-gate
        // cookie, and the Ask service cookie are never account sessions:
        // recognizing one would attach the wrong material to live-site calls.
        for rejected in [
            "ask_session",
            "__Host-ask_session",
            "auth-token-",
            "discord_oauth_state",
            "discord_oauth_mode",
            "google_oauth_state",
            "google_oauth_mode",
            "__ahd_track",
            "ahd-needs-character",
            "__Secure-authjs.session-token.x",
        ] {
            assert!(
                !is_account_session_cookie(rejected),
                "{rejected} must not be recognized"
            );
        }
    }

    #[test]
    fn ios_top_inset_fallback_needs_no_native_command() {
        // #436 WKWebView failure: internal iOS 0.1.8 resolved the top
        // inset env() to zero, so headings rendered under the status bar.
        // There is deliberately no dedicated native view-inset command:
        // the web-measured probe plus fail-safe floor in
        // src/ui/iosSafeArea.ts is the chosen source because it reads the
        // synchronous CSS truth the floor guards. (A native-derived value
        // is reachable without new dependencies through the locked window
        // position APIs, but that path is async and main-thread-bound, so
        // it stays a possible follow-up, not the floor source.) This test
        // pins that no native view-inset command exists, so adding one is
        // a deliberate contract change.
        // (Tokens are joined so this test never self-matches.)
        let source = include_str!("lib.rs");
        for banned in [
            ["safe_", "area_insets"].join(""),
            ["safe", "AreaInsets"].join(""),
            ["safe", "-area"].join(""),
        ] {
            assert!(
                !source.contains(&banned),
                "native side must not grow a {banned} command without a contract change"
            );
        }
        let capability = include_str!("../capabilities/default.json");
        assert!(
            !capability.contains(&["safe", "-area"].join("")),
            "main capability must not grant view-inset permissions"
        );
    }

    #[test]
    fn online_window_keeps_the_persistent_platform_profile() {
        // Session persistence across full process relaunches (#149): the
        // online window must use the platform's normal persistent
        // cookie/storage jar, which is the Tauri default — the same default
        // AHDClient's `open_online_window` documents (WebView2 user data
        // folder / WKWebView default store / WebKitGTK profile). Building
        // the window incognito would silently discard the account session on
        // every quit. The token is joined so this test never self-matches.
        let source = include_str!("lib.rs");
        let incognito = [".incognito", "("].join("");
        assert!(
            !source.contains(&incognito),
            "the online window must never be built incognito"
        );
    }
    use tauri::Url;

    #[test]
    fn online_origin_requires_exact_https_default_port() {
        assert!(is_online_origin(
            &"https://ahousedividedgame.com/play".parse().unwrap()
        ));
        assert!(!is_online_origin(
            &"http://ahousedividedgame.com/play".parse().unwrap()
        ));
        assert!(!is_online_origin(
            &"https://ahousedividedgame.com:444/play".parse().unwrap()
        ));
        assert!(!is_online_origin(
            &"https://accounts.ahousedividedgame.com/".parse().unwrap()
        ));
    }

    #[test]
    fn external_destinations_are_allowlisted_by_identifier() {
        // Centralized reachability gate for issue #82: every public
        // destination mirrored from AHDGame HelpDropdown at pinned revision
        // e364c049 must resolve to its exact reference URL. Raw URLs and
        // unknown identifiers never open.
        for (destination, url) in [
            ("wiki", "https://wiki.ahousedividedgame.com"),
            ("guides", "https://ahousedividedgame.com/guides"),
            ("about", "https://ahousedividedgame.com/about"),
            ("discord", "https://discord.gg/DmF8zJJuqN"),
            (
                "patreon",
                "https://www.patreon.com/cw/AHouseDividedGame/membership",
            ),
            ("supporters", "https://lakesidegames.net/supporters"),
            ("email", "mailto:admin@ahousedividedgame.com"),
            ("status", "https://ops.ahousedividedgame.com/status"),
        ] {
            assert_eq!(external_destination_url(destination).unwrap(), url);
        }
        assert!(external_destination_url("https://example.com").is_err());
        assert!(external_destination_url("feedback").is_err());
        assert!(external_destination_url("account").is_err());
    }

    #[test]
    fn online_navigation_allows_only_required_auth_hosts() {
        for allowed in [
            "https://www.ahousedividedgame.com/api/auth/callback/discord",
            "https://discord.com/oauth2/authorize",
            "https://accounts.google.com/o/oauth2/v2/auth",
            "https://www.google.com/",
        ] {
            assert!(is_online_navigation_allowed(
                &allowed.parse::<Url>().unwrap()
            ));
        }
        for denied in [
            "http://discord.com/oauth2/authorize",
            "https://login.discord.com/",
            "https://accounts.google.com:444/",
            "https://example.com/",
        ] {
            assert!(!is_online_navigation_allowed(
                &denied.parse::<Url>().unwrap()
            ));
        }
    }

    #[test]
    fn ask_navigation_keeps_the_sign_in_bounce_inside_the_app() {
        let service: Url = ASK_URL.parse().unwrap();
        let broker: Url = "https://auth.ahousedividedgame.com/auth/ahd"
            .parse()
            .unwrap();
        let game: Url = "https://ahousedividedgame.com/api/client/account"
            .parse()
            .unwrap();
        let discord: Url = "https://discord.com/oauth2/authorize".parse().unwrap();
        let google: Url = "https://accounts.google.com/o/oauth2/v2/auth"
            .parse()
            .unwrap();
        for allowed in [&service, &broker, &game, &discord, &google] {
            assert!(
                is_ask_navigation_allowed(allowed),
                "{allowed} should stay in-app"
            );
        }
        for denied in [
            "http://ask.lakesidegames.net/",
            "https://ask.lakesidegames.net:444/",
            "https://ask.evil.example.com/",
            "https://ask-lakesidegames-net.example.com/",
            "https://example.com/",
        ] {
            assert!(
                !is_ask_navigation_allowed(&denied.parse::<Url>().unwrap()),
                "{denied} should leave the app"
            );
        }
    }
}

#[cfg(test)]
mod capability_tests {
    #[test]
    fn main_capability_keeps_offline_save_commands_available() {
        let capability = include_str!("../capabilities/default.json");
        for permission in [
            "allow-save-game",
            "allow-load-game",
            "allow-list-saves",
            "allow-delete-save",
        ] {
            assert!(
                capability.contains(permission),
                "main capability must include {permission}"
            );
        }
    }

    #[test]
    fn main_capability_reaches_the_ask_backend_without_remote_privileges() {
        let capability = include_str!("../capabilities/default.json");
        for permission in [
            "allow-open-ask-window",
            "allow-ask-api",
            "allow-ask-send",
            "allow-ask-stop",
            "allow-open-ask-link",
        ] {
            assert!(
                capability.contains(permission),
                "main capability must include {permission}"
            );
        }
        // The main window gains no filesystem, shell, dialog, or updater
        // access for Ask: answers arrive through the Rust proxy only.
        for forbidden in ["fs:", "shell:", "dialog:", "updater:"] {
            assert!(
                !capability.contains(forbidden),
                "main capability must not grant {forbidden}"
            );
        }
    }

    #[test]
    fn ask_panel_capability_is_local_ui_with_backend_commands_only() {
        let capability = include_str!("../capabilities/ask.json");
        for permission in ["allow-ask-api", "allow-ask-send", "allow-ask-stop"] {
            assert!(
                capability.contains(permission),
                "ask capability must include {permission}"
            );
        }
        assert!(!capability.contains("\"remote\""));
        for forbidden in [
            "fs:",
            "shell:",
            "dialog:",
            "updater:",
            "allow-open-ask-link",
        ] {
            assert!(
                !capability.contains(forbidden),
                "ask capability must not grant {forbidden}"
            );
        }
    }

    #[test]
    fn ask_auth_capability_stays_zero_capability() {
        let capability = include_str!("../capabilities/ask-auth.json");
        assert!(capability.contains("\"permissions\": []"));
        assert!(capability.contains("ask-auth"));
    }

    #[test]
    fn remote_views_keep_zero_native_capability() {
        let capability = include_str!("../capabilities/default.json");
        assert!(
            !capability.contains("\"online\""),
            "no capability may target the remote online window"
        );
        for permission in ["allow-mp-session-fetch", "allow-mp-session-mutate"] {
            assert!(
                capability.contains(permission),
                "main capability must include {permission}"
            );
        }
    }
}
