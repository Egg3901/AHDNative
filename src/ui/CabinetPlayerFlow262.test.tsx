import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GameSession } from "../game/session";
import { CabinetOfficePanel } from "./CabinetOfficePanel";

/**
 * Integrated cabinet/ministerial-order player flow (#262, remaining box).
 *
 * Every step travels the public player path, exactly as the reference
 * behaves at AHDGame e364c0495: a Head-of-State creation seats the player
 * as president (the nomination authority, matching the reference
 * `POST /api/whitehouse/cabinet/nominations` guard), the player sponsors
 * their own cabinet nomination through the public session command, engine
 * turn lifecycle confirms it into a real cabinetMembers row, and only then
 * does the cabinet destination admit issuing through the validated
 * `issueMinisterialOrder` command (reference
 * `POST /api/country/[code]/executive/cabinet/[positionId]/order` guard
 * order: country, position, order, target, holder-or-admin, action pool,
 * duplicate-active). Nothing here pushes member rows or orders into saves
 * by hand: a test that cannot reach the flow this way fails instead of
 * faking reachability.
 *
 * Seams: GameSession public boundary (create/act/advance/issueCabinetOrder/
 * cabinetOffice/view/serialize/load) and the CabinetOfficePanel props
 * (office/busy/notice/onIssue).
 */

const OPTIONS = {
  era: "1953",
  countryId: "US",
  seed: "native-cabinet-player-flow-262",
  playerName: "Alex",
  mode: "hos",
} as const;
const SAVED_AT = "2026-09-10T00:00:00.000Z";
const POSITION = "secretary_of_treasury";
const ORDER = "emergency_fiscal_stimulus";
const METRIC = "economic.unemploymentRate";

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
  window.dispatchEvent(new Event("resize"));
}

/** National metric value straight out of a public serialize snapshot. */
function metricOf(session: GameSession): number | undefined {
  const saved = JSON.parse(session.serialize(SAVED_AT)) as {
    world: { nationalMetrics: Record<string, Record<string, { value: number }>> };
  };
  return saved.world.nationalMetrics.US?.[METRIC]?.value;
}

/**
 * Seated-save supply: one session walks the genuine path (sponsor
 * self-nomination, then advance until engine lifecycle confirms it into a
 * real cabinetMembers row) and every slow case loads its own copy through
 * the public serialize/load path. Fails loudly when confirmation never
 * arrives (no save-seeding fallback).
 */
let seatedSave = "";
function seatedSession(): GameSession {
  if (!seatedSave) throw new Error("seated save was never produced: the confirmation case failed first");
  const session = new GameSession();
  session.load(seatedSave);
  return session;
}

afterEach(() => {
  cleanup();
  setViewport(1024, 768);
});

