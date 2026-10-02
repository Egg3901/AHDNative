import { describe, expect, it } from "vitest";
import { createWorld, serializeSave } from "@ahdclient/engine";
import { GameSession } from "./session.js";

const STAMP = "2026-10-02T00:00:00.000Z";
const TERMS = { wageLevel: 1.1, agreementDurationTurns: 48, noStrikeTurns: 24 };
const UNION_ID = "US-manufacturing";
const EMPLOYER_ID = "US-manufacturing";

type SavedWorld = {
  meta: { turn: number };
  unions: Record<string, { strength?: number }>;
  unionOrganizers?: Record<string, { strength: number }>;
  bargainingCampaigns?: Record<string, {
    status: string;
    mandate: { leverage: number };
    escalationLevel: string;
    disputeStartedAtTurn?: number | null;
    endedAtTurn?: number;
  }>;
  regionalPoliticalMetrics?: Record<string, {
    values: Record<string, number>;
    labourResiduals?: Record<string, number>;
  }>;
  corporations?: Record<string, unknown>;
  corporateSectors?: Record<string, { strikeStartedAtTurn?: number | null }>;
};

function savedWorld(session: GameSession): SavedWorld {
  return JSON.parse(session.serialize(STAMP)).world as SavedWorld;
}

function countryRegionalValue(session: GameSession, regionId: string, path: string): number {
  const [category, id] = path.split(".");
  if (!category || !id) throw new Error(`invalid metric path ${path}`);
  const value = session.regions({ regionId }).selected?.politicalMetrics?.[path]?.value;
  if (typeof value !== "number") throw new Error(`no political board value for ${regionId} ${path}`);
  return value;
}

function organizeAndSeatPlayer(session: GameSession): void {
  for (let attempt = 0; attempt < 24; attempt++) {
    const strength = session.unionManagement().unions.find((row) => row.id === UNION_ID)?.strength ?? 0;
    if (strength >= 100) break;
    if (session.view().player.actions < 5) session.advance();
    session.organizeUnion(UNION_ID);
  }
  expect(session.unionManagement().unions.find((row) => row.id === UNION_ID)?.strength).toBeGreaterThanOrEqual(100);
  expect(session.castUnionLeadershipVote(UNION_ID).ok).toBe(true);
  expect(session.acceptUnionLeadership(UNION_ID)).toEqual({ ok: true, ownerType: "player", ownerId: "player" });

  const union = session.unionManagement().unions.find((row) => row.id === UNION_ID)!;
  expect(union.representedEmployerIds).toContain(EMPLOYER_ID);
  expect(session.setUnionDues(UNION_ID, 200).ok).toBe(true);
  session.advance();

  const local = session.unionManagement().unions.find((row) => row.id === UNION_ID)!
    .sectors.find((row) => row.corporationId === EMPLOYER_ID)!;
  for (let drive = 0; drive < 12 && local.unionization < 40; drive++) {
    if (session.view().player.actions < 1) session.advance();
    session.organizeUnionSector(UNION_ID, local.id);
  }
  expect(session.unionManagement().unions.find((row) => row.id === UNION_ID)!
    .sectors.find((row) => row.id === local.id)?.unionization).toBeGreaterThanOrEqual(40);
}

describe("#322 labour political feedback through the public saved session", () => {
  it("records an employer-countered dispute in both worker political leaves and resumes it", () => {
    const world = createWorld({ seed: "union-political-session-322", era: "1953", countryId: "US", playerName: "Alex" });
    // A public-action integration journey needs enough ordinary player AP to
    // complete the source-defined organizing and bargaining sequence.
    world.player.actions = 50;
    const session = new GameSession();
    session.load(serializeSave(world, STAMP));
    organizeAndSeatPlayer(session);

    // The control is an exact persisted twin immediately before the public
    // bargaining command; it follows the same ordinary turns without a case.
    const control = new GameSession();
    control.load(session.serialize(STAMP));
    const campaign = session.callUnionBargaining(UNION_ID, EMPLOYER_ID, TERMS);
    for (let turn = 0; turn < 4 && session.unionBargaining().campaigns
      .find((row) => row.id === campaign.id)?.currentOffer.proposedBy !== "employer"; turn++) {
      session.advance();
      control.advance();
    }
    expect(session.unionBargaining().campaigns.find((row) => row.id === campaign.id)?.currentOffer.proposedBy)
      .toBe("employer");

    // The public player leaves the employer's offer unanswered through the
    // authored deadline, allowing the ordinary turn flow to move it to dispute.
    for (let turn = 0; turn < 16 && session.unionBargaining().campaigns
      .find((row) => row.id === campaign.id)?.status !== "dispute"; turn++) {
      session.advance();
      control.advance();
    }
    const after = savedWorld(session);
    const afterControl = savedWorld(control);
    const settlement = after.bargainingCampaigns?.[campaign.id];
    expect(settlement?.status).toBe("dispute");

    const age = Math.max(0, after.meta.turn - (settlement?.disputeStartedAtTurn ?? after.meta.turn));
    const salience = 0.9 ** age;
    const severity = settlement?.escalationLevel === "industry_strike" ? 3
      : settlement?.escalationLevel === "selective_strike" ? 2.25
        : settlement?.escalationLevel === "overtime_ban" ? 1.5 : 1;
    const expectedWorkerSecurity = -0.75 * severity * salience;
    const expectedCivicLife = -0.4 * severity * salience;
    expect(after.regionalPoliticalMetrics?.CA?.labourResiduals?.["economy.workerSecurity"])
      .toBeCloseTo(expectedWorkerSecurity, 4);
    expect(after.regionalPoliticalMetrics?.CA?.labourResiduals?.["society.civicLife"])
      .toBeCloseTo(expectedCivicLife, 4);
    expect(countryRegionalValue(session, "CA", "economy.workerSecurity"))
      .toBeLessThan(countryRegionalValue(control, "CA", "economy.workerSecurity"));
    expect(countryRegionalValue(session, "CA", "society.civicLife"))
      .toBeLessThan(countryRegionalValue(control, "CA", "society.civicLife"));
    expect(afterControl.regionalPoliticalMetrics?.CA?.labourResiduals).toBeUndefined();
    expect(Object.values(after.corporateSectors ?? {}).every((asset) => asset.strikeStartedAtTurn == null)).toBe(true);
    expect(after.corporateSectors).toEqual(afterControl.corporateSectors);
    expect(after.corporations).toEqual(afterControl.corporations);

    const resumed = new GameSession();
    resumed.load(session.serialize(STAMP));
    expect(savedWorld(resumed).regionalPoliticalMetrics?.CA?.labourResiduals)
      .toEqual(after.regionalPoliticalMetrics?.CA?.labourResiduals);
    expect(countryRegionalValue(resumed, "CA", "economy.workerSecurity"))
      .toBe(countryRegionalValue(session, "CA", "economy.workerSecurity"));
    resumed.advance();
    session.advance();
    expect(savedWorld(resumed).regionalPoliticalMetrics?.CA?.values)
      .toEqual(savedWorld(session).regionalPoliticalMetrics?.CA?.values);
  }, 600_000);
});
