import { describe, expect, it } from "vitest";
import { appendFileSync } from "node:fs";
import { corporateSectorAssets, createWorld, deserializeSave } from "@ahdclient/engine";
import { GameSession } from "./session";

const UNION_ID = "UK-manufacturing";
const STAMP = "2026-10-03T00:00:00Z";
const TERMS = { wageLevel: 1.5, agreementDurationTurns: 48, noStrikeTurns: 24 };
let session = new GameSession();
let employerId: string;
let scottishLocalId: string;
let resourceTurns = 0;

function savedWorld() {
  return JSON.parse(session.serialize(STAMP)).world as ReturnType<typeof createWorld>;
}

function unionRow() {
  return session.unionManagement().unions.find((row) => row.id === UNION_ID)!;
}

function earnActions(minimum: number) {
  while (session.view().player.actions < minimum) {
    expect(resourceTurns++).toBeLessThan(40);
    session.advance();
  }
}

function sourceFormulaGrievance(world: ReturnType<typeof createWorld>, employer: string) {
  const locals = Object.values(corporateSectorAssets(world)).filter(
    (asset) => asset.countryId === "UK" && asset.sectorType === "manufacturing" && asset.corporationId === employer,
  );
  const workers = locals.reduce((sum, local) => sum + Math.max(0, local.workers), 0);
  const weighted = locals.reduce((sum, local) => {
    const rawCost = local.stateId ? world.regionalMetrics[local.stateId]?.["economic.costOfLiving"]?.value : undefined;
    const cost = typeof rawCost === "number" && Number.isFinite(rawCost) && rawCost > 0 ? rawCost : 100;
    const realWage = Math.max(0.8, local.wageLevel ?? 1) / (cost / 100);
    const expectation = local.workerExpectationIndex ?? realWage;
    const relativeGap = Math.max(0, expectation - realWage) / Math.max(0.8, realWage);
    return sum + Math.min(100, Math.max(0, relativeGap * 400)) * Math.max(0, local.workers);
  }, 0);
  return workers > 0 ? Math.round((weighted / workers) * 10) / 10 : 0;
}

function recordPublicOracleInput(
  world: ReturnType<typeof createWorld>,
  employer: string,
  campaign: ReturnType<GameSession["callUnionBargaining"]>,
) {
  const tracePath = process.env.AHD_COL_ORACLE_TRACE;
  if (!tracePath) return;
  const union = world.unions[UNION_ID]!;
  const density = Math.max(0, Math.min(100, union.unionization ?? 0));
  const locals = Object.values(corporateSectorAssets(world))
    .filter((asset) => asset.countryId === "UK" && asset.sectorType === "manufacturing" && asset.corporationId === employer)
    .map((local) => ({
      stateId: local.stateId ?? null,
      workers: local.workers ?? 0,
      unionization: local.unionization ?? density,
      wageLevel: local.wageLevel ?? 1,
      workerExpectationIndex: local.workerExpectationIndex,
      costOfLivingIndex: local.stateId
        ? world.regionalMetrics[local.stateId]?.["economic.costOfLiving"]?.value
        : undefined,
    }));
  const strikeCost = locals.filter((local) => local.unionization >= 30).length * 400;
  appendFileSync(tracePath, `${JSON.stringify({
    label: "earned-public-UK-session",
    inputs: {
      locals,
      // These are the exact Native macro inputs recorded on the public
      // campaign mandate. Their upstream economic-mode parity is out of scope.
      laborTightness: campaign.mandate.laborTightness,
      lawSupport: campaign.mandate.lawSupport,
      treasury: union.treasury,
      strikeCost,
    },
    nativeOutput: campaign.mandate,
  })}\n`);
}

