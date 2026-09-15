import { describe, expect, it } from "vitest";
import {
  parseCharacterMe,
  parseExecuteResult,
  parseInbox,
  parseMutationAck,
  parseSessionProbe,
  parseTurnStatus,
  validateExecuteArgs,
  validateNotificationId,
} from "./validators";
import { MP_EXECUTE_ACTION_TYPES } from "./endpoints";

describe("parseSessionProbe", () => {
  it("accepts the signed-in shape", () => {
    expect(
      parseSessionProbe(
        JSON.stringify({ active: true, sub: "507f1f77bcf86cd799439011", username: "Ada", email: "a@x.y", iat: 1, exp: 2 }),
      ),
    ).toEqual({ active: true, userId: "507f1f77bcf86cd799439011", username: "Ada" });
  });

  it("treats inactive and dependency-failure shapes as signed out, never malformed", () => {
    expect(parseSessionProbe(JSON.stringify({ active: false }))).toEqual({
      active: false,
      userId: null,
      username: null,
    });
    expect(parseSessionProbe(JSON.stringify({ error: "Session check unavailable" }))).toEqual({
      active: false,
      userId: null,
      username: null,
    });
  });

  it("rejects malformed probes", () => {
    expect(parseSessionProbe("not json")).toBeNull();
    expect(parseSessionProbe(JSON.stringify({ active: true }))).toBeNull();
    expect(parseSessionProbe(JSON.stringify({ active: true, sub: "x" }))).toBeNull();
    expect(parseSessionProbe(JSON.stringify({ active: "yes", sub: "x", username: "y" }))).toBeNull();
    expect(parseSessionProbe(JSON.stringify([1, 2]))).toBeNull();
  });
});

describe("parseCharacterMe", () => {
  const full = () =>
    JSON.stringify({
      foundingCooldownTurnsRemaining: 0,
      character: {
        _id: "507f1f77bcf86cd799439011",
        name: "Ada",
        party: "Labor",
        homeState: "CA",
        cashOnHand: 1250.5,
        actions: 3,
        countryId: "US",
      },
      corporation: { _id: "c", name: "Acme", liquidCapital: 10 },
    });

  it("projects audited fields and ignores the rest", () => {
    expect(parseCharacterMe(full())).toEqual({
      id: "507f1f77bcf86cd799439011",
      name: "Ada",
      party: "Labor",
      homeState: "CA",
      countryId: "US",
      cashOnHand: 1250.5,
      actions: 3,
      corporationName: "Acme",
    });
  });

  it("tolerates missing optionals but requires identity", () => {
    expect(
      parseCharacterMe(JSON.stringify({ character: { _id: "507f1f77bcf86cd799439011", name: "Ada" }, corporation: null })),
    ).toMatchObject({ name: "Ada", party: null, cashOnHand: null, corporationName: null });
    expect(parseCharacterMe(JSON.stringify({ character: { name: "Ada" } }))).toBeNull();
    expect(parseCharacterMe(JSON.stringify({ character: { _id: "x", name: "  " } }))).toBeNull();
    expect(parseCharacterMe(JSON.stringify({ nope: true }))).toBeNull();
    expect(parseCharacterMe("garbage")).toBeNull();
  });

  it("nulls mistyped numerics instead of failing the whole record", () => {
    const parsed = parseCharacterMe(
      JSON.stringify({ character: { _id: "507f1f77bcf86cd799439011", name: "Ada", cashOnHand: "lots" } }),
    );
    expect(parsed?.cashOnHand).toBeNull();
    expect(parsed?.name).toBe("Ada");
  });
});

describe("parseTurnStatus", () => {
  it("requires turn and year, projects presence and schedule", () => {
    expect(
      parseTurnStatus(
        JSON.stringify({
          currentTurn: 12,
          currentYear: 1862,
          isActive: true,
          isProcessing: true,
          processingPhaseLabel: "Elections",
          nextScheduledTurn: "2026-09-15T16:00:00.000Z",
          pausedAt: null,
        }),
      ),
    ).toEqual({
      currentTurn: 12,
      currentYear: 1862,
      isActive: true,
      isProcessing: true,
      processingLabel: "Elections",
      nextScheduledTurn: "2026-09-15T16:00:00.000Z",
      paused: false,
      pauseReason: null,
    });
    expect(parseTurnStatus(JSON.stringify({ currentTurn: 1, currentYear: 1860 }))).toMatchObject({
      currentTurn: 1,
      isProcessing: false,
      nextScheduledTurn: null,
    });
    expect(parseTurnStatus(JSON.stringify({ currentTurn: 1 }))).toBeNull();
    expect(parseTurnStatus(JSON.stringify({ error: "Game state not initialized" }))).toBeNull();
  });
});