describe("cabinet ministerial-order player flow (#262)", () => {
  it("opens with presidential sponsorship and vacant offices refusing issue", () => {
    const session = new GameSession();
    session.create({ ...OPTIONS });

    // Navigation signals: no seat yet (drawer Government row stays hidden,
    // mirroring reference resolveCabinetOfficeNavEntry), but the president
    // holds the sponsorship surface.
    expect(session.view().cabinet).toBeNull();
    // The sponsorship surface rides the legislature view, which is what the
    // Legislature tab's NominationsPanel reads.
    const sponsor = session.view().legislature.cabinetSponsor;
    expect(sponsor?.available).toBe(true);
    expect(sponsor?.positions.find((entry) => entry.id === POSITION)).toMatchObject({
      vacant: true,
      available: true,
    });

    const office = session.cabinetOffice();
    expect(office.isExecutive).toBe(true);
    expect(office.positions.find((entry) => entry.id === POSITION)).toMatchObject({
      isVacant: true,
      holderName: null,
      canIssue: false,
      eligibilityReason: "No cabinet holder for this position",
    });

    // A vacant portfolio has no action pool to debit, so even the president
    // is refused without mutating anything.
    const refused = session.issueCabinetOrder({ positionId: POSITION, orderId: ORDER });
    expect(refused.result).toEqual({ ok: false, error: "No cabinet holder for this position" });
    expect(session.cabinetOffice().activeOrders).toEqual([]);
  });

  it("seats the sponsored player through engine confirmation", { timeout: 240_000 }, () => {
    const session = new GameSession();
    session.create({ ...OPTIONS });
    const sponsor = session.act("sponsorCabinetNomination", {
      countryId: "US",
      positionId: POSITION,
      nomineeId: "player",
    });
    expect(sponsor.ok).toBe(true);
    expect(sponsor.ok && sponsor.message).toContain("The Senate votes by turn 24");
    let seated = false;
    for (let i = 0; i < 25 && !seated; i++) {
      seated = !session.cabinetOffice().positions.find((entry) => entry.id === POSITION)?.isVacant;
      if (!seated) session.advance();
    }
    expect(seated).toBe(true);
    seatedSave = session.serialize(SAVED_AT);
  });

  it("issues, refuses, applies on turn, and survives reload", { timeout: 120_000 }, () => {
    const session = seatedSession();

    const seated = session.cabinetOffice();
    expect(seated.turn).toBe(24);
    expect(seated.positions.find((entry) => entry.id === POSITION)).toMatchObject({
      holderName: "Alex",
      isPlayerHolder: true,
      isVacant: false,
      actionsRemaining: 4,
      canIssue: true,
    });
    expect(session.view().cabinet).toEqual({
      positionId: POSITION,
      positionName: "Secretary of the Treasury",
    });
    const catalog = seated.positions.find((entry) => entry.id === POSITION)!
      .orders.find((order) => order.id === ORDER)!;
    expect(catalog.available).toBe(true);
    const duration = catalog.duration;

    // Issue the supported order through the public command.
    const issued = session.issueCabinetOrder({ positionId: POSITION, orderId: ORDER });
    expect(issued.result.ok).toBe(true);
    expect(issued.result.ok && issued.result.message).toContain("ministerial actions remaining");
    const live = session.cabinetOffice();
    expect(live.activeOrders).toHaveLength(1);
    expect(live.activeOrders[0]).toMatchObject({
      positionId: POSITION,
      orderId: ORDER,
      orderName: "Emergency Fiscal Stimulus",
      targetRegionId: null,
      expiresTurn: 24 + duration,
      turnsRemaining: duration,
    });
    expect(live.positions.find((entry) => entry.id === POSITION)).toMatchObject({
      actionsRemaining: 3,
      canIssue: true,
    });

    // Reject a duplicate of the live supported order without debiting again.
    const duplicate = session.issueCabinetOrder({ positionId: POSITION, orderId: ORDER });
    expect(duplicate.result).toEqual({ ok: false, error: "This order is already active for this position" });
    expect(session.cabinetOffice().activeOrders).toHaveLength(1);
    expect(
      session.cabinetOffice().positions.find((entry) => entry.id === POSITION)?.actionsRemaining,
    ).toBe(3);

    // Reject an unknown order without mutating orders or the action pool.
    const invalid = session.issueCabinetOrder({ positionId: POSITION, orderId: "no_such_order" });
    expect(invalid.result).toEqual({ ok: false, error: "Invalid order ID" });
    expect(
      session.cabinetOffice().positions.find((entry) => entry.id === POSITION)?.actionsRemaining,
    ).toBe(3);

    // The next turn applies the issued order to the real metric.
    const metricBefore = metricOf(session);
    expect(Number.isFinite(metricBefore)).toBe(true);
    session.advance();
    const applied = session.cabinetOffice();
    expect(applied.turn).toBe(25);
    expect(applied.activeOrders).toHaveLength(1);
    expect(applied.activeOrders[0]).toMatchObject({
      expiresTurn: 24 + duration,
      turnsRemaining: duration - 1,
    });
    const saved = JSON.parse(session.serialize(SAVED_AT)) as {
      world: { ministerialOrders: Array<{ orderId?: string; lastAppliedTurn?: number }> };
    };
    expect(saved.world.ministerialOrders.find((order) => order.orderId === ORDER)?.lastAppliedTurn).toBe(25);
    expect(metricOf(session)!).toBeLessThan(metricBefore!);

    // Save/reload preserves the seat, the pool, and the live order.
    const before = session.cabinetOffice();
    const resumed = new GameSession();
    resumed.load(session.serialize(SAVED_AT));
    expect(resumed.cabinetOffice()).toEqual(before);
    expect(resumed.view().cabinet).toEqual(session.view().cabinet);
  });

  // No regional-target case here: the US order catalog carries no
  // regional-scope orders (regional orders exist for UK/DD/IE portfolios),
  // so there is no genuine US player path that reaches "Select a target
  // region". Target selection stays covered by the accepted destination
  // slice's panel tests. Asserting it here would require seeding a
  // non-catalog order, which this file refuses to do.

  describe.each([
    { width: 320, height: 568 },
    { width: 390, height: 844 },
  ])("rendered cabinet destination at $width px", ({ width, height }) => {
    it("keeps the live issue flow mounted and visible", async () => {
      const user = userEvent.setup();
      setViewport(width, height);
      const office = seatedSession().cabinetOffice();
      expect(
        office.positions.find((entry) => entry.id === POSITION)?.canIssue,
      ).toBe(true);

      render(<CabinetOfficePanel office={office} busy={false} notice={null} onIssue={vi.fn()} />);

      expect(screen.getByRole("heading", { name: "Cabinet office" })).toBeVisible();
      expect(screen.getByRole("combobox", { name: "Cabinet office" })).toBeVisible();
      await user.selectOptions(
        screen.getByRole("combobox", { name: "Cabinet office" }),
        POSITION,
      );
      expect(screen.getByRole("combobox", { name: "Ministerial order" })).toBeVisible();
      expect(screen.getByRole("button", { name: "Issue ministerial order" })).toBeVisible();
      expect(screen.getByText(/Alex.*4 ministerial actions remaining/)).toBeVisible();
      expect(screen.getByRole("heading", { name: "Active orders" })).toBeVisible();
    });
  });
});