describe.sequential("UK cost-of-living bargaining through the public GameSession journey", () => {
  it("earns leadership, sets dues, and organizes an authored Scotland local", () => {
    session.create({
      seed: "uk-col-bargaining-public-journey",
      playerName: "Alex",
      countryId: "UK",
      era: "1953",
      creation: {
        name: "Alex",
        homeRegionId: "SCO",
        partyId: null,
        stats: { charisma: 4, debate: 4, energy: 4, fundraising: 4, businessAcumen: 4, statecraft: 4, intellect: 4 },
        policies: { economic: 0, social: 0 },
        demographics: { race: "white", gender: "male", education: "college", wealth: "middle" },
      },
    });
    const initial = savedWorld();
    expect(initial.regionalMetrics.SCO?.["economic.costOfLiving"]?.value).toBeGreaterThan(100);
    const scottishLocal = Object.values(corporateSectorAssets(initial)).find(
      (asset) => asset.countryId === "UK" && asset.sectorType === "manufacturing" && asset.stateId === "SCO",
    );
    expect(scottishLocal).toBeDefined();
    employerId = scottishLocal!.corporationId;
    scottishLocalId = scottishLocal!.id;

    for (let drive = 0; drive < 40 && !unionRow().electionOpen; drive++) {
      earnActions(5);
      session.organizeUnion(UNION_ID);
    }
    expect(unionRow().electionOpen).toBe(true);
    expect(session.castUnionLeadershipVote(UNION_ID)).toMatchObject({ ok: true, pendingLeaderCharacterId: "player" });
    expect(session.acceptUnionLeadership(UNION_ID)).toMatchObject({ ok: true, ownerType: "player", ownerId: "player" });
    expect(session.setUnionDues(UNION_ID, Math.min(100, unionRow().maxDuesPerWorkerAnnual)).ok).toBe(true);
    const beforeDues = unionRow().treasury;
    session.advance();
    expect(unionRow().treasury).toBeGreaterThan(beforeDues);

    const target = unionRow().sectors.find((sector) => sector.id === scottishLocalId)!;
    expect(target).toBeDefined();
    for (let drive = 0; drive < 50; drive++) {
      const current = unionRow().sectors.find((sector) => sector.id === target.id)!;
      if (current.unionization >= 99 && current.representingUnionId === UNION_ID) break;
      earnActions(1);
      while (unionRow().treasury < unionRow().sectors.find((sector) => sector.id === target.id)!.treasuryCost) {
        expect(resourceTurns++).toBeLessThan(40);
        session.advance();
      }
      const actionsBeforeDrive = session.view().player.actions;
      const treasuryBeforeDrive = unionRow().treasury;
      session.organizeUnionSector(UNION_ID, target.id);
      expect(session.view().player.actions).toBe(actionsBeforeDrive - 1);
      expect(unionRow().treasury).toBeLessThan(treasuryBeforeDrive);
    }
    const scottish = unionRow().sectors.find((sector) => sector.id === scottishLocalId)!;
    expect(scottish.unionization).toBeGreaterThanOrEqual(99);
    expect(scottish.representingUnionId).toBe(UNION_ID);
  }, 120_000);

  it("earns employer-wide member support with further paid organizing", () => {
    // The claim is employer-wide. The Scottish shop alone does not supply
    // enough worker-weighted support when the issuer has a larger local.
    const target = unionRow().sectors
      .filter((sector) => sector.corporationId === employerId)
      .sort((a, b) => b.workers - a.workers)[0]!;
    expect(target).toBeDefined();
    for (let drive = 0; drive < 50; drive++) {
      const current = unionRow().sectors.find((sector) => sector.id === target.id)!;
      if (current.unionization >= 50 && current.representingUnionId === UNION_ID) break;
      earnActions(1);
      while (unionRow().treasury < unionRow().sectors.find((sector) => sector.id === target.id)!.treasuryCost) {
        expect(resourceTurns++).toBeLessThan(40);
        session.advance();
      }
      const actionsBeforeDrive = session.view().player.actions;
      const treasuryBeforeDrive = unionRow().treasury;
      session.organizeUnionSector(UNION_ID, target.id);
      expect(session.view().player.actions).toBe(actionsBeforeDrive - 1);
      expect(unionRow().treasury).toBeLessThan(treasuryBeforeDrive);
    }
    const organized = unionRow().sectors.find((sector) => sector.id === target.id)!;
    expect(organized.unionization).toBeGreaterThanOrEqual(50);
    expect(organized.representingUnionId).toBe(UNION_ID);
  }, 120_000);

  it("advances an ordinary turn and reloads the persisted Scotland metric", () => {
    session.advance();
    const saved = session.serialize(STAMP);
    const persisted = deserializeSave(saved);
    const scotlandCost = persisted.regionalMetrics.SCO?.["economic.costOfLiving"]?.value;
    expect(scotlandCost).toBeGreaterThan(100);
    const reloaded = new GameSession();
    reloaded.load(saved);
    expect(reloaded.serialize(STAMP)).toBe(saved);
    session = reloaded;
  }, 120_000);

  it("calls bargaining through the public session from the saved earned union", () => {
    const persisted = savedWorld();
    const campaign = session.callUnionBargaining(UNION_ID, employerId, TERMS);
    expect(campaign.status).toBe("negotiating");
    expect(campaign.mandate.grievance).toBe(sourceFormulaGrievance(persisted, employerId));
    recordPublicOracleInput(persisted, employerId, campaign);
    const savedAfterCall = session.serialize(STAMP);
    const restored = new GameSession();
    restored.load(savedAfterCall);
    expect(restored.unionBargaining().campaigns[0]?.mandate).toEqual(campaign.mandate);
    expect(restored.serialize(STAMP)).toBe(savedAfterCall);
  }, 120_000);
});
