import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { corporateSectorAssets } from "./corporateSectorAssets.js";
import {
  labourFactorsForCorporation,
  loadCorporationLabourState,
  stepCorporateSectorStrikes,
} from "./corporationLabour.js";
import { corporationTurnPhase, runCorporationTurn } from "./corporationTurn.js";
import {
  moveBargainingCampaignAsUnion,
  openBargainingCampaignAction,
  answerBargainingCampaignAsEmployer,
  settleBargainingCampaignDirect,
} from "../unions/actions.js";
import { processLabourRelationsTurn } from "../unions/labourRelationsTurn.js";
import { STRIKE_COOLDOWN_TURNS } from "../unions/bargaining.js";
import type { WorldState } from "../types.js";

const WORLD = { seed: "corporation-labour-322", playerName: "Tester", countryId: "US", era: "1953" } as const;
const UNION = "US-manufacturing";
const EMPLOYER = "US-manufacturing";
const TERMS = { wageLevel: 1.1, agreementDurationTurns: 48, noStrikeTurns: 24 };

function shopWorld() {
  const world = createWorld(WORLD);
  const union = world.unions[UNION]!;
  union.treasury = 5000;
  union.unionization = 100;
  const assets = corporateSectorAssets(world);
  const asset = Object.values(assets).find((candidate) => candidate.corporationId === EMPLOYER)!;
  asset.unionization = 100;
  return { world, union, asset };
}

/** Open, dispute, and climb to a selective strike; returns the campaign id and strike turn. */
function strikeWorld(strikeTurn = 3) {
  const { world, union, asset } = shopWorld();
  const opened = openBargainingCampaignAction(world, { unionId: UNION, employerCorporationId: EMPLOYER, terms: TERMS, turn: 0 });
  answerBargainingCampaignAsEmployer(world, { campaignId: opened.id, action: "reject", turn: 1 });
  moveBargainingCampaignAsUnion(world, { campaignId: opened.id, action: "escalate", turn: 2 });
  moveBargainingCampaignAsUnion(world, { campaignId: opened.id, action: "escalate", turn: strikeTurn });
  return { world, union, asset, campaignId: opened.id };
}

describe("#322 corporation labour factors", () => {
  it("reads exactly idle factors on a world with no live action", () => {
    const { world } = shopWorld();
    const labour = loadCorporationLabourState(world, 0);
    for (const corpId of Object.keys(world.corporations)) {
      expect(labourFactorsForCorporation(world, corpId, labour)).toEqual({
        outputFactor: 1,
        marginModifierPP: 0,
        strikeActive: false,
      });
    }
  });

  it("throttles a striking asset 0.25 with a -8pp margin hit, and bans 0.96", () => {
    const { world, asset } = strikeWorld();
    expect(asset.strikeStartedAtTurn).toBe(3);
    const labour = loadCorporationLabourState(world, 3);
    expect(labourFactorsForCorporation(world, EMPLOYER, labour)).toEqual({
      outputFactor: 0.75,
      marginModifierPP: -8,
      strikeActive: true,
    });
    // Other corporations are untouched by this employer's strike.
    const other = Object.keys(world.corporations).find((id) => id !== EMPLOYER)!;
    expect(labourFactorsForCorporation(world, other, labour).strikeActive).toBe(false);
  });

  it("applies the overtime-ban factor without a margin hit", () => {
    const { world } = shopWorld();
    const opened = openBargainingCampaignAction(world, { unionId: UNION, employerCorporationId: EMPLOYER, terms: TERMS, turn: 0 });
    answerBargainingCampaignAsEmployer(world, { campaignId: opened.id, action: "reject", turn: 1 });
    moveBargainingCampaignAsUnion(world, { campaignId: opened.id, action: "escalate", turn: 2 });
    const labour = loadCorporationLabourState(world, 2);
    expect(labourFactorsForCorporation(world, EMPLOYER, labour)).toEqual({
      outputFactor: 0.96,
      marginModifierPP: 0,
      strikeActive: false,
    });
  });

  it("suppresses the strike hit under an active no-strike agreement", () => {
    const { world, asset } = strikeWorld();
    settleBargainingCampaignDirect(world, Object.keys(world.bargainingCampaigns ?? {})[0]!, "employer", 4);
    // The asset still carries the strike marker, but the agreement (no-strike
    // through turn 4 + 24) protects it.
    expect(asset.strikeStartedAtTurn).toBe(3);
    const labour = loadCorporationLabourState(world, 4);
    expect(labour.noStrikeProtectedSectorIds.has(asset.id)).toBe(true);
    expect(labourFactorsForCorporation(world, EMPLOYER, labour)).toEqual({
      outputFactor: 1,
      marginModifierPP: 0,
      strikeActive: false,
    });
  });

  it("fails closed on corrupt bargaining rows and never materializes absent maps", () => {
    const { world } = shopWorld();
    expect(world.bargainingCampaigns).toBeUndefined();
    loadCorporationLabourState(world, 0);
    expect(world.bargainingCampaigns).toBeUndefined();
    expect(world.collectiveAgreements).toBeUndefined();
    world.bargainingCampaigns = { "bogus": { id: "other" } as never };
    expect(() => loadCorporationLabourState(world, 0)).toThrow();
  });
});

