import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

const OPTIONS = { era: "1953", countryId: "US", seed: "native-cabinet-office-v1", playerName: "Alex" };
const POSITION = "secretary_of_treasury";
const ORDER = "emergency_fiscal_stimulus";

function holder(overrides: Record<string, unknown> = {}) {
  return {
    countryId: "US",
    positionId: POSITION,
    characterId: "player",
    characterName: "Alex",
    partyId: "US_DEM",
    appointedBy: null,
    appointedAtTurn: 0,
    confirmedAtTurn: 0,
    ministerialActions: 4,
    lastMinisterialActionRefillTurn: 0,
    ...overrides,
  };
}

/** Seats cabinet/executive rows through the public save/load path. */
function seat(session: GameSession, member: Record<string, unknown>, presidentId?: string) {
  const saved = JSON.parse(session.serialize("2026-09-10T00:00:00.000Z")) as {
    world: { cabinetMembers: unknown[]; executives: Record<string, unknown> };
  };
  saved.world.cabinetMembers.push(member);
  if (presidentId) {
    saved.world.executives.US = {
      countryId: "US",
      presidentId,
      presidentParty: null,
      termStartTurn: 0,
      vicePresidentId: null,
      vicePresidentParty: null,
    };
  }
  session.load(JSON.stringify(saved));
}

describe("cabinet office session", () => {
  it("projects vacant offices with eligibility refusals and region options", () => {
    const session = new GameSession();
    session.create(OPTIONS);
    const office = session.cabinetOffice();
    expect(office).toMatchObject({ countryId: "US", turn: 0, isExecutive: false, activeOrders: [] });
    expect(office.positions.length).toBeGreaterThan(0);
    expect(office.regions.length).toBeGreaterThan(0);
    for (const position of office.positions) {
      expect(position).toMatchObject({
        isVacant: true,
        holderName: null,
        canIssue: false,
        eligibilityReason: "No cabinet holder for this position",
      });
    }
  });

  it("issues a held order, debiting one action and projecting the live order", () => {
    const session = new GameSession();
    session.create(OPTIONS);
    seat(session, holder());

    const before = session.cabinetOffice();
    const position = before.positions.find((entry) => entry.id === POSITION)!;
    expect(position).toMatchObject({ canIssue: true, actionsRemaining: 4 });
    expect(position.orders.some((order) => order.id === ORDER && order.available)).toBe(true);

    const { result, view } = session.issueCabinetOrder({ positionId: POSITION, orderId: ORDER });
    expect(result).toEqual({
      ok: true,
      message: expect.stringContaining("Emergency Fiscal Stimulus"),
    });
    expect(view.turn).toBe(0);

    const after = session.cabinetOffice();
    expect(after.activeOrders).toHaveLength(1);
    expect(after.activeOrders[0]).toMatchObject({
      positionId: POSITION,
      orderId: ORDER,
      orderName: "Emergency Fiscal Stimulus",
      targetRegionId: null,
      turnsRemaining: 24,
    });
    expect(after.positions.find((entry) => entry.id === POSITION)).toMatchObject({
      actionsRemaining: 3,
      canIssue: true,
    });
  });

  it("refuses a duplicate order without debiting another action", () => {
    const session = new GameSession();
    session.create(OPTIONS);
    seat(session, holder());

    expect(session.issueCabinetOrder({ positionId: POSITION, orderId: ORDER }).result.ok).toBe(true);
    const refused = session.issueCabinetOrder({ positionId: POSITION, orderId: ORDER });
    expect(refused.result).toEqual({ ok: false, error: "This order is already active for this position" });

    const office = session.cabinetOffice();
    expect(office.activeOrders).toHaveLength(1);
    expect(office.positions.find((entry) => entry.id === POSITION)?.actionsRemaining).toBe(3);
    expect(office.positions.find((entry) => entry.id === POSITION)?.orders
      .find((order) => order.id === ORDER)).toMatchObject({ alreadyActive: true, available: false });
  });

  it("refuses callers who are neither the holder nor the sitting executive", () => {
    const session = new GameSession();
    session.create(OPTIONS);
    seat(session, holder({ characterId: "npc-treasurer", characterName: "Npc Treasurer" }));

    const office = session.cabinetOffice();
    expect(office.isExecutive).toBe(false);
    const refused = session.issueCabinetOrder({ positionId: POSITION, orderId: ORDER });
    expect(refused.result).toEqual({ ok: false, error: "Only the cabinet holder or admin can issue orders" });
    expect(session.cabinetOffice().activeOrders).toEqual([]);
  });

  it("lets the sitting executive issue for an NPC-held portfolio", () => {
    const session = new GameSession();
    session.create(OPTIONS);
    seat(session, holder({ characterId: "npc-treasurer", characterName: "Npc Treasurer" }), "player");

    expect(session.cabinetOffice().isExecutive).toBe(true);
    const { result } = session.issueCabinetOrder({ positionId: POSITION, orderId: ORDER });
    expect(result.ok).toBe(true);
    expect(session.cabinetOffice().activeOrders).toHaveLength(1);
  });

  it("refuses unknown orders without mutation", () => {
    const session = new GameSession();
    session.create(OPTIONS);
    seat(session, holder());

    const refused = session.issueCabinetOrder({ positionId: POSITION, orderId: "no_such_order" });
    expect(refused.result).toEqual({ ok: false, error: "Invalid order ID" });
    expect(session.cabinetOffice().activeOrders).toEqual([]);
    expect(session.cabinetOffice().positions.find((entry) => entry.id === POSITION)?.actionsRemaining).toBe(4);
  });
});
