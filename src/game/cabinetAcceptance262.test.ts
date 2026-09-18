import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

/**
 * Acceptance slice for #262 (cabinet/ministerial-order player flow).
 *
 * Uses the real GameSession/engine projection end to end: one executable
 * order through dispatch and result, one invalid order target refused with
 * resources and state unchanged, turn application of the issued order, and
 * save/serialize/reload preserving the cabinet and order state. The
 * production slice already projects executable orders and structured
 * refusal/result states, so this file adds coverage only, no mechanics.
 */

const OPTIONS = {
  era: "1953",
  countryId: "US",
  seed: "native-cabinet-acceptance-262",
  playerName: "Alex",
};
const POSITION = "secretary_of_treasury";
const ORDER = "emergency_fiscal_stimulus";
const METRIC = "economic.unemploymentRate";

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

interface SavedWorld {
  world: {
    cabinetMembers: unknown[];
    executives: Record<string, unknown>;
    ministerialOrders: Array<{
      id: string;
      orderId?: string;
      lastAppliedTurn?: number;
    }>;
    nationalMetrics: Record<string, Record<string, { value: number }>>;
  };
}

/** Seats cabinet/executive rows through the public save/load path. */
function seat(session: GameSession, member: Record<string, unknown>) {
  const saved = JSON.parse(
    session.serialize("2026-09-10T00:00:00.000Z"),
  ) as SavedWorld;
  saved.world.cabinetMembers.push(member);
  session.load(JSON.stringify(saved));
}

function readSave(session: GameSession): SavedWorld {
  return JSON.parse(
    session.serialize("2026-09-10T00:00:00.000Z"),
  ) as SavedWorld;
}

function seated(): GameSession {
  const session = new GameSession();
  session.create(OPTIONS);
  seat(session, holder());
  return session;
}

describe("cabinet ministerial-order acceptance (#262)", () => {
  it("dispatches one executable order and reports the structured result", () => {
    const session = seated();

    const { result } = session.issueCabinetOrder({
      positionId: POSITION,
      orderId: ORDER,
    });
    expect(result).toEqual({
      ok: true,
      message: expect.stringContaining("Emergency Fiscal Stimulus"),
    });
    expect(result.ok && result.message).toContain(
      "ministerial actions remaining",
    );

    const office = session.cabinetOffice();
    expect(office.activeOrders).toHaveLength(1);
    expect(office.activeOrders[0]).toMatchObject({
      positionId: POSITION,
      orderId: ORDER,
      orderName: "Emergency Fiscal Stimulus",
      targetRegionId: null,
      expiresTurn: 24,
      turnsRemaining: 24,
    });
    expect(
      office.positions.find((entry) => entry.id === POSITION),
    ).toMatchObject({
      actionsRemaining: 3,
      canIssue: true,
    });
  });

  it("refuses an invalid order target with resources and state unchanged", () => {
    const session = seated();
    const before = readSave(session);
    const ordersBefore = before.world.ministerialOrders.length;

    const refused = session.issueCabinetOrder({
      positionId: POSITION,
      orderId: "no_such_order",
    });
    expect(refused.result).toEqual({ ok: false, error: "Invalid order ID" });

    const office = session.cabinetOffice();
    expect(office.activeOrders).toEqual([]);
    expect(
      office.positions.find((entry) => entry.id === POSITION),
    ).toMatchObject({
      actionsRemaining: 4,
      canIssue: true,
    });
    expect(readSave(session).world.ministerialOrders).toHaveLength(
      ordersBefore,
    );
  });

  it("applies the issued order on the next turn", () => {
    const session = seated();
    expect(
      session.issueCabinetOrder({ positionId: POSITION, orderId: ORDER }).result
        .ok,
    ).toBe(true);
    // The engine seeds an empty nationalMetrics map; the order phase reads a
    // missing row as 50, so mirror that default here.
    const metricBefore =
      readSave(session).world.nationalMetrics.US?.[METRIC]?.value ?? 50;

    session.advance();

    const office = session.cabinetOffice();
    expect(office.turn).toBe(1);
    expect(office.activeOrders).toHaveLength(1);
    expect(office.activeOrders[0]).toMatchObject({
      positionId: POSITION,
      orderId: ORDER,
      expiresTurn: 24,
      turnsRemaining: 23,
    });
    const saved = readSave(session);
    const issued = saved.world.ministerialOrders.find(
      (order) => order.orderId === ORDER,
    );
    expect(issued?.lastAppliedTurn).toBe(1);
    const metricAfter = saved.world.nationalMetrics.US?.[METRIC]?.value;
    expect(metricAfter).toBeLessThan(metricBefore);
    expect(
      office.positions.find((entry) => entry.id === POSITION)?.actionsRemaining,
    ).toBe(3);
  });

  it("preserves cabinet and order state across save/reload", () => {
    const session = seated();
    expect(
      session.issueCabinetOrder({ positionId: POSITION, orderId: ORDER }).result
        .ok,
    ).toBe(true);
    const before = session.cabinetOffice();

    const resumed = new GameSession();
    resumed.load(session.serialize("2026-09-10T00:00:00.000Z"));
    const after = resumed.cabinetOffice();

    expect(after).toEqual(before);
    expect(after.activeOrders).toHaveLength(1);
    expect(after.activeOrders[0]).toMatchObject({
      positionId: POSITION,
      orderId: ORDER,
      orderName: "Emergency Fiscal Stimulus",
      expiresTurn: 24,
      turnsRemaining: 24,
    });
    expect(
      after.positions.find((entry) => entry.id === POSITION),
    ).toMatchObject({
      holderName: "Alex",
      isPlayerHolder: true,
      isVacant: false,
      actionsRemaining: 3,
    });
  });
});
