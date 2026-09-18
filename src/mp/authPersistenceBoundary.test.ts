import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/* Joint Ask/MP persistent-auth boundary (#149): AHDGame owns authentication
 * and the platform cookie profile owns session material. Ask recognizes only
 * the Ask service session names (`__Host-ask_session` canonical, `ask_session`
 * legacy) while the game account filter recognizes only the game account
 * names (`auth-token` historic literal, `auth-token-<railway-tag>` per
 * AHDGame `computeAuthCookieName`, Auth.js-era session names). Each surface
 * must reject the other's canonical names — attaching the wrong material to
 * live-site calls would read as signed out with the account linked (the #358
 * physical-device loop class). Both surfaces must also keep the persistent
 * platform profile (never incognito) so the session survives a full process
 * relaunch, and neither may log or persist raw session material.
 *
 * References: AHDClient `378126dc` (persistent jar is the Tauri default;
 * dedicated online window, zero capabilities), AHDGame
 * `src/lib/authCookieName.ts`, AHDGame `src/app/api/auth/session/route.ts`
 * (401 `{active:false}` signed out) and `POST /api/auth/logout` (clears the
 * cookie, revokes issued tokens).
 */

const ASK = readFileSync(new URL("../../src-tauri/src/ask.rs", import.meta.url), "utf8");
const LIB = readFileSync(new URL("../../src-tauri/src/lib.rs", import.meta.url), "utf8");
const MP_SESSION = readFileSync(new URL("../../src-tauri/src/mp_session.rs", import.meta.url), "utf8");

function production(source: string): string {
  return source.split("#[cfg(test)]")[0] ?? "";
}

describe("Ask and MP recognize only their own canonical cookie names", () => {
  it("Ask owns the Ask service names", () => {
    expect(ASK).toContain('"__Host-ask_session"');
    expect(ASK).toContain('"ask_session"');
  });

  it("the game account filter owns the game account names", () => {
    for (const name of ["auth-token", "auth-token-production", "auth-token-local"]) {
      expect(LIB).toContain(`"${name}"`);
    }
  });

  it("the game account filter rejects the canonical Ask names", () => {
    // The legacy `ask_session` rejection predates the `__Host-` contract:
    // without the canonical name pinned, a filter refactor could attach Ask
    // material to game calls.
    expect(LIB).toContain('"ask_session"');
    expect(LIB).toContain('"__Host-ask_session"');
  });

  it("the Ask filter rejects the game account names", () => {
    // No `auth-token` mention exists in ask.rs until this contract is
    // pinned: without it a widened Ask matcher could attach game material
    // to Ask calls.
    expect(ASK).toContain("auth-token");
  });
});

describe("both surfaces keep the persistent platform profile", () => {
  it("no auth surface is ever built incognito", () => {
    const incognito = [".incognito", "("].join("");
    for (const [label, source] of [["ask.rs", ASK], ["lib.rs", LIB], ["mp_session.rs", MP_SESSION]] as const) {
      expect(production(source)).not.toContain(incognito, `${label} must use the persistent jar`);
    }
  });

  it("the Ask surface pins the persistent-profile guard", () => {
    // MP pins this in lib.rs (`online_window_keeps_the_persistent_platform_profile`)
    // and coldBootRestore pins the restore window; Ask needs the same guard
    // so its bounce window can never silently discard the session on quit.
    expect(ASK).toContain("incognito");
  });
});

describe("neither surface logs or persists raw session material", () => {
  it("Rust production never prints session values", () => {
    for (const [label, source] of [["ask.rs", ASK], ["lib.rs", LIB], ["mp_session.rs", MP_SESSION]] as const) {
      const body = production(source);
      for (const macro of ["println!", "eprintln!", "dbg!"]) {
        expect(body).not.toContain(macro, `${label} must not print (${macro})`);
      }
    }
  });

  it("Rust production persists no session material", () => {
    for (const [label, source] of [["ask.rs", ASK], ["mp_session.rs", MP_SESSION]] as const) {
      const body = production(source);
      expect(body).not.toContain("localStorage", `${label} must not persist sessions`);
      expect(body).not.toContain("sessionStorage", `${label} must not persist sessions`);
      expect(body).not.toContain("document.cookie", `${label} must not persist sessions`);
    }
  });
});
