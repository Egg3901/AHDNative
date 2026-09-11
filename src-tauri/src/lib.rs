mod save_store;

use save_store::{SaveMeta, SaveStore};
use tauri::{Manager, State, Url};
#[cfg(desktop)]
use tauri::{WebviewUrl, WebviewWindowBuilder, WindowEvent};
#[cfg(desktop)]
use tauri_plugin_opener::OpenerExt;

const ONLINE_URL: &str = "https://ahousedividedgame.com";
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

#[cfg(desktop)]
#[derive(Debug, PartialEq, Eq)]
enum OnlineNavigationAction {
    InApp,
    External,
}

#[cfg(desktop)]
fn online_navigation_action(url: &Url) -> OnlineNavigationAction {
    if is_online_navigation_allowed(url) {
        OnlineNavigationAction::InApp
    } else {
        OnlineNavigationAction::External
    }
}

#[cfg(desktop)]
fn online_new_window_action(_url: &Url) -> OnlineNavigationAction {
    OnlineNavigationAction::External
}

#[tauri::command]
#[cfg(desktop)]
async fn open_online_window(app: tauri::AppHandle) -> Result<(), String> {
    let url: Url = ONLINE_URL
        .parse()
        .map_err(|error| format!("bad online URL: {error}"))?;

    if let Some(existing) = app.get_webview_window("online") {
        existing.navigate(url).map_err(|error| error.to_string())?;
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
        .on_navigation(move |url| match online_navigation_action(url) {
            OnlineNavigationAction::InApp => true,
            OnlineNavigationAction::External => {
                let _ = navigation_app
                    .opener()
                    .open_url(url.to_string(), None::<&str>);
                false
            }
        })
        .on_new_window(move |url, _features| {
            if online_new_window_action(&url) == OnlineNavigationAction::External {
                let _ = new_window_app
                    .opener()
                    .open_url(url.to_string(), None::<&str>);
            }
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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_game,
            load_game,
            list_saves,
            delete_save,
            open_online_window
        ])
        .run(tauri::generate_context!())
        .expect("failed to run AHDNative");
}

#[cfg(all(test, desktop))]
mod tests {
    use super::{
        is_online_navigation_allowed, is_online_origin, online_navigation_action,
        online_new_window_action, OnlineNavigationAction,
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
    fn navigation_decision_routes_only_the_allowlist_in_app() {
        for target in [
            "https://ahousedividedgame.com/play",
            "https://ahousedividedgame.com:443/play",
            "https://discord.com/oauth2/authorize",
        ] {
            assert_eq!(
                online_navigation_action(&target.parse().unwrap()),
                OnlineNavigationAction::InApp
            );
        }

        for target in [
            "https://example.com/",
            "https://discord.com.evil.example/",
            "https://ahousedividedgame.com.evil.example/",
            "https://ahousedividedgame.com@evil.example/",
            "http://ahousedividedgame.com/",
            "https://ahousedividedgame.com:8443/",
        ] {
            assert_eq!(
                online_navigation_action(&target.parse().unwrap()),
                OnlineNavigationAction::External
            );
        }
    }

    #[test]
    fn every_online_new_window_is_denied_and_routed_external() {
        for target in [
            "https://ahousedividedgame.com/play",
            "https://discord.com/oauth2/authorize",
            "https://example.com/",
            "http://ahousedividedgame.com/",
        ] {
            let url = target.parse::<Url>().unwrap();
            assert_eq!(
                online_new_window_action(&url),
                OnlineNavigationAction::External
            );
        }
    }

    #[test]
    fn remote_window_has_no_native_capabilities() {
        let online: serde_json::Value =
            serde_json::from_str(include_str!("../capabilities/online.json")).unwrap();
        let local: serde_json::Value =
            serde_json::from_str(include_str!("../capabilities/default.json")).unwrap();

        assert_eq!(online["windows"], serde_json::json!(["online"]));
        assert_eq!(online["permissions"], serde_json::json!([]));
        assert!(online.get("remote").is_none());
        assert_eq!(local["windows"], serde_json::json!(["main"]));
        assert!(!local["windows"]
            .as_array()
            .unwrap()
            .iter()
            .any(|label| label == "online"));
        assert!(local.get("remote").is_none());
    }
}