describe("parseInbox", () => {
  it("parses entries and counts", () => {
    expect(
      parseInbox(
        JSON.stringify({
          notifications: [
            { _id: "507f1f77bcf86cd799439011", title: "Hi", message: "Yo", read: false, createdAt: "2026-01-01" },
            { _id: "507f1f77bcf86cd799439012", read: true },
          ],
          unreadCount: 1,
          total: 2,
          hasMore: true,
        }),
      ),
    ).toEqual({
      notifications: [
        { id: "507f1f77bcf86cd799439011", title: "Hi", message: "Yo", read: false, createdAt: "2026-01-01" },
        { id: "507f1f77bcf86cd799439012", title: null, message: null, read: true, createdAt: null },
      ],
      unreadCount: 1,
      total: 2,
      hasMore: true,
    });
  });

  it("rejects malformed inboxes", () => {
    expect(parseInbox(JSON.stringify({ notifications: [], unreadCount: 0 }))).toMatchObject({ unreadCount: 0 });
    expect(parseInbox(JSON.stringify({ notifications: [] }))).toBeNull();
    expect(parseInbox(JSON.stringify({ notifications: [{ _id: "short" }], unreadCount: 1 }))).toBeNull();
    expect(parseInbox(JSON.stringify({ notifications: "none", unreadCount: 0 }))).toBeNull();
    expect(parseInbox("nope")).toBeNull();
  });
});

describe("parseExecuteResult/parseMutationAck", () => {
  it("accepts success shapes only", () => {
    expect(parseExecuteResult(JSON.stringify({ success: true, message: "Raised 100." }))).toBe("Raised 100.");
    expect(parseExecuteResult(JSON.stringify({ success: false, message: "x" }))).toBeNull();
    expect(parseExecuteResult(JSON.stringify({ message: "x" }))).toBeNull();
    expect(parseMutationAck(JSON.stringify({ success: true }))).toBe(true);
    expect(parseMutationAck(JSON.stringify({ success: false }))).toBe(false);
    expect(parseMutationAck("junk")).toBe(false);
  });
});

describe("validateExecuteArgs", () => {
  it("accepts all nine audited action types", () => {
    expect(MP_EXECUTE_ACTION_TYPES).toHaveLength(9);
    for (const actionType of MP_EXECUTE_ACTION_TYPES) {
      const result = validateExecuteArgs({ actionType });
      expect(result).toEqual({ ok: true, body: { actionType } });
    }
  });

  it("rejects unknown actions and adversarial extras before anything is sent", () => {
    expect(validateExecuteArgs({ actionType: "nuke" }).ok).toBe(false);
    expect(validateExecuteArgs({ actionType: null }).ok).toBe(false);
    expect(validateExecuteArgs({ actionType: "campaign", targetState: "   " }).ok).toBe(false);
    // Server cap is MAX_REGION_ID_LENGTH (15): 15 passes, 16 fails.
    expect(validateExecuteArgs({ actionType: "campaign", targetState: "x".repeat(15) }).ok).toBe(true);
    expect(validateExecuteArgs({ actionType: "campaign", targetState: "x".repeat(16) }).ok).toBe(false);
    expect(validateExecuteArgs({ actionType: "campaign", targetState: "  CA " })).toEqual({
      ok: true,
      body: { actionType: "campaign", targetState: "CA" },
    });
    expect(validateExecuteArgs({ actionType: "fundraise", convertAmount: 10 }).ok).toBe(false);
    expect(validateExecuteArgs({ actionType: "convertCash", convertAmount: 0 }).ok).toBe(false);
    expect(validateExecuteArgs({ actionType: "convertCash", convertAmount: -3 }).ok).toBe(false);
    expect(validateExecuteArgs({ actionType: "convertCash", convertAmount: Number.NaN }).ok).toBe(false);
    expect(validateExecuteArgs({ actionType: "convertCash", convertAmount: 250 })).toEqual({
      ok: true,
      body: { actionType: "convertCash", convertAmount: 250 },
    });
  });
});

describe("validateNotificationId", () => {
  it("accepts 24-hex ids only", () => {
    expect(validateNotificationId("507f1f77bcf86cd799439011")).toEqual({
      ok: true,
      id: "507f1f77bcf86cd799439011",
    });
    for (const bad of ["", "short", "507f1f77bcf86cd79943901zz", null, 42]) {
      expect(validateNotificationId(bad).ok).toBe(false);
    }
  });
});
