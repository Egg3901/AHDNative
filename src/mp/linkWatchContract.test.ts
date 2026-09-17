import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/* Native account-link return-home contract (#149, #358): on a single-view
 * phone the link action borrows the only webview for the auth bounce. When
 * the bounce ends without a visible session (failure, cancellation, TLS or
 * network loss, or a callback cookie the platform jar would not surface),
 * the watcher must still navigate back to the local launcher instead of
 * stranding the player on dead remote content. The launcher re-probes, so
 * the failure surfaces as the signed-out panel with retry. */

function mobileWatcherOf(source: string, command: string): string {
  // The mobile variant is the #[cfg(mobile)]-gated definition; the desktop
  // variant (where one exists) is a separate #[cfg(desktop)] definition.
  const marker = `fn ${command}`;
  let from = 0;
  for (;;) {
    const at = source.indexOf(marker, from);
    if (at < 0) throw new Error(`mobile ${command} not found`);
    const head = source.slice(Math.max(0, at - 160), at);
    if (head.includes("#[cfg(mobile)]")) {
      // Bound the slice to this top-level definition so later test modules
      // cannot satisfy the assertions by accident.
      const end = source.indexOf("\n}\n", at);
      if (end < 0) throw new Error(`end of mobile ${command} not found`);
      return source.slice(at - 160, end);
    }
    from = at + marker.length;
  }
}

describe("mobile link watchers return home on give-up", () => {
  it("ask bounce navigates home when the watch ends off the app origin", () => {
    const source = readFileSync(new URL("../../src-tauri/src/ask.rs", import.meta.url), "utf8");
    const watcher = mobileWatcherOf(source, "open_ask_window");
    // Pure end-of-watch decision with a truth-table unit test in Rust.
    expect(watcher).toContain("ask_signin_return_home");
    // The give-up arm navigates the only webview back to the Ask launcher.
    expect(watcher).toContain("mobile_launcher_home()");
  });

  it("multiplayer bounce navigates home when the watch ends off the app origin", () => {
    const source = readFileSync(new URL("../../src-tauri/src/lib.rs", import.meta.url), "utf8");
    const watcher = mobileWatcherOf(source, "open_mp_sign_in");
    expect(watcher).toContain("mp_signin_return_home");
    expect(watcher).toContain("mobile_mp_launcher_url()");
  });
});
