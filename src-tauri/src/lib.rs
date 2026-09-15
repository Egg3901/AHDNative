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
fn is_online_navigation_allowed(url: &Url) -> bool {
    let secure_default_port = url.scheme() == "https" && url.port_or_known_default() == Some(443);
    is_online_origin(url)
        || (secure_default_port
            && url
                .host_str()
                .is_some_and(|host| AUXILIARY_ONLINE_HOSTS.contains(&host)))
}

#[tauri::command]
#[cfg(desktop)]
async fn open_online_window(app: tauri::AppHandle) -> Result<(), String> {
    let url: Url = ONLINE_URL
        .parse()
        .map_err(|error| format!("bad online URL: {error}"))?;

    if let Some(existing) = app.get_webview_window("online") {
        existing.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }

    let navigation_app = app.clone();
    let new_window_app = app.clone();
    let close_app = app.clone();
    let window = WebviewWindowBuilder::new(&app, "online", WebviewUrl::External(url))
        .title("A House Divided: Multiplayer")
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
#[cfg(mobile)]
fn open_online_window(app: tauri::AppHandle) -> Result<(), String> {
    let url: Url = ONLINE_URL
        .parse()
        .map_err(|error| format!("bad online URL: {error}"))?;
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "main webview is unavailable".to_string())?;
    main.navigate(url).map_err(|error| error.to_string())
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
            open_online_window,
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
        external_destination_url, is_ask_navigation_allowed, is_online_navigation_allowed,
        is_online_origin, ASK_URL,
    };
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
        assert_eq!(
            external_destination_url("guides").unwrap(),
            "https://ahousedividedgame.com/guides"
        );
        assert_eq!(
            external_destination_url("wiki").unwrap(),
            "https://wiki.ahousedividedgame.com"
        );
        assert!(external_destination_url("https://example.com").is_err());
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

    #[test]
    fn reopening_the_online_window_preserves_the_existing_session_view() {
        let source = include_str!("lib.rs");
        let existing_window_branch = source
            .split_once("if let Some(existing) = app.get_webview_window(\"online\") {")
            .and_then(|(_, rest)| rest.split_once("return Ok(())"))
            .map(|(branch, _)| branch)
            .expect("online window reuse branch should exist");

        assert!(existing_window_branch.contains("existing.set_focus()"));
        assert!(!existing_window_branch.contains("existing.navigate("));
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
