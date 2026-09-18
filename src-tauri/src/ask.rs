//! Native Ask panel backend (cross-platform).
//!
//! Behavioral reference: AHDClient native Ask at merged revision 370c150
//! (`apps/desktop/src-tauri/src/ask.rs`, `apps/desktop/src/ask/`). The Ask
//! service (ask.lakesidegames.net) has no CORS headers and its session
//! cookie is SameSite=Lax, so the app webview cannot call it with fetch. All
//! Ask traffic therefore goes through these Rust commands, which read the
//! session cookie out of the shared platform cookie jar (the same jar the
//! sign-in flow writes) and attach it as a plain Cookie header — browsers
//! enforce CORS and SameSite, ureq does not.
//!
//! Two surfaces share this backend:
//! - Desktop opens a dedicated `ask` window: a local view
//!   (`index.html?view=ask`) with the same invoke surface as the main
//!   window. Resumed in place, never re-navigated. Signed-out players get a
//!   transient zero-capability `ask-auth` webview for the one-time sign-in
//!   bounce; a watcher closes it the moment the session cookie lands.
//! - Mobile (single webview) renders the same local panel in place. The
//!   signed-out `open_ask_window` call navigates the main webview to the Ask
//!   service for the sign-in bounce — remote pages in that webview receive
//!   no Tauri IPC — and a watcher brings the launcher back once the session
//!   lands, or when the bounce ends with the webview still on remote content
//!   (failure, cancellation, or an unreadable callback cookie), so the panel
//!   re-probes and offers retry instead of stranding the player. The offline
//!   game itself is untouched by any of this.
//!
//! Raw cookies never cross IPC and are never persisted: the session value
//! stays inside Rust and is attached server-side of the webview boundary.

