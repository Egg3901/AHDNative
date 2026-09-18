import { describe, expect, it, vi } from "vitest";
import {
  formatTurnCountdown,
  isCorporationId,
  isElectionId,
  parseCharacterMe,
  parseClientNav,
  parseCorporationDetail,
  parseElectionDetail,
  parseExecuteResult,
  parseInbox,
  parseLogoutAck,
  parseMutationAck,
  parsePlayersOnline,
  parseSessionProbe,
  parseTurnStatus,
  parseUnionDetail,
  isUnionId,
  validateCorporationId,
  validateElectionId,
  validateExecuteArgs,
  validateNotificationId,
  validateNotificationPreference,
  validateSnoozeMinutes,
  validateUnionId,
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

describe("parseClientNav", () => {
  const full = () =>
    JSON.stringify({
      user: { id: "507f1f77bcf86cd799439011", username: "Ada", isAdmin: false },
      hasCharacter: true,
      characterCountryId: "US",
      characterName: "Ada",
      unreadCount: 4,
      unreadMailCount: 2,
      myCorporationId: 7,
      myCorporationType: "bank",
      myCorporationCountryId: "US",
      myUnionId: null,
      funds: 1000,
      actions: 3,
      homeState: { id: "CA", name: "California", countryId: "US" },
      currentParty: { id: "3", name: "Labor", countryId: "US" },
      activeElection: { id: "68a000000000000000000001", label: "President — National" },
      cabinetOffice: { positionId: "sec-state", positionName: "Secretary of State", countryCode: "us" },
      governorOffice: null,
      wikiDisabled: false,
      conflictsEnabled: true,
    });

  it("projects navigation capabilities and ignores the rest", () => {
    expect(parseClientNav(full())).toEqual({
      hasCharacter: true,
      characterName: "Ada",
      characterCountryId: "US",
      unreadMailCount: 2,
      corporationId: 7,
      unionId: null,
      activeElectionLabel: "President — National",
      activeElectionId: "68a000000000000000000001",
      activeElectionSeatId: null,
      cabinetOffice: "Secretary of State",
      governorOffice: null,
    });
  });

  it("projects the election seatId detail target when present", () => {
    expect(
      parseClientNav(
        JSON.stringify({
          hasCharacter: true,
          activeElection: { id: "68a000000000000000000001", seatId: "US-senate-PA-1", label: "Senate — PA" },
        }),
      ),
    ).toMatchObject({
      activeElectionLabel: "Senate — PA",
      activeElectionId: "68a000000000000000000001",
      activeElectionSeatId: "US-senate-PA-1",
    });
    expect(
      parseClientNav(JSON.stringify({ hasCharacter: true, activeElection: { label: "Senate — PA" } })),
    ).toMatchObject({ activeElectionLabel: "Senate — PA", activeElectionId: null, activeElectionSeatId: null });
  });

  it("tolerates the guest and no-character shapes", () => {
    expect(
      parseClientNav(
        JSON.stringify({ user: null, hasCharacter: false, characterCountryId: null, characterName: null }),
      ),
    ).toMatchObject({ hasCharacter: false, characterName: null, activeElectionLabel: null });
    expect(
      parseClientNav(
        JSON.stringify({
          user: { id: "507f1f77bcf86cd799439011", username: "Bo" },
          hasCharacter: false,
          unreadMailCount: 0,
        }),
      ),
    ).toMatchObject({ hasCharacter: false, unreadMailCount: 0, corporationId: null });
  });

  it("rejects malformed capabilities payloads", () => {
    expect(parseClientNav("not json")).toBeNull();
    expect(parseClientNav(JSON.stringify([1, 2]))).toBeNull();
    expect(parseClientNav(JSON.stringify({ user: null }))).toBeNull();
    expect(parseClientNav(JSON.stringify({ hasCharacter: "yes" }))).toBeNull();
  });

  it("nulls mistyped office decorations instead of failing the whole record", () => {
    expect(
      parseClientNav(
        JSON.stringify({ hasCharacter: true, activeElection: "soon", cabinetOffice: { positionName: 42 } }),
      ),
    ).toMatchObject({ hasCharacter: true, activeElectionLabel: null, cabinetOffice: null });
  });

  it("projects only integer corporation ids, including sequential zero", () => {
    const caps = (myCorporationId: unknown) =>
      parseClientNav(JSON.stringify({ hasCharacter: true, myCorporationId }));
    expect(caps(42)).toMatchObject({ corporationId: 42 });
    // Sequential zero is a real reference (live `corporationPathIdFromDoc`
    // prefers it over the ObjectId), so it must project, not null out.
    expect(caps(0)).toMatchObject({ corporationId: 0 });
    expect(caps(9_999_999_999)).toMatchObject({ corporationId: 9_999_999_999 });
    for (const bad of [4.5, -1, 10_000_000_000, "42", Number.NaN]) {
      expect(caps(bad), JSON.stringify(bad)).toMatchObject({ corporationId: null });
    }
  });
});

describe("election-detail reference and payload (#359 election slice)", () => {
  const HEX_ID = "68a000000000000000000001";
  const SEAT_ID = "US-senate-PA-1";

  it("accepts hex ids and bounded seatIds, rejects smuggling and drift", () => {
    expect(isElectionId(HEX_ID)).toBe(true);
    expect(isElectionId(SEAT_ID)).toBe(true);
    expect(isElectionId("UK-commons-LON-3")).toBe(true);
    for (const bad of [
      "",
      "e1",
      "seat-9",
      "US",
      "US-",
      "US--PA",
      "US senate",
      "US-senate-PA-1!",
      `${HEX_ID}&view=full`,
      `${SEAT_ID}?view=full`,
      "../../admin/maintenance",
      "/api/elections?id=x",
      null,
      42,
    ]) {
      expect(isElectionId(bad), JSON.stringify(bad)).toBe(false);
      expect(validateElectionId(bad).ok).toBe(false);
    }
    expect(validateElectionId(SEAT_ID)).toEqual({ ok: true, id: SEAT_ID });
  });

  const summary = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({
      election: {
        id: HEX_ID,
        seatId: SEAT_ID,
        electionType: "senate",
        state: "PA",
        countryId: "US",
        cycle: 4,
        status: "active",
        inPrimary: false,
        isEnded: false,
        isUpcoming: false,
        inGeneral: true,
        candidates: [{}, {}, {}],
        polling: { leaderName: "Ada", leaderParty: "Labor" },
        incumbent: { name: "Bo", party: "Tory" },
        ...overrides,
      },
    });

  it("projects the summary identity, phase, field, leader, and incumbent", () => {
    expect(parseElectionDetail(summary())).toEqual({
      id: HEX_ID,
      seatId: SEAT_ID,
      electionType: "senate",
      state: "PA",
      countryId: "US",
      cycle: 4,
      status: "active",
      inPrimary: false,
      isEnded: false,
      isUpcoming: false,
      inGeneral: true,
      candidateCount: 3,
      leaderName: "Ada",
      leaderParty: "Labor",
      incumbentName: "Bo",
      incumbentParty: "Tory",
    });
  });

  it("degrades absent decorations to null without losing the race", () => {
    expect(parseElectionDetail(summary({ polling: null, incumbent: null, seatId: null, state: null }))).toMatchObject({
      candidateCount: 3,
      leaderName: null,
      leaderParty: null,
      incumbentName: null,
      incumbentParty: null,
      seatId: null,
      state: null,
    });
    expect(parseElectionDetail(summary({ polling: "soon", incumbent: 42 }))).toMatchObject({
      candidateCount: 3,
      leaderName: null,
      incumbentName: null,
    });
  });

  it("fails closed on structural drift", () => {
    expect(parseElectionDetail("not json")).toBeNull();
    expect(parseElectionDetail(JSON.stringify({ election: null }))).toBeNull();
    expect(parseElectionDetail(JSON.stringify({}))).toBeNull();
    expect(parseElectionDetail(summary({ id: "" }))).toBeNull();
    expect(parseElectionDetail(summary({ cycle: "four" }))).toBeNull();
    expect(parseElectionDetail(summary({ inGeneral: "yes" }))).toBeNull();
    expect(parseElectionDetail(summary({ candidates: { length: 3 } }))).toBeNull();
    expect(parseElectionDetail(summary({ candidates: null }))).toBeNull();
    expect(parseElectionDetail(JSON.stringify({ error: "Election not found" }))).toBeNull();
  });
});

describe("corporation-detail reference and payload (#359 corporation slice)", () => {
  const HEX_ID = "68a000000000000000000001";

  it("accepts sequential ids and hex ObjectIds, rejects smuggling and drift", () => {
    expect(isCorporationId(42)).toBe(true);
    expect(isCorporationId("42")).toBe(true);
    expect(isCorporationId(HEX_ID)).toBe(true);
    expect(isCorporationId("0")).toBe(true);
    for (const bad of [
      "",
      "e1",
      "corp-42",
      "42 ",
      " 42",
      "4.5",
      "-1",
      "0x2A",
      `${HEX_ID}&view=full`,
      "../../admin/maintenance",
      "/api/corporations/42",
      "42?view=full",
      null,
      -1,
      4.5,
      Number.NaN,
    ]) {
      expect(isCorporationId(bad), JSON.stringify(bad)).toBe(false);
      expect(validateCorporationId(bad).ok).toBe(false);
    }
    expect(validateCorporationId(42)).toEqual({ ok: true, id: "42" });
    expect(validateCorporationId("42")).toEqual({ ok: true, id: "42" });
    expect(validateCorporationId(HEX_ID)).toEqual({ ok: true, id: HEX_ID });
  });

  it("shares one numeric/string boundary with the Rust bridge", () => {
    // Up to 10 digits in either form (the Rust `is_corporation_id` segment
    // bound); an 11-digit reference never leaves the UI in either form.
    expect(isCorporationId(9_999_999_999)).toBe(true);
    expect(isCorporationId("9999999999")).toBe(true);
    expect(validateCorporationId(9_999_999_999)).toEqual({ ok: true, id: "9999999999" });
    for (const bad of [10_000_000_000, "10000000000", "12345678901", 1e15]) {
      expect(isCorporationId(bad), JSON.stringify(bad)).toBe(false);
      expect(validateCorporationId(bad).ok).toBe(false);
    }
  });

  const detail = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({
      corporation: {
        _id: HEX_ID,
        sequentialId: 42,
        name: "Acme Consolidated",
        tickerSymbol: "ACME",
        typeLabel: "Industrial",
        headquartersStateName: "Pennsylvania",
        countryId: "US",
        ...overrides,
      },
      ceo: { name: "Ada", sequentialId: 9 },
      ceoIsInactive: false,
      financials: { revenue: 100 },
      sectors: [{}, {}, {}],
      balanceSheet: { assets: 50 },
      isPrivate: false,
    });

  it("projects the read-only summary identity, leadership, and scale", () => {
    expect(parseCorporationDetail(detail())).toEqual({
      id: HEX_ID,
      sequentialId: 42,
      name: "Acme Consolidated",
      tickerSymbol: "ACME",
      typeLabel: "Industrial",
      headquarters: "Pennsylvania",
      countryId: "US",
      isPrivate: false,
      ceoName: "Ada",
      sectorCount: 3,
    });
  });

  it("degrades absent decorations to null without losing the company", () => {
    expect(
      parseCorporationDetail(detail({ tickerSymbol: null, typeLabel: null, headquartersStateName: null })),
    ).toMatchObject({
      name: "Acme Consolidated",
      tickerSymbol: null,
      typeLabel: null,
      headquarters: null,
    });
    expect(
      parseCorporationDetail(JSON.stringify({
        corporation: { _id: HEX_ID, sequentialId: 42, name: "Acme", countryId: "US" },
        ceo: null,
        sectors: [],
        isPrivate: true,
      })),
    ).toMatchObject({ name: "Acme", ceoName: null, sectorCount: 0, isPrivate: true });
    // A missing ceo key degrades like an explicit null: leadership unknown.
    expect(
      parseCorporationDetail(
        JSON.stringify({
          corporation: { _id: HEX_ID, sequentialId: 42, name: "Acme", countryId: "US" },
          sectors: [],
        }),
      ),
    ).toMatchObject({ name: "Acme", ceoName: null, sectorCount: 0 });
  });

  it("fails closed on structural drift", () => {
    expect(parseCorporationDetail("not json")).toBeNull();
    expect(parseCorporationDetail(JSON.stringify({ corporation: null }))).toBeNull();
    expect(parseCorporationDetail(JSON.stringify({}))).toBeNull();
    expect(parseCorporationDetail(detail({ name: "" }))).toBeNull();
    expect(parseCorporationDetail(detail({ name: "   " }))).toBeNull();
    expect(parseCorporationDetail(detail({ countryId: 42 }))).toBeNull();
    expect(parseCorporationDetail(detail({ sequentialId: "many" }))).toBeNull();
    expect(
      parseCorporationDetail(
        JSON.stringify({
          corporation: { _id: HEX_ID, sequentialId: 42, name: "Acme", countryId: "US" },
          sectors: { length: 3 },
        }),
      ),
    ).toBeNull();
    expect(parseCorporationDetail(JSON.stringify({ error: "Corporation not found" }))).toBeNull();
  });
});

describe("union-detail reference and payload (#359 union slice)", () => {
  const HEX_ID = "68a000000000000000000001";

  it("accepts strict 24-hex ObjectIds, rejects smuggling and drift", () => {
    expect(isUnionId(HEX_ID)).toBe(true);
    expect(isUnionId("ffffffffffffffffffffffff")).toBe(true);
    for (const bad of [
      "",
      "e1",
      "42",
      "union-42",
      "68a000000000000000000001 ",
      " 68a000000000000000000001",
      `${HEX_ID}&view=full`,
      `${HEX_ID}?view=full`,
      `${HEX_ID}/leader`,
      "../../admin/maintenance",
      "/api/unions/68a000000000000000000001",
      "leaderboard",
      "found",
      "012345678901",
      "zzzzzzzzzzzzzzzzzzzzzzzz",
      "68A00000000000000000000ZZ",
      null,
      42,
    ]) {
      expect(isUnionId(bad), JSON.stringify(bad)).toBe(false);
      expect(validateUnionId(bad).ok).toBe(false);
    }
    expect(validateUnionId(HEX_ID)).toEqual({ ok: true, id: HEX_ID });
  });

  const detail = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({
      union: {
        id: HEX_ID,
        name: "Amalgamated Millhands",
        countryId: "US",
        countryName: "United States",
        sectorType: "manufacturing",
        sectorLabel: "Manufacturing",
        ownerId: "507f1f77bcf86cd799439011",
        electionOpen: false,
        members: 1200,
        approval: 62,
        treasury: 4500,
        suspended: false,
        ...overrides,
      },
      sectors: [{}, {}, {}],
      workforce: { unionizedWorkers: 1200 },
      dues: { duesPerWorkerAnnual: 10 },
    });

  it("projects the read-only summary identity, leadership, and scale", () => {
    expect(parseUnionDetail(detail())).toEqual({
      id: HEX_ID,
      name: "Amalgamated Millhands",
      countryId: "US",
      countryName: "United States",
      sectorType: "manufacturing",
      sectorLabel: "Manufacturing",
      ownerId: "507f1f77bcf86cd799439011",
      electionOpen: false,
      suspended: false,
      members: 1200,
      approval: 62,
      treasury: 4500,
      sectorCount: 3,
    });
  });

  it("degrades absent decorations to null without losing the union", () => {
    expect(
      parseUnionDetail(detail({ countryName: null, sectorType: null, sectorLabel: null, ownerId: null })),
    ).toMatchObject({
      name: "Amalgamated Millhands",
      countryName: null,
      sectorType: null,
      sectorLabel: null,
      ownerId: null,
    });
    expect(
      parseUnionDetail(
        JSON.stringify({
          union: { id: HEX_ID, name: "Millhands", countryId: "US" },
          sectors: [],
        }),
      ),
    ).toMatchObject({
      name: "Millhands",
      electionOpen: null,
      suspended: null,
      members: null,
      approval: null,
      treasury: null,
      sectorCount: 0,
    });
    // Bargaining, dues, pension, and endorsement extras stay server-side:
    // they never surface on the summary even when present.
    const projected = parseUnionDetail(detail())!;
    expect(JSON.stringify(projected)).not.toMatch(/duesPerWorker|activeServices|pension|endorsement|bargaining/i);
  });

  it("fails closed on structural drift", () => {
    expect(parseUnionDetail("not json")).toBeNull();
    expect(parseUnionDetail(JSON.stringify({ union: null }))).toBeNull();
    expect(parseUnionDetail(JSON.stringify({}))).toBeNull();
    expect(parseUnionDetail(detail({ name: "" }))).toBeNull();
    expect(parseUnionDetail(detail({ name: "   " }))).toBeNull();
    expect(parseUnionDetail(detail({ countryId: 42 }))).toBeNull();
    expect(parseUnionDetail(detail({ id: "42" }))).toBeNull();
    expect(parseUnionDetail(detail({ members: "many" }))).toBeNull();
    expect(parseUnionDetail(detail({ members: -5 }))).toBeNull();
    expect(parseUnionDetail(detail({ approval: "high" }))).toBeNull();
    expect(parseUnionDetail(detail({ treasury: { amount: 1 } }))).toBeNull();
    expect(
      parseUnionDetail(
        JSON.stringify({
          union: { id: HEX_ID, name: "Millhands", countryId: "US" },
          sectors: { length: 3 },
        }),
      ),
    ).toBeNull();
    expect(
      parseUnionDetail(
        JSON.stringify({
          union: { id: HEX_ID, name: "Millhands", countryId: "US" },
        }),
      ),
    ).toBeNull();
    expect(parseUnionDetail(JSON.stringify({ error: "Union not found" }))).toBeNull();
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

describe("parseLogoutAck", () => {
  it("accepts the logout {ok:true} shape only", () => {
    expect(parseLogoutAck(JSON.stringify({ ok: true }))).toBe(true);
    expect(parseLogoutAck(JSON.stringify({ ok: false }))).toBe(false);
    // The mutation ack shape is not a logout ack: each endpoint keeps its
    // own contract.
    expect(parseLogoutAck(JSON.stringify({ success: true }))).toBe(false);
    expect(parseLogoutAck("junk")).toBe(false);
    expect(parseLogoutAck("")).toBe(false);
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

describe("validateExecuteArgs batch counts (#361)", () => {
  it("sends count only for batch runs of batchable types", () => {
    expect(validateExecuteArgs({ actionType: "fundraise", count: 5 })).toEqual({
      ok: true,
      body: { actionType: "fundraise", count: 5 },
    });
    expect(validateExecuteArgs({ actionType: "pollLarge", count: 10, targetState: "CA" })).toEqual({
      ok: true,
      body: { actionType: "pollLarge", count: 10, targetState: "CA" },
    });
    // Omitted or 1 stays a canonical single run: no count crosses the bridge.
    expect(validateExecuteArgs({ actionType: "campaign" })).toEqual({
      ok: true,
      body: { actionType: "campaign" },
    });
    expect(validateExecuteArgs({ actionType: "campaign", count: 1 })).toEqual({
      ok: true,
      body: { actionType: "campaign" },
    });
  });

  it("refuses batch runs for non-batchable types with the server refusal wording", () => {
    for (const args of [
      { actionType: "convertCash", count: 5 },
      { actionType: "convertCash", count: 10 },
      { actionType: "rest", count: 5 },
      { actionType: "debatePrep", count: 10 },
    ]) {
      const result = validateExecuteArgs(args);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("Batch execution is not available for this action.");
    }
  });

  it("refuses batch counts outside 1/5/10 and count mixed with a convert amount", () => {
    for (const count of [0, 2, 7, 100, "5", Number.NaN, null]) {
      expect(validateExecuteArgs({ actionType: "fundraise", count }).ok).toBe(false);
    }
    const mixed = validateExecuteArgs({ actionType: "fundraise", count: 5, convertAmount: 10 });
    expect(mixed.ok).toBe(false);
    // Single-run convert rules still hold.
    expect(validateExecuteArgs({ actionType: "convertCash", convertAmount: 250 })).toEqual({
      ok: true,
      body: { actionType: "convertCash", convertAmount: 250 },
    });
  });
});

describe("validateSnoozeMinutes (#361)", () => {
  it("defaults an omitted length to 720 and accepts the 5..10080 window", () => {
    expect(validateSnoozeMinutes(undefined)).toEqual({ ok: true, minutes: 720 });
    expect(validateSnoozeMinutes(5)).toEqual({ ok: true, minutes: 5 });
    expect(validateSnoozeMinutes(10080)).toEqual({ ok: true, minutes: 10080 });
  });

  it("rejects out-of-range, fractional, and non-numeric lengths", () => {
    for (const minutes of [0, 4, 10081, 1.5, Number.NaN, "60", null, {}]) {
      expect(validateSnoozeMinutes(minutes).ok, JSON.stringify(minutes)).toBe(false);
    }
  });
});

describe("validateNotificationPreference (#361)", () => {
  it("accepts mute/unmute with an allowlisted type", () => {
    expect(validateNotificationPreference({ action: "mute", type: "turn_advance" })).toEqual({
      ok: true,
      body: { action: "mute", type: "turn_advance" },
    });
    expect(validateNotificationPreference({ action: "unmute", type: "system" })).toEqual({
      ok: true,
      body: { action: "unmute", type: "system" },
    });
  });

  it("rejects preference snooze and unknown types before anything is sent", () => {
    expect(validateNotificationPreference({ action: "snooze", type: "system" }).ok).toBe(false);
    expect(validateNotificationPreference({ action: "mute", type: "nuke" }).ok).toBe(false);
    expect(validateNotificationPreference({ action: "mute", type: "" }).ok).toBe(false);
    expect(validateNotificationPreference({ action: null, type: "system" }).ok).toBe(false);
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

describe("parsePlayersOnline (#359 presence slice)", () => {
  it("projects the count and freshness timestamp", () => {
    expect(
      parsePlayersOnline(JSON.stringify({ online: 123, asOf: "2026-09-17T12:00:00.000Z" })),
    ).toEqual({ online: 123, asOf: "2026-09-17T12:00:00.000Z" });
    expect(parsePlayersOnline(JSON.stringify({ online: 0, asOf: "2026-09-17T12:00:00.000Z" }))).toEqual({
      online: 0,
      asOf: "2026-09-17T12:00:00.000Z",
    });
  });

  it("degrades a missing asOf to null without losing the count", () => {
    expect(parsePlayersOnline(JSON.stringify({ online: 7 }))).toEqual({ online: 7, asOf: null });
    expect(parsePlayersOnline(JSON.stringify({ online: 7, asOf: "" }))).toEqual({ online: 7, asOf: null });
  });

  it("fails closed on a drifting count instead of rendering a fabricated zero", () => {
    for (const bad of [
      JSON.stringify({ asOf: "2026-09-17T12:00:00.000Z" }),
      JSON.stringify({ online: "123", asOf: "2026-09-17T12:00:00.000Z" }),
      JSON.stringify({ online: 12.5 }),
      JSON.stringify({ online: -1 }),
      JSON.stringify({ online: null }),
      JSON.stringify({ error: "boom" }),
      "garbage",
      "[]",
    ]) {
      expect(parsePlayersOnline(bad)).toBeNull();
    }
  });
});

describe("formatTurnCountdown (#359 presence slice)", () => {
  const NOW = Date.parse("2026-09-17T12:00:00.000Z");
  const at = (ms: number) => new Date(NOW + ms).toISOString();

  it("matches the reference compact form for future deadlines", () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    try {
      expect(formatTurnCountdown(at(45 * 60 * 1000), false)).toBe("45m");
      expect(formatTurnCountdown(at((2 * 60 + 30) * 60 * 1000), false)).toBe("2h 30m");
      expect(formatTurnCountdown(at(26 * 60 * 60 * 1000), false)).toBe("1d 2h");
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("returns null instead of synthesizing when there is no usable schedule", () => {
    expect(formatTurnCountdown(null, false)).toBeNull();
    expect(formatTurnCountdown("", false)).toBeNull();
    expect(formatTurnCountdown("not-a-date", false)).toBeNull();
  });

  it("reports Paused while paused and Processing... once the deadline passes", () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    try {
      expect(formatTurnCountdown(at(30 * 60 * 1000), true)).toBe("Paused");
      expect(formatTurnCountdown(at(-60 * 1000), false)).toBe("Processing...");
    } finally {
      vi.restoreAllMocks();
    }
  });
});
