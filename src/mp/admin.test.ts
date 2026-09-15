import { describe, expect, it, vi } from "vitest";
import { parseClientNavPermissions, parseMaintenanceStatus } from "./validators";
import { MpAdminSession } from "./admin";
import type { MpBridgeHost } from "./bridge";

/**
 * Native multiplayer admin surface (#359): the server alone decides who is
 * an admin. `client-nav` returns the authoritative `user.isAdmin` /
 * `user.isModerator` flags; the admin session renders the read-only
 * maintenance status only when the server says `isAdmin === true`.
 * Moderators, unsigned-out users, and malformed permission bodies never
 * reach the admin read. A 403 on the admin read itself also denies.
 */

const adminNav = (isAdmin: boolean, isModerator = isAdmin) =>
  JSON.stringify({ user: { id: "u1", username: "Ada", isAdmin, isModerator } });
const maintenance = (mode = "off") =>
  JSON.stringify({
    mode,
    enabled: mode !== "off",
    reason: "",
    expectedEnd: "",
    enabledBy: "",
    enabledAt: "",
  });

describe("parseClientNavPermissions", () => {
  it("accepts explicit server booleans and nothing else", () => {
    expect(parseClientNavPermissions(adminNav(true))).toEqual({ isAdmin: true, isModerator: true });
    expect(parseClientNavPermissions(adminNav(false, true))).toEqual({ isAdmin: false, isModerator: true });
    expect(parseClientNavPermissions(adminNav(false, false))).toEqual({ isAdmin: false, isModerator: false });
  });

  it("refuses to infer admin from missing, truthy, or malformed flags", () => {
    expect(parseClientNavPermissions(JSON.stringify({ user: { id: "u1" } }))).toBeNull();
    expect(parseClientNavPermissions(JSON.stringify({ user: { isAdmin: 1, isModerator: 0 } }))).toBeNull();
    expect(parseClientNavPermissions(JSON.stringify({ user: { isAdmin: "true", isModerator: false } }))).toBeNull();
    expect(parseClientNavPermissions(JSON.stringify({ isAdmin: true }))).toBeNull();
    expect(parseClientNavPermissions(JSON.stringify({ user: null }))).toBeNull();
    expect(parseClientNavPermissions("not json")).toBeNull();
    expect(parseClientNavPermissions(JSON.stringify([1]))).toBeNull();
  });
});

describe("parseMaintenanceStatus", () => {
  it("projects the audited maintenance DTO", () => {
    expect(parseMaintenanceStatus(maintenance("partial"))).toEqual({
      mode: "partial",
      enabled: true,
      reason: "",
      expectedEnd: "",
      enabledBy: "",
      enabledAt: "",
    });
    expect(
      parseMaintenanceStatus(
        JSON.stringify({
          mode: "full",
          enabled: true,
          reason: "deploy",
          expectedEnd: "tomorrow",
          enabledBy: "root",
          enabledAt: "2026-09-01",
          extra: "ignored",
        }),
      ),
    ).toMatchObject({ mode: "full", enabled: true, reason: "deploy", enabledBy: "root" });
  });

  it("rejects unknown modes, non-boolean enabled, and non-objects", () => {
    expect(parseMaintenanceStatus(maintenance("down"))).toBeNull();
    expect(parseMaintenanceStatus(JSON.stringify({ mode: "off" }))).toBeNull();
    expect(parseMaintenanceStatus(JSON.stringify({ mode: "off", enabled: "no" }))).toBeNull();
    expect(parseMaintenanceStatus("not json")).toBeNull();
  });
});

function scriptedHost(scripts: Record<string, Array<string | { reject: string }>>): {
  host: MpBridgeHost;
  calls: string[];
} {
  const calls: string[] = [];
  const queues = new Map<string, Array<string | { reject: string }>>();
  for (const [op, items] of Object.entries(scripts)) queues.set(op, [...items]);
  const next = (key: string): string => {
    const item = queues.get(key)?.shift();
    if (typeof item === "string") return item;
    if (item) throw new Error(item.reject);
    throw new Error(`unexpected call ${key}`);
  };
  return {
    calls,
    host: {
      fetch: vi.fn(async (op: string) => {
        calls.push(op);
        return next(op);
      }),
      mutate: vi.fn(async () => {
        throw new Error("admin surface never mutates");
      }),
      beginSignIn: vi.fn(async () => {}),
    },
  };
}

describe("MpAdminSession gate", () => {
  it("loads permissions then maintenance and goes ready for server admins", async () => {
    const { host, calls } = scriptedHost({ "client-nav": [adminNav(true)], "admin-maintenance": [maintenance()] });
    const snapshot = await new MpAdminSession(host).enter();
    expect(snapshot.phase).toBe("ready");
    expect(snapshot.isAdmin).toBe(true);
    expect(snapshot.status).toMatchObject({ mode: "off", enabled: false });
    expect(calls).toEqual(["client-nav", "admin-maintenance"]);
    expect(snapshot.error).toBeNull();
  });

  it("denies non-admins and moderators without touching the admin endpoint", async () => {
    for (const nav of [adminNav(false, false), adminNav(false, true)]) {
      const { host, calls } = scriptedHost({ "client-nav": [nav] });
      const snapshot = await new MpAdminSession(host).enter();
      expect(snapshot.phase).toBe("denied");
      expect(snapshot.isAdmin).toBe(false);
      expect(snapshot.status).toBeNull();
      expect(calls).toEqual(["client-nav"]);
    }
  });

  it("treats malformed permissions as a server error, never as admin", async () => {
    const { host, calls } = scriptedHost({ "client-nav": [JSON.stringify({ user: { isAdmin: 1 } })] });
    const snapshot = await new MpAdminSession(host).enter();
    expect(snapshot.phase).toBe("server-error");
    expect(snapshot.isAdmin).toBe(false);
    expect(calls).toEqual(["client-nav"]);
  });

  it("maps signed-out (401) and refused (403) to signed-out and denied", async () => {
    const signedOut = scriptedHost({ "client-nav": [{ reject: "remote-error:401:0:{\"error\":\"x\"}" }] });
    expect((await new MpAdminSession(signedOut.host).enter()).phase).toBe("signed-out");

    const refused = scriptedHost({
      "client-nav": [adminNav(true)],
      "admin-maintenance": [{ reject: "remote-error:403:0:{\"error\":\"forbidden\"}" }],
    });
    const denied = await new MpAdminSession(refused.host).enter();
    expect(denied.phase).toBe("denied");
    expect(denied.error).toContain("forbidden");
  });

  it("reports malformed maintenance as server-error and clears state on exit", async () => {
    const { host } = scriptedHost({ "client-nav": [adminNav(true)], "admin-maintenance": ["{}"] });
    const session = new MpAdminSession(host);
    expect((await session.enter()).phase).toBe("server-error");
    expect(session.exit()).toEqual({
      phase: "idle",
      isAdmin: false,
      isModerator: false,
      status: null,
      notice: null,
      error: null,
    });
  });

  it("never issues a mutation", async () => {
    const { host } = scriptedHost({ "client-nav": [adminNav(false)] });
    await new MpAdminSession(host).enter();
    expect(host.mutate).not.toHaveBeenCalled();
  });
});
