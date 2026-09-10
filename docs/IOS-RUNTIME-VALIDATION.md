# iOS runtime validation gate

The integrated browser smoke is not an iPhone or WKWebView result. No simulator, phone or paid iOS build was run for this checkpoint.

## What is implemented

- React uses a dedicated `Worker` for the local engine. Vite emits its code as a separate bundled asset.
- Native save/load commands run file work on Tauri's blocking executor. The frontend sends the original JSON save string; Rust validates the envelope and replaces a slot through a synced temporary file.
- Completed new games, successful actions and turns are saved before their operation finishes. Save failure is visible and preserves the previous persisted slot. This reduces reliance on a background callback completing before suspension.
- A failed worker can be replaced by loading a saved game. Failed imports are validated in a separate session before replacing the active session.

## What needs native proof

| Boundary | Required observation |
|---|---|
| Bundled worker | Production assets load and the worker creates a real world in WKWebView. A dev-server URL alone does not prove the bundled asset path. |
| Native invoke | Create, act, advance, save, terminate the app, reopen and resume using the Rust store. Browser IndexedDB is only the local QA path. |
| Large saves | Record actual save size, peak memory, serialize time, bridge time and file-write time for a representative late-game world. The 256 MiB file limit is not an iOS memory guarantee. |
| Suspension | Background or lock during a turn and during save; foreground or relaunch. Either a completed save or the preceding completed save must load. Never claim unsaved work was persisted. |
| Performance | Named phone, OS version, build commit, representative world and turn p95/worst case. The proposed p95 budget remains 500 ms. Record end-to-end interaction time separately from engine time. |
| Presentation | Compare actual AHD MP/SP screens on the phone. Check safe areas, keyboard, VoiceOver, navigation, scrolling and touch controls. |

## Source review and limits

Tauri supports bundled assets and a configurable CSP. The app explicitly allows its own worker scripts and inline styles used by React, without allowing arbitrary inline scripts. See [Tauri CSP](https://v2.tauri.app/security/csp/) and [Vite worker handling](https://vite.dev/guide/features.html#web-workers).

Wry's Apple backend uses WKWebView and custom URL scheme handling. Registration of that handler does not, by itself, prove this app's dedicated module worker works on every supported iOS version. Inspect the pinned [Wry 0.55.1 Apple backend](https://docs.rs/crate/wry/0.55.1/source/src/wkwebview/mod.rs) and [Apple WKURLSchemeHandler API](https://developer.apple.com/documentation/webkit/wkurlschemehandler), then validate the actual application. Dedicated workers and service workers are different facilities.

An IIFE-only JavaScript bundle can execute as a module; the absence of import/export statements is not evidence of a worker format failure. Change worker packaging only in response to an observed failure or a demonstrated compatibility requirement.

Registered custom Tauri commands are callable by default unless an app command manifest restricts them; an empty plugin permission list does not prove these commands are denied. See [Tauri capabilities](https://v2.tauri.app/security/capabilities/). Native invocation still needs integrated validation.

## Build policy

Run the native checks on an available Mac or in a deliberately budgeted private build after the candidate gate. A simulator requires macOS and Xcode; it is not available on the Linux validation host. Simulator time on Codemagic still consumes the owner's allowance. Keep signing, native artifacts and account identifiers private. Do not start an additional build merely to investigate an unconfirmed risk.