describe("#322 exactly-once economic damage", () => {
  it("applies the strike throttle once per turn at the corporation phase", () => {
    const struck = strikeWorld().world;
    const idle = strikeWorld().world;
    // Disarm the idle twin's strike marker without touching anything else.
    const idleAssets = corporateSectorAssets(idle);
    const idleAsset = Object.values(idleAssets).find((candidate) => candidate.corporationId === EMPLOYER)!;
    idleAsset.strikeStartedAtTurn = null;
    idleAsset.workerExpectationIndex = null;

    corporationTurnPhase.run(struck);
    corporationTurnPhase.run(idle);
    const hit = struck.corporations[EMPLOYER]!.revenue;
    const base = idle.corporations[EMPLOYER]!.revenue;
    // Once: 0.75. Twice would read 0.5625.
    expect(hit).toBeCloseTo(base * 0.75, 6);
    expect(hit / base).toBeGreaterThan(0.6);
    expect(struck.corporations[EMPLOYER]!.effectiveProfitMargin).toBeCloseTo(
      idle.corporations[EMPLOYER]!.effectiveProfitMargin - 8,
      6,
    );
  });

  it("matches one direct runCorporationTurn application, and the unions pass adds none", () => {
    const { world } = strikeWorld();
    const corpId = EMPLOYER;
    const taxRate = 35;
    const clone = structuredClone(world.corporations[corpId]!);
    const labour = loadCorporationLabourState(world, 3);
    runCorporationTurn(clone, taxRate, labourFactorsForCorporation(world, corpId, labour));
    corporationTurnPhase.run(world);
    // The phase uses the country's configured rate; revenue must still carry
    // exactly one 0.75 application relative to an unstruck twin.
    const twin = strikeWorld().world;
    const twinAssets = corporateSectorAssets(twin);
    const twinAsset = Object.values(twinAssets).find((candidate) => candidate.corporationId === EMPLOYER)!;
    twinAsset.strikeStartedAtTurn = null;
    twinAsset.workerExpectationIndex = null;
    corporationTurnPhase.run(twin);
    expect(world.corporations[corpId]!.revenue).toBeCloseTo(twin.corporations[corpId]!.revenue * 0.75, 6);
    expect(clone.revenue).toBeGreaterThan(0);

    const revenueBefore = world.corporations[corpId]!.revenue;
    processLabourRelationsTurn(world, 4);
    expect(world.corporations[corpId]!.revenue).toBe(revenueBefore);
  });
});

