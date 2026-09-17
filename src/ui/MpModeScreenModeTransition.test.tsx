/**
 * SP↔MP mode transition acceptance (#149, #363): leaving multiplayer for
 * single-player must drop every remote projection, stop all background
 * probing, and leave local saves alone. Re-entering shows a fresh
 * probe-first load from the platform cookie jar — never in-memory
 * carryover, never another provider click. Local SP persistence and the
 * offline engine stay untouched by every MP module on this screen.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MpModeScreen } from "./MpModeScreen";
import type { MpBridgeHost } from "../mp/bridge";

const USER = "507f1f77bcf86cd799439011";
const NOTE = "607f1f77bcf86cd799439011";

const probe = JSON.stringify({ active: true, sub: USER, username: "Ada" });
const me = JSON.stringify({
  character: { _id: "c1", name: "Ada", party: "Labor", homeState: "CA", cashOnHand: 1000, actions: 3, countryId: "US" },
  corporation: null,
});
const turn = JSON.stringify({ currentTurn: 12, currentYear: 1862, isActive: true, isProcessing: false, nextScheduledTurn: null });
const caps = JSON.stringify({ user: { id: USER, username: "Ada", isAdmin: false }, hasCharacter: true });
const inbox = JSON.stringify({ notifications: [{ _id: NOTE, title: "Turn processed", message: "Done", read: false }], unreadCount: 1, total: 1, hasMore: false });
const emptyMailInbox = JSON.stringify({ mails: [], unreadCount: 0, total: 0, hasMore: false });
const emptyMailSent = JSON.stringify({ mails: [], total: 0, hasMore: false });

function fakeHost(): { host: MpBridgeHost; beginSpy: ReturnType<typeof vi.fn>; fetchOps: string[] } {
  const fetchOps: string[] = [];
  const beginSpy = vi.fn(async () => {});
  return {
    beginSpy,
    fetchOps,
    host: {
      fetch: async (op: string) => {
        fetchOps.push(op);
        switch (op) {
          case "auth-session": return probe;
          case "character-me": return me;
          case "turn-status": return turn;
          case "client-nav": return caps;
          case "notifications": return inbox;
          case "mail-inbox": return emptyMailInbox;
          case "mail-sent": return emptyMailSent;
          default: throw new Error(`unexpected fetch ${op}`);
        }
      },
      mutate: async () => {
        throw new Error("unexpected mutate");
      },
      beginSignIn: beginSpy,
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MpModeScreen SP↔MP transition", () => {
  it("exit drops remote state and re-enter shows a fresh probe-first load", async () => {
    const { host, beginSpy, fetchOps } = fakeHost();
    const first = render(<MpModeScreen host={host} onExit={() => {}} />);
    await waitFor(() => expect(screen.getByText("Playing as Ada")).toBeInTheDocument());
    expect(beginSpy).not.toHaveBeenCalled();
    const firstLoadFetches = [...fetchOps];

    // Leaving for SP unmounts the screen: every remote projection goes away.
    first.unmount();
    expect(screen.queryByText("Playing as Ada")).toBeNull();

    // Coming back mounts a new session with no memory of the old one: the
    // first bridge call is the authoritative probe, and readiness returns
    // with no second provider round trip.
    const mark = fetchOps.length;
    render(<MpModeScreen host={host} onExit={() => {}} />);
    await waitFor(() => expect(screen.getByText("Playing as Ada")).toBeInTheDocument());
    expect(beginSpy).not.toHaveBeenCalled();
    expect(fetchOps.slice(mark)[0]).toBe("auth-session");
    expect(fetchOps.slice(mark)).toEqual(firstLoadFetches);
  });

  it("exit stops background probes: focus after unmount issues no bridge traffic", async () => {
    const { host, fetchOps } = fakeHost();
    const mounted = render(<MpModeScreen host={host} onExit={() => {}} />);
    await waitFor(() => expect(screen.getByText("Playing as Ada")).toBeInTheDocument());
    mounted.unmount();

    const quiet = fetchOps.length;
    window.dispatchEvent(new Event("focus"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchOps).toHaveLength(quiet);
  });

  it("no MP module on this screen touches SP persistence or the offline engine", () => {
    for (const file of [
      "../mp/adapter.ts",
      "../mp/bridge.ts",
      "../mp/endpoints.ts",
      "../mp/validators.ts",
      "../mp/admin.ts",
      "./MpModeScreen.tsx",
      "./MpAdminScreen.tsx",
    ]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source).not.toContain("localStorage");
      expect(source).not.toContain("sessionStorage");
      expect(source).not.toMatch(/document\.cookie/i);
      expect(source).not.toContain("../game");
      expect(source).not.toContain("./game");
      expect(source).not.toContain("@ahdclient/engine");
      expect(source).not.toContain("saveCompat");
      expect(source).not.toContain("../preferences");
      expect(source).not.toContain("./preferences");
    }
  });
});
