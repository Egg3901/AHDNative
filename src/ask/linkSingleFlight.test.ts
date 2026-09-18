import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/* Mobile Ask link single-flight (#149, physical-iPhone link crash): on a
 * single-view phone the account-link action borrows the only webview for
 * the auth bounce, and the TypeScript single-flight guard evaporates when
 * the bounce navigates the webview away (the JS context is destroyed). The
 * multiplayer twin (`open_mp_sign_in` in `src-tauri/src/lib.rs`) already
 * survives that with a Rust-side watch claim (`MP_SIGNIN_WATCH_ACTIVE`):
 * a concurrent tap joins the in-flight bounce instead of racing a second
 * navigate and a second watcher over the single webview. The Ask bounce
 * needs the same claim: parallel mobile watchers race navigates home and
 * can strand or yank the only view mid-callback.
 *
 * Device gate this does NOT prove: the actual physical-iPhone crash needs
 * a signed-device run (tap link, complete/cancel the provider callback,
 * relaunch, verify signed-out retry with no crash). Unit evidence here
 * pins the source contract only. */

function mobileOpenAskWindow(source: string): string {
  const marker = "fn open_ask_window";
  let from = 0;
  for (;;) {
    const at = source.indexOf(marker, from);
    if (at < 0) throw new Error("mobile open_ask_window not found");
    const head = source.slice(Math.max(0, at - 160), at);
    if (head.includes("#[cfg(mobile)]")) {
      const end = source.indexOf("\n}\n", at);
      if (end < 0) throw new Error("end of mobile open_ask_window not found");
      return source.slice(at - 160, end);
    }
    from = at + marker.length;
  }
}

describe("mobile Ask link bounce is single-flight", () => {
  const source = readFileSync("src-tauri/src/ask.rs", "utf8");
  const bounce = mobileOpenAskWindow(source);

  it("joins an in-flight bounce instead of racing a second navigate", () => {
    expect(bounce).toContain("ask_signin_watch_claim");
    expect(bounce).toContain("ASK_SIGNIN_WATCH_ACTIVE");
  });

  it("releases the claim on every exit so a later tap can link", () => {
    // A stuck claim would wedge Sign in forever (every later tap joins a
    // dead watch), which reads on-device as a broken link action. The
    // watcher tail and each early error return must release.
    expect(bounce).toContain("ask_signin_watch_release");
    expect(source).toContain("fn ask_signin_watch_release");
    expect(source).toContain("fn ask_signin_watch_claim");
  });
});