describe("#322 strike resolution through the corporation turn", () => {
  it("waits out a held strike after 4 turns with the +10 density bump capped at 100", () => {
    const { world, asset } = strikeWorld(3);
    asset.unionization = 95;
    const labour = () => loadCorporationLabourState(world, world.meta.turn);
    let result = stepCorporateSectorStrikes(world, 3, labour());
    expect(asset.strikeStartedAtTurn).toBe(3);
    result = stepCorporateSectorStrikes(world, 4, labour());
    expect(result.resolvedWaitout).toBe(0);
    result = stepCorporateSectorStrikes(world, 7, labour());
    expect(result.resolvedWaitout).toBe(1);
    expect(asset.strikeStartedAtTurn).toBeNull();
    expect(asset.strikeCooldownUntilTurn).toBe(7 + STRIKE_COOLDOWN_TURNS);
    expect(asset.unionization).toBe(100);
  });

  it("concedes when withdraw restores expectations, and clears on agreement", () => {
    const { world, asset, campaignId } = strikeWorld(3);
    moveBargainingCampaignAsUnion(world, { campaignId, action: "withdraw", turn: 4 });
    const result = stepCorporateSectorStrikes(world, 4, loadCorporationLabourState(world, 4));
    expect(result.resolvedConcession).toBe(1);
    expect(asset.strikeStartedAtTurn).toBeNull();
  });

  it("resolves a striking asset as agreement-protected once the settlement lands", () => {
    const { world, asset, campaignId } = strikeWorld(3);
    settleBargainingCampaignDirect(world, campaignId, "employer", 4);
    const result = stepCorporateSectorStrikes(world, 4, loadCorporationLabourState(world, 4));
    expect(result.resolvedAgreement).toBe(1);
    expect(asset.strikeStartedAtTurn).toBeNull();
    // The margin penalty is transient: it leaves with the strike.
    expect(labourFactorsForCorporation(world, EMPLOYER, loadCorporationLabourState(world, 4))).toEqual({
      outputFactor: 1,
      marginModifierPP: 0,
      strikeActive: false,
    });
  });

  it("resolves a strike as banned when the representing union is suspended", () => {
    const { world, asset, union } = strikeWorld(3);
    union.suspended = true;
    const result = stepCorporateSectorStrikes(world, 4, loadCorporationLabourState(world, 4));
    expect(result.resolvedBanned).toBe(1);
    expect(asset.strikeStartedAtTurn).toBeNull();
  });

  it("never manufactures a strike on an idle asset", () => {
    const { world } = shopWorld();
    const before = JSON.stringify(corporateSectorAssets(world));
    const result = stepCorporateSectorStrikes(world, 0, loadCorporationLabourState(world, 0));
    expect(result).toEqual({ sectorsTrended: 0, resolvedConcession: 0, resolvedWaitout: 0, resolvedBanned: 0, resolvedAgreement: 0 });
    expect(JSON.stringify(corporateSectorAssets(world))).toBe(before);
  });
});

describe("#322 corporation-turn seams and old saves", () => {
  it("keeps pre-#322 worlds free of bargaining maps across the corporation turn", () => {
    const world = createWorld(WORLD);
    expect(world.bargainingCampaigns).toBeUndefined();
    corporationTurnPhase.run(world);
    expect(world.bargainingCampaigns).toBeUndefined();
    expect(world.collectiveAgreements).toBeUndefined();
  });

  it("stays deterministic across idle twins and save/reload with live strikes", () => {
    const a = strikeWorld().world;
    const b = strikeWorld().world;
    for (let i = 0; i < 3; i++) {
      corporationTurnPhase.run(a);
      corporationTurnPhase.run(b);
    }
    expect(JSON.stringify(a.corporations)).toBe(JSON.stringify(b.corporations));
    const reloaded: WorldState = deserializeSave(serializeSave(a, "2026-09-17T00:00:00.000Z"));
    expect(JSON.stringify(reloaded.corporateSectors)).toBe(JSON.stringify(a.corporateSectors));
    expect(JSON.stringify(reloaded.bargainingCampaigns)).toBe(JSON.stringify(a.bargainingCampaigns));
    corporationTurnPhase.run(a);
    corporationTurnPhase.run(reloaded);
    expect(JSON.stringify(reloaded.corporations)).toBe(JSON.stringify(a.corporations));
  });

  it("advances full turns deterministically with a live dispute", () => {
    const a = createWorld(WORLD);
    const b = createWorld(WORLD);
    for (const world of [a, b]) {
      const union = world.unions[UNION]!;
      union.treasury = 5000;
      union.unionization = 70;
      corporateSectorAssets(world);
      const asset = Object.values(corporateSectorAssets(world)).find((candidate) => candidate.corporationId === EMPLOYER)!;
      asset.unionization = 70;
      openBargainingCampaignAction(world, { unionId: UNION, employerCorporationId: EMPLOYER, terms: TERMS, turn: 0 });
    }
    for (let i = 0; i < 5; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(JSON.stringify(a.bargainingCampaigns)).toBe(JSON.stringify(b.bargainingCampaigns));
    expect(JSON.stringify(a.corporations)).toBe(JSON.stringify(b.corporations));
  });
});