use std::collections::HashMap;
use std::io::BufRead;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State, Url};
#[cfg(desktop)]
use tauri::{WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_opener::OpenerExt;

/// ask.lakesidegames.net session cookie. Mirrors `COOKIE` in the Ask
/// service's auth module.
const ASK_SESSION_COOKIES: &[&str] = &["__Host-ask_session", "ask_session"];
const ASK_NATIVE_AUTH_URL: &str = "https://auth.ahousedividedgame.com/auth/ahd?return=https%3A%2F%2Fask.lakesidegames.net%2Fauth%2Fnative%2Fcallback";

fn is_ask_session_cookie(name: &str) -> bool {
    ASK_SESSION_COOKIES.contains(&name)
}

/// Choose the session value to attach when the jar holds several cookies.
/// `__Host-ask_session` is the current contract; the legacy name stays for
/// compatibility but must never shadow it — a stale legacy value would ride
/// on every proxied call and read as signed out with the account linked.
fn select_ask_session_cookie(cookies: &[(&str, &str)]) -> Option<String> {
    cookies
        .iter()
        .find(|(name, value)| *name == "__Host-ask_session" && !value.is_empty())
        .or_else(|| {
            cookies
                .iter()
                .find(|(name, value)| *name == "ask_session" && !value.is_empty())
        })
        .map(|(name, value)| format!("{name}={value}"))
}

fn ask_auth_url() -> Url {
    ASK_NATIVE_AUTH_URL.parse().expect("static Ask auth URL")
}

/// Ask panel size in logical pixels (desktop): a narrow panel that sits
/// beside the game rather than covering it.
#[cfg(desktop)]
const ASK_WINDOW_WIDTH: f64 = 440.0;
#[cfg(desktop)]
const ASK_WINDOW_HEIGHT: f64 = 800.0;

/// How long the sign-in watcher waits for the session cookie before giving
/// up and leaving the auth surface alone: 150 polls, two seconds apart.
const AUTH_WATCH_POLLS: u32 = 150;
const AUTH_WATCH_INTERVAL: Duration = Duration::from_secs(2);

/// Read the Ask session out of the shared platform cookie jar. Platform
/// webviews share one jar, so try the freshest surface first.
fn ask_session_cookie(app: &AppHandle) -> Option<String> {
    let url: Url = crate::ASK_URL.parse().ok()?;
    for label in ["ask-auth", "main", "online", "ask"] {
        let Some(view) = app.get_webview_window(label) else {
            continue;
        };
        let Ok(cookies) = view.cookies_for_url(url.clone()) else {
            continue;
        };
        let pairs: Vec<(&str, &str)> = cookies
            .iter()
            .filter(|cookie| is_ask_session_cookie(cookie.name()))
            .map(|cookie| (cookie.name(), cookie.value()))
            .collect();
        if let Some(header) = select_ask_session_cookie(&pairs) {
            return Some(header);
        }
    }
    None
}

/// Exact routes the native UI may call, with their methods. Everything else
/// is refused client-side; the question stream has its own command.
fn ask_api_allowed(method: &str, path: &str) -> bool {
    let route = path.split(['?', '#']).next().unwrap_or("");
    matches!(
        (method, route),
        ("GET", "/api/me")
            | ("GET", "/api/conversations")
            | ("GET", "/api/conversation")
            | ("POST", "/api/ask/stop")
            | ("POST", "/api/map/render")
    )
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AskApiResult {
    status: u16,
    body: String,
}

/// Proxied Ask API call. HTTP statuses pass through untouched (401 means
/// signed out, 429 means quota spent) so the UI can react exactly like the
/// web client; only transport failures and a missing session are errors.
#[tauri::command]
pub(crate) async fn ask_api(
    app: AppHandle,
    method: String,
    path: String,
    body: Option<String>,
) -> Result<AskApiResult, String> {
    if !ask_api_allowed(&method, &path) {
        return Err("unsupported Ask request".into());
    }
    let session = ask_session_cookie(&app).ok_or("Please sign in to Ask first.")?;
    let url = format!("{}{}", crate::ASK_URL.trim_end_matches('/'), path);
    tauri::async_runtime::spawn_blocking(move || {
        let agent = ureq::AgentBuilder::new()
            .timeout(Duration::from_secs(90))
            .build();
        let mut request = match method.as_str() {
            "GET" => agent.get(&url),
            "POST" => agent.post(&url),
            _ => return Err("unsupported Ask request".to_string()),
        };
        request = request
            .set("Cookie", &session)
            .set("Content-Type", "application/json")
            .set(
                "User-Agent",
                concat!("AHDNative/", env!("CARGO_PKG_VERSION")),
            );
        let response = match body {
            Some(payload) => request.send_string(&payload),
            None => request.call(),
        };
        match response {
            Ok(ok) => {
                let status = ok.status();
                let text = ok
                    .into_string()
                    .map_err(|_| "cannot read Ask response".to_string())?;
                Ok(AskApiResult { status, body: text })
            }
            Err(ureq::Error::Status(code, failed)) => {
                let text = failed.into_string().unwrap_or_default();
                Ok(AskApiResult {
                    status: code,
                    body: text,
                })
            }
            Err(_) => Err("Cannot reach Ask. Connect to the internet and try again.".into()),
        }
    })
    .await
    .map_err(|_| "Ask request failed".to_string())?
}

/// One entry per in-flight question so Stop can kill the pump thread. The
/// server-side generation is cancelled separately through /api/ask/stop.
#[derive(Default)]
pub(crate) struct AskStreamState(Mutex<HashMap<String, Arc<AtomicBool>>>);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AskStreamEvent {
    req_id: String,
    kind: String,
    data: serde_json::Value,
}

fn emit_stream(app: &AppHandle, req_id: &str, kind: &str, data: serde_json::Value) {
    // Global broadcast: only the ask surfaces listen for this event.
    let _ = app.emit(
        "ask-stream",
        AskStreamEvent {
            req_id: req_id.to_string(),
            kind: kind.to_string(),
            data,
        },
    );
}

fn forget_stream(app: &AppHandle, req_id: &str) {
    if let Ok(mut inflight) = app.state::<AskStreamState>().0.lock() {
        inflight.remove(req_id);
    }
}

/// Start a question. Returns a client request id immediately; answer events
/// arrive on the `ask-stream` window event: `meta`, `status`, `action`,
/// `delta`, `done`, `final` (non-streaming JSON reply: cache hit, quota
/// refusal), `error`, `stopped`.
#[tauri::command]
pub(crate) async fn ask_send(
    app: AppHandle,
    state: State<'_, AskStreamState>,
    question: String,
    conv_id: Option<String>,
    use_mcp: bool,
) -> Result<String, String> {
    if question.trim().len() < 5 {
        return Err("Please ask a slightly longer question.".into());
    }
    let session = ask_session_cookie(&app).ok_or("Please sign in to Ask first.")?;
    let mut entropy = [0_u8; 9];
    getrandom::getrandom(&mut entropy)
        .map_err(|_| "secure random source unavailable".to_string())?;
    let req_id = entropy
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();
    let stop = Arc::new(AtomicBool::new(false));
    state
        .0
        .lock()
        .map_err(|_| "Ask state poisoned".to_string())?
        .insert(req_id.clone(), stop.clone());
    let pump_app = app.clone();
    let pump_req_id = req_id.clone();
    tauri::async_runtime::spawn_blocking(move || {
        pump_ask_stream(
            &pump_app,
            &pump_req_id,
            stop,
            session,
            question,
            conv_id,
            use_mcp,
        );
    });
    Ok(req_id)
}

/// Stop a question: halt the local pump and tell the server to abort the
/// generation, which records nothing and costs no quota.
#[tauri::command]
pub(crate) async fn ask_stop(
    app: AppHandle,
    state: State<'_, AskStreamState>,
    req_id: String,
) -> Result<(), String> {
    if let Ok(guard) = state.0.lock() {
        if let Some(stop) = guard.get(&req_id) {
            stop.store(true, Ordering::SeqCst);
        }
    }
    if let Some(session) = ask_session_cookie(&app) {
        let url = format!("{}/api/ask/stop", crate::ASK_URL.trim_end_matches('/'));
        let payload = serde_json::json!({ "reqId": req_id }).to_string();
        tauri::async_runtime::spawn_blocking(move || {
            let agent = ureq::AgentBuilder::new()
                .timeout(Duration::from_secs(15))
                .build();
            let _ = agent
                .post(&url)
                .set("Cookie", &session)
                .set("Content-Type", "application/json")
                .send_string(&payload);
        });
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn pump_ask_stream(
    app: &AppHandle,
    req_id: &str,
    stop: Arc<AtomicBool>,
    session: String,
    question: String,
    conv_id: Option<String>,
    use_mcp: bool,
) {
    let finish = |kind: &str, data: serde_json::Value| {
        emit_stream(app, req_id, kind, data);
    };
    let url = format!("{}/api/ask", crate::ASK_URL.trim_end_matches('/'));
    let payload = serde_json::json!({
        "question": question,
        "convId": conv_id,
        "useMcp": use_mcp,
        // The service validates this against its zone database and drops anything
        // else, so an empty value simply falls back to UTC.
        "tz": "",
    })
    .to_string();

    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(600))
        .build();
    let response = agent
        .post(&url)
        .set("Cookie", &session)
        .set("Content-Type", "application/json")
        .set(
            "User-Agent",
            concat!("AHDNative/", env!("CARGO_PKG_VERSION")),
        )
        .send_string(&payload);
    let response = match response {
        Ok(ok) => ok,
        Err(ureq::Error::Status(code, failed)) => {
            let text = failed.into_string().unwrap_or_default();
            finish("final", serde_json::json!({ "status": code, "body": text }));
            forget_stream(app, req_id);
            return;
        }
        Err(_) => {
            finish(
                "error",
                serde_json::json!({ "error": "Cannot reach Ask. Connect to the internet and try again." }),
            );
            forget_stream(app, req_id);
            return;
        }
    };

    let streaming = response
        .header("Content-Type")
        .is_some_and(|content| content.contains("text/event-stream"));
    if !streaming {
        let status = response.status();
        let text = response.into_string().unwrap_or_default();
        finish(
            "final",
            serde_json::json!({ "status": status, "body": text }),
        );
        forget_stream(app, req_id);
        return;
    }

    let reader = std::io::BufReader::new(response.into_reader());
    let mut parser = SseParser::default();
    let mut terminal = false;
    for line in reader.lines() {
        if stop.load(Ordering::SeqCst) {
            finish("stopped", serde_json::Value::Null);
            terminal = true;
            break;
        }
        let line = match line {
            Ok(text) => text,
            Err(_) => break,
        };
        if let Some((kind, data)) = parser.push_line(&line) {
            if kind == "done" || kind == "error" {
                terminal = true;
            }
            finish(&kind, data);
            if terminal {
                break;
            }
        }
    }
    if !terminal && !stop.load(Ordering::SeqCst) {
        finish(
            "error",
            serde_json::json!({ "error": "The answer stream ended before completion. It may still be saved — check your history in a moment, or try again." }),
        );
    }
    forget_stream(app, req_id);
}

/// Open an Ask citation link in the system browser. Only plain web URLs
/// leave the app; anything else (custom schemes, scripts, files) is refused
/// so remote answer content can never trigger local handling.
#[tauri::command]
pub(crate) async fn open_ask_link(app: AppHandle, url: String) -> Result<(), String> {
    let parsed: Url = url
        .parse()
        .map_err(|_| "unsupported Ask link".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("unsupported Ask link".to_string());
    }
    if parsed.host_str().map_or(true, |host| host.is_empty()) {
        return Err("unsupported Ask link".to_string());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|error| error.to_string())
}

/// Top-left origin that docks the Ask panel against the right edge of the
/// primary monitor, vertically centered. Pure so it can be unit-tested;
/// inputs are physical pixels except `scale`.
#[cfg(desktop)]
pub(crate) fn ask_dock_origin(monitor_width: u32, monitor_height: u32, scale: f64) -> (i32, i32) {
    let width = (ASK_WINDOW_WIDTH * scale) as u32;
    let height = (ASK_WINDOW_HEIGHT * scale) as u32;
    let margin = (12.0 * scale) as u32;
    let x = monitor_width.saturating_sub(width).saturating_sub(margin) as i32;
    let y = monitor_height.saturating_sub(height) as i32 / 2;
    (x.max(0), y.max(0))
}

/// Logical-pixel form of [`ask_dock_origin`] for
/// `WebviewWindowBuilder::position`, which takes logical coordinates.
#[cfg(desktop)]
pub(crate) fn ask_dock_logical(monitor_width: u32, monitor_height: u32, scale: f64) -> (f64, f64) {
    let (x, y) = ask_dock_origin(monitor_width, monitor_height, scale);
    (f64::from(x) / scale, f64::from(y) / scale)
}

/// Whether the main view currently shows app content rather than the borrowed
/// live-site sign-in page. Mirrors the multiplayer watcher stop condition.
#[cfg(mobile)]
fn main_view_on_app_origin(app: &AppHandle) -> bool {
    app.get_webview_window("main")
        .and_then(|view| view.url().ok())
        .is_some_and(|current| {
            current.scheme() == "tauri"
                || (current.scheme() == "http" && current.host_str() == Some("tauri.localhost"))
        })
}

/// One poll step of the mobile sign-in watch: stop when the session cookie
/// appeared or when the main view is already back on the app origin (the
/// player returned on their own, so a late navigate must never yank the view).
#[cfg(any(mobile, test))]
fn ask_signin_watch_done(signed_in: bool, on_app_origin: bool) -> bool {
    signed_in || on_app_origin
}

/// End-of-watch decision for the mobile Ask sign-in bounce: navigate back
/// to the local launcher whenever the only webview is still showing remote
/// content after the watch ends. A linked session lands on the panel (which
/// re-probes); a failed, cancelled, or cookie-invisible callback lands on
/// the signed-out panel with retry instead of stranding the player on a
/// dead remote page. Never navigate when the player already came back on
/// their own.
#[cfg(any(mobile, test))]
fn ask_signin_return_home(gave_up: bool, on_app_origin: bool) -> bool {
    gave_up && !on_app_origin
}

/// Single-flight claim for the mobile Ask sign-in watch: the link action
/// borrows the only webview, so concurrent taps must open one bounce. The
/// TypeScript guard evaporates when the bounce navigates the webview away
/// (the JS context is destroyed), so the claim lives here and survives the
/// bounce. A refused claim means an earlier bounce already watches the
/// single webview, and the late tap just joins it. Mirrors the multiplayer
/// `mp_signin_watch_claim` twin in `lib.rs`.
#[cfg(any(mobile, test))]
fn ask_signin_watch_claim(active: &AtomicBool) -> bool {
    active
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_ok()
}

/// Release a watch claim; the watcher calls this once on every exit path.
/// A stuck claim would wedge Sign in (later taps join a dead watch), so
/// each early error return releases before reporting the failure.
#[cfg(any(mobile, test))]
fn ask_signin_watch_release(active: &AtomicBool) {
    active.store(false, Ordering::Release);
}

/// At most one mobile Ask watch runs at a time (see
/// [`ask_signin_watch_claim`]).
#[cfg(mobile)]
static ASK_SIGNIN_WATCH_ACTIVE: AtomicBool = AtomicBool::new(false);

/// Open the native Ask sign-in surface. Desktop focuses the local panel when
/// a session already exists and otherwise opens the zero-capability auth
/// window, which closes itself the moment the session lands. Mobile has a
/// single webview, so the main view itself visits the Ask sign-in bounce —
/// remote content there receives no Tauri IPC — and a watcher brings the
/// launcher back once the session lands.
#[tauri::command]
#[cfg(desktop)]
pub(crate) async fn open_ask_window(app: AppHandle) -> Result<(), String> {
    if ask_session_cookie(&app).is_some() {
        return focus_ask_ui(&app);
    }
    // No session: the UI (if open) stays where it is and will re-probe on
    // focus; the auth window does the sign-in work.
    open_ask_auth(&app)?;
    let watch_app = app.clone();
    // A blocking sleeper, not an async task: the watch is rare (once per
    // install, effectively) and this avoids depending on the async runtime's
    // timer facilities from a desktop-only module.
    std::thread::spawn(move || {
        for _ in 0..AUTH_WATCH_POLLS {
            std::thread::sleep(AUTH_WATCH_INTERVAL);
            let auth_open = watch_app.get_webview_window("ask-auth").is_some();
            if !auth_open {
                break;
            }
            if ask_session_cookie(&watch_app).is_some() {
                if let Some(auth) = watch_app.get_webview_window("ask-auth") {
                    let _ = auth.close();
                }
                let _ = focus_ask_ui(&watch_app);
                break;
            }
        }
    });
    Ok(())
}

#[tauri::command]
#[cfg(mobile)]
pub(crate) async fn open_ask_window(app: AppHandle) -> Result<(), String> {
    if ask_session_cookie(&app).is_some() {
        return Ok(());
    }
    // Single-flight: an earlier bounce already watches the single webview,
    // so a concurrent tap joins it instead of racing a second navigate.
    // Mirrors the multiplayer twin in `lib.rs`.
    if !ask_signin_watch_claim(&ASK_SIGNIN_WATCH_ACTIVE) {
        return Ok(());
    }
    let url = ask_auth_url();
    let Some(main) = app.get_webview_window("main") else {
        ask_signin_watch_release(&ASK_SIGNIN_WATCH_ACTIVE);
        return Err("main webview is unavailable".to_string());
    };
    if let Err(error) = main.navigate(url) {
        ask_signin_watch_release(&ASK_SIGNIN_WATCH_ACTIVE);
        return Err(error.to_string());
    }
    let watch_app = app.clone();
    std::thread::spawn(move || {
        let mut gave_up = true;
        for _ in 0..AUTH_WATCH_POLLS {
            std::thread::sleep(AUTH_WATCH_INTERVAL);
            let signed_in = ask_session_cookie(&watch_app).is_some();
            // The player went back on their own; stop watching.
            if !ask_signin_watch_done(signed_in, main_view_on_app_origin(&watch_app)) {
                continue;
            }
            if signed_in {
                if let Some(main) = watch_app.get_webview_window("main") {
                    let _ = main.navigate(mobile_launcher_home());
                }
            }
            gave_up = false;
            break;
        }
        // The bounce ended without a visible session while the only webview
        // still shows remote content: bring it home so the panel re-probes
        // and offers retry instead of stranding the player on a dead page.
        if ask_signin_return_home(gave_up, main_view_on_app_origin(&watch_app)) {
            if let Some(main) = watch_app.get_webview_window("main") {
                let _ = main.navigate(mobile_launcher_home());
            }
        }
        ask_signin_watch_release(&ASK_SIGNIN_WATCH_ACTIVE);
    });
    Ok(())
}

/// Where the mobile launcher lives once the webview is up. Matches the
/// platform webview origin: `tauri://localhost` on iOS,
/// `http://tauri.localhost` on Android.
#[cfg(mobile)]
fn mobile_launcher_home() -> Url {
    let fallback = if cfg!(target_os = "android") {
        "http://tauri.localhost/?view=ask"
    } else {
        "tauri://localhost/?view=ask"
    };
    fallback.parse().expect("static launcher URL")
}

/// Focus the native UI, building it first when it does not exist yet.
#[cfg(desktop)]
fn focus_ask_ui(app: &AppHandle) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window("ask") {
        existing.show().map_err(|e| e.to_string())?;
        existing.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }
    open_ask_ui(app)
}

/// The native chat UI: a local view, so it renders instantly, works offline
/// except for the answers themselves, and needs no remote capability.
#[cfg(desktop)]
fn open_ask_ui(app: &AppHandle) -> Result<(), String> {
    let mut builder =
        WebviewWindowBuilder::new(app, "ask", WebviewUrl::App("index.html?view=ask".into()))
            .title("A House Divided: Ask")
            .inner_size(ASK_WINDOW_WIDTH, ASK_WINDOW_HEIGHT)
            .min_inner_size(320.0, 480.0)
            .resizable(true)
            .background_color(tauri::window::Color(0x14, 0x14, 0x1c, 0xff))
            .on_navigation(|url| {
                (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
                    || (matches!(url.scheme(), "http" | "https")
                        && url.host_str() == Some("tauri.localhost"))
            })
            .on_new_window({
                let popup_app = app.clone();
                move |url, _features| {
                    // Citation links leave the panel for the system browser; nothing
                    // else may open a window from here.
                    if matches!(url.scheme(), "https" | "http") {
                        let _ = popup_app.opener().open_url(url.to_string(), None::<&str>);
                    }
                    tauri::webview::NewWindowResponse::Deny
                }
            });

    if let Ok(Some(monitor)) = app.primary_monitor() {
        let size = monitor.size();
        let (x, y) = ask_dock_logical(size.width, size.height, monitor.scale_factor());
        builder = builder.position(x, y);
    } else {
        builder = builder.center();
    }

    let window = builder.build().map_err(|e| e.to_string())?;
    let close_app = app.clone();
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

/// The one-time sign-in bounce. Zero capabilities, the Ask navigation guard,
/// and it never outlives the login: the watcher closes it as soon as the
/// session cookie lands.
#[cfg(desktop)]
fn open_ask_auth(app: &AppHandle) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window("ask-auth") {
        existing.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }
    let url = ask_auth_url();
    let nav_app = app.clone();
    let new_window_app = app.clone();
    let close_app = app.clone();
    let window = WebviewWindowBuilder::new(app, "ask-auth", WebviewUrl::External(url))
        .title("Sign in to Ask")
        .inner_size(440.0, 640.0)
        .center()
        .resizable(true)
        .on_navigation(move |url| {
            if crate::is_ask_navigation_allowed(url) {
                true
            } else {
                let _ = nav_app.opener().open_url(url.to_string(), None::<&str>);
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
        .map_err(|e| e.to_string())?;
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

/// Incremental Server-Sent Events framing for the answer stream: one blank
/// line dispatches the pending event, `data:` lines join with newlines, and
/// `:` comment lines (keepalives) are ignored. Pure so the exact wire shape
/// the service speaks stays covered without a networked test.
struct SseParser {
    event: String,
    data_lines: Vec<String>,
}

impl Default for SseParser {
    /// Unnamed data blocks dispatch as "message", per the SSE specification.
    fn default() -> Self {
        Self {
            event: String::from("message"),
            data_lines: Vec::new(),
        }
    }
}

impl SseParser {
    fn push_line(&mut self, line: &str) -> Option<(String, serde_json::Value)> {
        if line.is_empty() {
            if self.data_lines.is_empty() {
                self.event = String::from("message");
                return None;
            }
            let data = serde_json::from_str::<serde_json::Value>(&self.data_lines.join("\n"))
                .unwrap_or(serde_json::Value::Null);
            let kind = std::mem::replace(&mut self.event, String::from("message"));
            self.data_lines.clear();
            return Some((kind, data));
        }
        if line.starts_with(':') {
            return None;
        }
        if let Some(name) = line.strip_prefix("event:") {
            self.event = name.trim().to_string();
        } else if let Some(chunk) = line.strip_prefix("data:") {
            // SSE strips one leading space after the colon; the payload keeps the rest.
            self.data_lines
                .push(chunk.strip_prefix(' ').unwrap_or(chunk).to_string());
        }
        None
    }
}

#[cfg(test)]
mod tests {
    #[cfg(desktop)]
    use super::ask_dock_origin;
    use super::{
        ask_api_allowed, ask_auth_url, ask_signin_return_home, ask_signin_watch_done,
        is_ask_session_cookie, select_ask_session_cookie, SseParser,
    };

    #[test]
    #[cfg(desktop)]
    fn ask_panel_docks_against_the_right_edge() {
        // 1920x1080 at scale 1: 440-wide panel, 12px margin.
        assert_eq!(ask_dock_origin(1920, 1080, 1.0), (1468, 140));
        // Hidpi scale factor scales the panel and the margin together.
        assert_eq!(ask_dock_origin(3840, 2160, 2.0), (2936, 280));
        // A monitor narrower than the panel clamps to the left edge instead of
        // wrapping around.
        assert_eq!(ask_dock_origin(320, 480, 1.0), (0, 0));
    }

    #[test]
    fn sse_framing_matches_the_answer_stream() {
        // A realistic answer opening: keepalive comment, meta, status, deltas.
        let wire = [
            ": keepalive",
            "event: meta",
            "data: {\"convId\":\"abc123\",\"reqId\":\"r1\"}",
            "",
            "event: status",
            "data: {\"label\":\"Checking map data…\"}",
            "",
            "event: delta",
            "data: \"The North \"",
            "",
            "event: delta",
            "data: \"holds.\"",
            "",
            "event: done",
            "data: {\"answer\":\"The North holds.\",\"usage\":{\"remaining\":4}}",
            "",
        ];
        let mut parser = SseParser::default();
        let events: Vec<(String, serde_json::Value)> = wire
            .iter()
            .filter_map(|line| parser.push_line(line))
            .collect();
        assert_eq!(events.len(), 5);
        assert_eq!(events[0].0, "meta");
        assert_eq!(events[0].1["convId"], serde_json::json!("abc123"));
        assert_eq!(events[1].0, "status");
        assert_eq!(
            events[2],
            ("delta".to_string(), serde_json::json!("The North "))
        );
        assert_eq!(
            events[3],
            ("delta".to_string(), serde_json::json!("holds."))
        );
        assert_eq!(events[4].0, "done");
        assert_eq!(events[4].1["usage"]["remaining"], serde_json::json!(4));
    }

    #[test]
    fn sse_ignores_stray_blanks_and_joins_split_payloads() {
        let mut parser = SseParser::default();
        assert!(parser.push_line("").is_none());
        assert!(parser.push_line(": ping").is_none());
        assert!(parser.push_line("event: delta").is_none());
        assert!(parser.push_line("data: {\"a\":").is_none());
        let event = parser.push_line("data: 1}");
        assert!(event.is_none());
        let event = parser.push_line("");
        assert_eq!(
            event,
            Some(("delta".to_string(), serde_json::json!({"a": 1})))
        );
        // A data block with no event name dispatches as "message".
        assert!(parser.push_line("data: 7").is_none());
        let event = parser.push_line("");
        assert_eq!(event, Some(("message".to_string(), serde_json::json!(7))));
    }

    #[test]
    fn ask_proxy_reaches_only_the_chat_routes() {
        assert!(ask_api_allowed("GET", "/api/me"));
        assert!(ask_api_allowed("GET", "/api/conversations"));
        assert!(ask_api_allowed("GET", "/api/conversation?id=abc123"));
        assert!(ask_api_allowed("POST", "/api/ask/stop"));
        assert!(ask_api_allowed("POST", "/api/map/render"));
        assert!(!ask_api_allowed("GET", "/api/ask"));
        assert!(!ask_api_allowed("POST", "/api/me"));
        assert!(!ask_api_allowed("POST", "/api/conversation/share"));
        assert!(!ask_api_allowed("POST", "/api/answer/feedback"));
        assert!(!ask_api_allowed("GET", "/api/uploads/x"));
        assert!(!ask_api_allowed("GET", "/console"));
        assert!(!ask_api_allowed("DELETE", "/api/upload"));
    }

    #[test]
    fn mobile_signin_watch_stops_once_home_or_signed_in() {
        assert!(ask_signin_watch_done(true, false));
        assert!(ask_signin_watch_done(false, true));
        assert!(ask_signin_watch_done(true, true));
        assert!(!ask_signin_watch_done(false, false));
    }

    #[test]
    fn mobile_signin_watch_claim_is_single_flight() {
        use super::{ask_signin_watch_claim, ask_signin_watch_release};
        use std::sync::atomic::AtomicBool;
        let active = AtomicBool::new(false);
        // The first tap claims the single webview; a concurrent tap joins
        // the running watch instead of racing a second bounce over it.
        // Mirrors the multiplayer twin in `lib.rs`.
        assert!(ask_signin_watch_claim(&active));
        assert!(!ask_signin_watch_claim(&active));
        // The watcher releases once on exit, so the next link can bounce.
        ask_signin_watch_release(&active);
        assert!(ask_signin_watch_claim(&active));
        ask_signin_watch_release(&active);
    }

    #[test]
    fn mobile_signin_returns_home_unless_player_came_back() {
        // Linked session (already navigated home in the watch): the tail
        // stays quiet.
        assert!(!ask_signin_return_home(false, false));
        // Failed, cancelled, or cookie-invisible callback with the only
        // webview still on remote content: home so the signed-out panel
        // offers retry instead of stranding the player.
        assert!(ask_signin_return_home(true, false));
        // Player came back on their own (or never left): never yank the view.
        assert!(!ask_signin_return_home(false, true));
        assert!(!ask_signin_return_home(true, true));
    }

    #[test]
    fn ask_session_prefers_the_current_cookie_contract() {
        // A stale legacy cookie must never shadow the live session: every
        // proxy call would attach the expired value and read as signed out
        // even with the account linked (#358 physical-device loop).
        let live =
            select_ask_session_cookie(&[("ask_session", "stale"), ("__Host-ask_session", "live")]);
        assert_eq!(live.as_deref(), Some("__Host-ask_session=live"));
        let legacy_only = select_ask_session_cookie(&[("ask_session", "legacy")]);
        assert_eq!(legacy_only.as_deref(), Some("ask_session=legacy"));
        let empty_is_absent =
            select_ask_session_cookie(&[("__Host-ask_session", ""), ("ask_session", "legacy")]);
        assert_eq!(empty_is_absent.as_deref(), Some("ask_session=legacy"));
        let none: &[(&str, &str)] = &[];
        assert_eq!(select_ask_session_cookie(none), None);
    }

    #[test]
    fn ask_auth_matches_the_current_client_cookie_and_native_broker() {
        assert!(is_ask_session_cookie("__Host-ask_session"));
        assert!(is_ask_session_cookie("ask_session"));
        assert!(!is_ask_session_cookie("__Host-ask_login"));
        assert_eq!(
            ask_auth_url().as_str(),
            "https://auth.ahousedividedgame.com/auth/ahd?return=https%3A%2F%2Fask.lakesidegames.net%2Fauth%2Fnative%2Fcallback"
        );
    }

    #[test]
    fn ask_session_filter_rejects_the_game_account_cookies() {
        // The game account names (`auth-token` historic literal,
        // `auth-token-<railway-tag>` per AHDGame `computeAuthCookieName`,
        // Auth.js-era session names) must never attach to Ask calls: the
        // wrong material would read as signed out with the account linked
        // (the #358 physical-device loop class).
        for rejected in [
            "auth-token",
            "auth-token-production",
            "auth-token-local",
            "auth-token-ahd-game-prod",
            "authjs.session-token",
            "__Secure-authjs.session-token",
            "next-auth.session-token",
            "__Secure-next-auth.session-token",
        ] {
            assert!(
                !is_ask_session_cookie(rejected),
                "{rejected} must not be recognized"
            );
        }
    }

    #[test]
    fn ask_windows_keep_the_persistent_platform_profile() {
        // Session persistence across full process relaunches (#149): the Ask
        // bounce and panel windows must use the platform's normal persistent
        // cookie/storage jar, which is the Tauri default — the same default
        // AHDClient documents. Building a window incognito would silently
        // discard the account session on every quit. The token is joined so
        // this test never self-matches.
        let source = include_str!("ask.rs");
        let incognito = [".incognito", "("].join("");
        assert!(
            !source.contains(&incognito),
            "Ask windows must never be built incognito"
        );
    }

    #[test]
    fn ask_links_leave_only_through_plain_web_urls() {
        let source = include_str!("ask.rs");
        let body = source
            .split_once("async fn open_ask_link")
            .and_then(|(_, rest)| rest.split_once("\n}\n"))
            .map(|(body, _)| body)
            .expect("open_ask_link body should exist");
        assert!(body.contains("\"http\" | \"https\""));
        assert!(body.contains("open_url"));
        // The raw URL must never be navigated to in-app or passed to a shell.
        assert!(!body.contains("navigate("));
    }
}
