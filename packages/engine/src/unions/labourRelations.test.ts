import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { corporateSectorAssets } from "../corporation/corporateSectorAssets.js";
import {
  openBargainingCampaignAction,
  answerBargainingCampaignAsEmployer,
  moveBargainingCampaignAsUnion,
  settleBargainingCampaignDirect,
  castRatificationBallot,
  quoteBargainingTerms,
  restoreEscalationExpectations,
  BARGAINING_STATE_CHANGED,
} from "./actions.js";
import { bargainingCampaigns } from "./campaigns.js";
import { processLabourRelationsTurn, labourNudgesForTurn } from "./labourRelationsTurn.js";
import {
  calculateNppSettlementWage,
  decideNppBargainingAction,
  industrialActionPressure,
} from "./employerPolicy.js";
import type { WorldState } from "../types.js";

const WORLD = { seed: "bargaining-322-actions", playerName: "Tester", countryId: "US", era: "1953" } as const;
const UNION = "US-manufacturing";
const EMPLOYER = "US-manufacturing";
const TERMS = { wageLevel: 1.1, agreementDurationTurns: 48, noStrikeTurns: 24 };

/** Fresh world with an organizable shop: density 70 clears the mandate floors, funded treasury. */
function shopWorld() {
  const world = createWorld(WORLD);
  const union = world.unions[UNION]!;
  union.treasury = 5000;
  union.unionization = 70;
  const assets = corporateSectorAssets(world);
  const asset = Object.values(assets).find((candidate) => candidate.corporationId === EMPLOYER)!;
  asset.unionization = 70;
  return { world, union, asset };
}

function openDispute(world: WorldState, openTurn = 0) {
  const campaign = openBargainingCampaignAction(world, {
    unionId: UNION,
    employerCorporationId: EMPLOYER,
    terms: TERMS,
    turn: openTurn,
  });
  return answerBargainingCampaignAsEmployer(world, {
    campaignId: campaign.id,
    action: "reject",
    turn: openTurn + 1,
  });
}

describe("#322 public open/answer flow", () => {
  it("opens, rejects into dispute, counters, and settles with an empty electorate", () => {
    const { world, union } = shopWorld();
    const treasuryBefore = union.treasury;
    const opened = openBargainingCampaignAction(world, { unionId: UNION, employerCorporationId: EMPLOYER, terms: TERMS, turn: 0 });
    expect(opened.status).toBe("negotiating");
    expect(opened.currentOffer).toMatchObject({ revision: 1, proposedBy: "union" });
    expect(union.treasury).toBe(treasuryBefore);

    const disputed = answerBargainingCampaignAsEmployer(world, { campaignId: opened.id, action: "reject", turn: 1 });
    expect(disputed.status).toBe("dispute");

    const countered = answerBargainingCampaignAsEmployer(world, {
      campaignId: opened.id,
      action: "counter",
      terms: { wageLevel: 1.05, agreementDurationTurns: 48, noStrikeTurns: 24 },
      turn: 2,
    });
    expect(countered.currentOffer).toMatchObject({ revision: 2, proposedBy: "employer" });

    // No organizers hold strength, so the union accept settles directly.
    const moved = moveBargainingCampaignAsUnion(world, { campaignId: opened.id, action: "accept", turn: 3 });
    expect(moved.kind).toBe("settled");
    if (moved.kind !== "settled") throw new Error("expected settlement");
    expect(moved.agreement.wageLevel).toBe(1.05);
    expect(world.collectiveAgreements?.[moved.agreement.id]?.status).toBe("active");
    expect(bargainingCampaigns(world)[opened.id]?.status).toBe("settled");
  });

  it("runs the member ballot when organizers hold strength", () => {
    const { world } = shopWorld();
    world.unionOrganizers = {
      [`${UNION}:alice`]: {
        id: `${UNION}:alice`,
        unionId: UNION,
        characterId: "alice",
        strength: 60,
        organizeCount: 1,
        createdAtTurn: 0,
        updatedAtTurn: 0,
      },
    };
    const opened = openBargainingCampaignAction(world, { unionId: UNION, employerCorporationId: EMPLOYER, terms: TERMS, turn: 0 });
    answerBargainingCampaignAsEmployer(world, {
      campaignId: opened.id,
      action: "counter",
      terms: { wageLevel: 1.06, agreementDurationTurns: 48, noStrikeTurns: 24 },
      turn: 1,
    });
    const moved = moveBargainingCampaignAsUnion(world, { campaignId: opened.id, action: "accept", turn: 2 });
    expect(moved.kind).toBe("ballot");
    if (moved.kind !== "ballot") throw new Error("expected ballot");
    expect(moved.campaign.ratification?.status).toBe("open");

    // A non-voter cannot cast; a majority-strength ratify settles and writes the agreement.
    expect(() => castRatificationBallot(world, { campaignId: opened.id, voterCharacterId: "mallory", vote: "ratify", turn: 2 })).toThrow(
      /no ballot/,
    );
    const result = castRatificationBallot(world, { campaignId: opened.id, voterCharacterId: "alice", vote: "ratify", turn: 2 });
    expect(result.outcome).toBe("ratified");
    expect(result.agreement?.wageLevel).toBe(1.06);
    expect(bargainingCampaigns(world)[opened.id]?.status).toBe("settled");
  });

  it("rejects a ballot, then blocks a re-vote until a counteroffer moves the package", () => {
    const { world } = shopWorld();
    world.unionOrganizers = {
      [`${UNION}:alice`]: {
        id: `${UNION}:alice`,
        unionId: UNION,
        characterId: "alice",
        strength: 60,
        organizeCount: 1,
        createdAtTurn: 0,
        updatedAtTurn: 0,
      },
      [`${UNION}:bob`]: {
        id: `${UNION}:bob`,
        unionId: UNION,
        characterId: "bob",
        strength: 50,
        organizeCount: 1,
        createdAtTurn: 0,
        updatedAtTurn: 0,
      },
    };
    const opened = openBargainingCampaignAction(world, { unionId: UNION, employerCorporationId: EMPLOYER, terms: TERMS, turn: 0 });
    answerBargainingCampaignAsEmployer(world, {
      campaignId: opened.id,
      action: "counter",
      terms: { wageLevel: 1.06, agreementDurationTurns: 48, noStrikeTurns: 24 },
      turn: 1,
    });
    moveBargainingCampaignAsUnion(world, { campaignId: opened.id, action: "accept", turn: 2 });
    const rejected = castRatificationBallot(world, { campaignId: opened.id, voterCharacterId: "alice", vote: "reject", turn: 2 });
    expect(rejected.outcome).toBe("rejected");
    expect(bargainingCampaigns(world)[opened.id]?.status).toBe("negotiating");
    // Re-accepting the rejected package is refused until the union counters.
    expect(() => moveBargainingCampaignAsUnion(world, { campaignId: opened.id, action: "accept", turn: 3 })).toThrow(
      /counteroffer/,
    );
    moveBargainingCampaignAsUnion(world, {
      campaignId: opened.id,
      action: "counter",
      terms: { wageLevel: 1.08, agreementDurationTurns: 48, noStrikeTurns: 24 },
      turn: 3,
    });
    answerBargainingCampaignAsEmployer(world, {
      campaignId: opened.id,
      action: "counter",
      terms: { wageLevel: 1.07, agreementDurationTurns: 48, noStrikeTurns: 24 },
      turn: 4,
    });
    const second = moveBargainingCampaignAsUnion(world, { campaignId: opened.id, action: "accept", turn: 5 });
    expect(second.kind).toBe("ballot");
  });

  it("settles directly through the employer accept path", () => {
    const { world } = shopWorld();
    const opened = openBargainingCampaignAction(world, { unionId: UNION, employerCorporationId: EMPLOYER, terms: TERMS, turn: 0 });
    const settled = settleBargainingCampaignDirect(world, opened.id, "employer", 1);
    expect(settled.status).toBe("settled");
    expect(world.collectiveAgreements?.[`agreement:${opened.id}`]?.wageLevel).toBe(1.1);
  });

  it("validates quote terms without opening anything", () => {
    const { world } = shopWorld();
    expect(() => quoteBargainingTerms(TERMS)).not.toThrow();
    expect(() => quoteBargainingTerms({ wageLevel: 9, agreementDurationTurns: 48, noStrikeTurns: 24 })).toThrow();
    expect(bargainingCampaigns(world)).toEqual({});
  });
});

describe("#322 escalation through public actions", () => {
  it("climbs ban -> selective strike, debiting the fund once and forcing expectations", () => {
    const { world, union, asset } = shopWorld();
    // Support 47 clears the ban rung (35) but not selective (50): raise density for the full climb.
    union.unionization = 100;
    asset.unionization = 100;
    const disputed = openDispute(world);
    const treasuryBefore = union.treasury;

    const ban = moveBargainingCampaignAsUnion(world, { campaignId: disputed.id, action: "escalate", turn: 2 });
    expect(ban.kind).toBe("moved");
    if (ban.kind !== "moved") throw new Error("expected move");
    expect(ban.campaign.escalationLevel).toBe("overtime_ban");
    expect(union.treasury).toBe(treasuryBefore);
    expect(asset.strikeStartedAtTurn).toBeNull();

    const strike = moveBargainingCampaignAsUnion(world, { campaignId: disputed.id, action: "escalate", turn: 3 });
    if (strike.kind !== "moved") throw new Error("expected move");
    expect(strike.campaign.escalationLevel).toBe("selective_strike");
    expect(strike.sectorsStriking).toBe(1);
    expect(strike.cashSpent).toBe(400);
    expect(union.treasury).toBe(treasuryBefore - 400);
    expect(union.lastCalledStrikeTurn).toBe(3);
    expect(asset.strikeStartedAtTurn).toBe(3);
    expect(asset.workerExpectationIndex).toBeGreaterThan(1.1);
    expect(strike.campaign.escalationExpectations).toHaveLength(1);
  });

  it("withdraw restores pre-strike expectations and starts the reopen cooldown", () => {
    const { world, union, asset } = shopWorld();
    union.unionization = 100;
    asset.unionization = 100;
    const disputed = openDispute(world);
    moveBargainingCampaignAsUnion(world, { campaignId: disputed.id, action: "escalate", turn: 2 });
    moveBargainingCampaignAsUnion(world, { campaignId: disputed.id, action: "escalate", turn: 3 });
    expect(asset.strikeStartedAtTurn).toBe(3);
    const moved = moveBargainingCampaignAsUnion(world, { campaignId: disputed.id, action: "withdraw", turn: 4 });
    if (moved.kind !== "moved") throw new Error("expected move");
    expect(moved.campaign.status).toBe("withdrawn");
    // Withdraw does not clear the strike marker (the corp turn resolves it),
    // but it restores the forced expectation so the gap closes.
    expect(asset.workerExpectationIndex).toBeNull();
    expect(restoreEscalationExpectations(world, { escalationExpectations: [] })).toBe(0);
    // Cooldown: same pair cannot reopen for 8 turns.
    expect(() =>
      openBargainingCampaignAction(world, { unionId: UNION, employerCorporationId: EMPLOYER, terms: TERMS, turn: 5 }),
    ).toThrow(/reopen/);
    const reopened = openBargainingCampaignAction(world, {
      unionId: UNION,
      employerCorporationId: EMPLOYER,
      terms: TERMS,
      turn: 12,
    });
    expect(reopened.id).not.toBe(disputed.id);
    expect(reopened.status).toBe("negotiating");
  });
});

describe("#322 refusals and idempotency", () => {
  it("refuses unknown ids, suspended unions, and duplicate live pairs", () => {
    const { world, union } = shopWorld();
    expect(() =>
      openBargainingCampaignAction(world, { unionId: "US-ghost", employerCorporationId: EMPLOYER, terms: TERMS, turn: 0 }),
    ).toThrow(/not found/);
    expect(() =>
      openBargainingCampaignAction(world, { unionId: UNION, employerCorporationId: "XX-ghost", terms: TERMS, turn: 0 }),
    ).toThrow(/not found/);
    union.suspended = true;
    expect(() =>
      openBargainingCampaignAction(world, { unionId: UNION, employerCorporationId: EMPLOYER, terms: TERMS, turn: 0 }),
    ).toThrow(/frozen/);
    union.suspended = false;
    openBargainingCampaignAction(world, { unionId: UNION, employerCorporationId: EMPLOYER, terms: TERMS, turn: 0 });
    expect(() =>
      openBargainingCampaignAction(world, { unionId: UNION, employerCorporationId: EMPLOYER, terms: TERMS, turn: 1 }),
    ).toThrow(/already exists/);
  });

  it("refuses same-turn double acts with the reload message", () => {
    const { world } = shopWorld();
    const opened = openBargainingCampaignAction(world, { unionId: UNION, employerCorporationId: EMPLOYER, terms: TERMS, turn: 0 });
    expect(() =>
      answerBargainingCampaignAsEmployer(world, { campaignId: opened.id, action: "reject", turn: 0 }),
    ).toThrow(BARGAINING_STATE_CHANGED);
    answerBargainingCampaignAsEmployer(world, {
      campaignId: opened.id,
      action: "counter",
      terms: { wageLevel: 1.05, agreementDurationTurns: 48, noStrikeTurns: 24 },
      turn: 1,
    });
    // The union just received a counter it did not author: accepting its own offer is refused.
    expect(() =>
      answerBargainingCampaignAsEmployer(world, { campaignId: opened.id, action: "counter", turn: 1 }),
    ).toThrow(BARGAINING_STATE_CHANGED);
  });

  it("leaves no campaign row behind a refused open", () => {
    const { world, union } = shopWorld();
    const treasuryBefore = union.treasury;
    expect(() =>
      openBargainingCampaignAction(world, {
        unionId: UNION,
        employerCorporationId: EMPLOYER,
        terms: { wageLevel: 9, agreementDurationTurns: 48, noStrikeTurns: 24 },
        turn: 0,
      }),
    ).toThrow();
    expect(bargainingCampaigns(world)).toEqual({});
    expect(union.treasury).toBe(treasuryBefore);
  });

  it("leaves treasury and sectors untouched behind a refused escalation", () => {
    const { world, union, asset } = shopWorld();
    union.unionization = 100;
    asset.unionization = 100;
    const disputed = openDispute(world);
    union.treasury = 10;
    const treasuryBefore = union.treasury;
    moveBargainingCampaignAsUnion(world, { campaignId: disputed.id, action: "escalate", turn: 2 });
    expect(() => moveBargainingCampaignAsUnion(world, { campaignId: disputed.id, action: "escalate", turn: 3 })).toThrow(
      /strike fund/,
    );
    expect(union.treasury).toBe(treasuryBefore);
    expect(asset.strikeStartedAtTurn).toBeNull();
    expect(bargainingCampaigns(world)[disputed.id]?.escalationLevel).toBe("overtime_ban");
  });

  it("refuses moves on ended campaigns", () => {
    const { world } = shopWorld();
    const opened = openBargainingCampaignAction(world, { unionId: UNION, employerCorporationId: EMPLOYER, terms: TERMS, turn: 0 });
    settleBargainingCampaignDirect(world, opened.id, "employer", 1);
    expect(() =>
      answerBargainingCampaignAsEmployer(world, { campaignId: opened.id, action: "reject", turn: 2 }),
    ).toThrow(/no longer be answered/);
    expect(() => moveBargainingCampaignAsUnion(world, { campaignId: opened.id, action: "withdraw", turn: 2 })).toThrow(
      /no longer be withdrawn/,
    );
  });
});

describe("#322 labour-relations turn pass", () => {
  it("moves negotiating campaigns past their deadline into dispute", () => {
    const { world } = shopWorld();
    const opened = openBargainingCampaignAction(world, { unionId: UNION, employerCorporationId: EMPLOYER, terms: TERMS, turn: 0 });
    const early = processLabourRelationsTurn(world, 7);
    expect(early.campaignsMovedToDispute).toBe(0);
    const due = processLabourRelationsTurn(world, 8);
    expect(due.campaignsMovedToDispute).toBe(1);
    expect(bargainingCampaigns(world)[opened.id]?.status).toBe("dispute");
  });

  it("expires active agreements and lapses stale disputes", () => {
    const { world } = shopWorld();
    const opened = openBargainingCampaignAction(world, { unionId: UNION, employerCorporationId: EMPLOYER, terms: TERMS, turn: 0 });
    settleBargainingCampaignDirect(world, opened.id, "employer", 1);
    const agreementId = `agreement:${opened.id}`;
    expect(processLabourRelationsTurn(world, 48).agreementsExpired).toBe(0);
    expect(processLabourRelationsTurn(world, 49).agreementsExpired).toBe(1);
    expect(world.collectiveAgreements?.[agreementId]?.status).toBe("expired");

    const second = openBargainingCampaignAction(world, {
      unionId: UNION,
      employerCorporationId: EMPLOYER,
      terms: TERMS,
      turn: 50,
    });
    answerBargainingCampaignAsEmployer(world, { campaignId: second.id, action: "reject", turn: 51 });
    // Dispute started turn 51 lapses at 51 + 16 = 67.
    expect(processLabourRelationsTurn(world, 66).disputesLapsed).toBe(0);
    const lapsed = processLabourRelationsTurn(world, 67);
    expect(lapsed.disputesLapsed).toBe(1);
    expect(bargainingCampaigns(world)[second.id]?.status).toBe("lapsed");
  });

  it("charges overtime upkeep and ends a defunded ban", () => {
    const { world, union } = shopWorld();
    union.unionization = 100;
    const assets = corporateSectorAssets(world);
    Object.values(assets).find((candidate) => candidate.corporationId === EMPLOYER)!.unionization = 100;
    const disputed = openDispute(world);
    moveBargainingCampaignAsUnion(world, { campaignId: disputed.id, action: "escalate", turn: 2 });
    const treasuryBefore = union.treasury;
    const funded = processLabourRelationsTurn(world, 3);
    expect(funded.overtimeBansFunded).toBe(1);
    expect(union.treasury).toBe(treasuryBefore - 40);

    union.treasury = 10;
    const ended = processLabourRelationsTurn(world, 4);
    expect(ended.overtimeBansEnded).toBe(1);
    expect(bargainingCampaigns(world)[disputed.id]?.escalationLevel).toBe("none");
  });

  it("leaves a suspended union's treasury untouched", () => {
    const { world, union } = shopWorld();
    union.unionization = 100;
    const assets = corporateSectorAssets(world);
    Object.values(assets).find((candidate) => candidate.corporationId === EMPLOYER)!.unionization = 100;
    const disputed = openDispute(world);
    moveBargainingCampaignAsUnion(world, { campaignId: disputed.id, action: "escalate", turn: 2 });
    union.suspended = true;
    const treasuryBefore = union.treasury;
    processLabourRelationsTurn(world, 3);
    expect(union.treasury).toBe(treasuryBefore);
  });

  it("refreshes mandates from live conditions", () => {
    const { world, union, asset } = shopWorld();
    const opened = openBargainingCampaignAction(world, { unionId: UNION, employerCorporationId: EMPLOYER, terms: TERMS, turn: 0 });
    const coverageBefore = bargainingCampaigns(world)[opened.id]?.mandate.coverage;
    asset.unionization = 95;
    union.unionization = 95;
    const result = processLabourRelationsTurn(world, 1);
    expect(result.mandatesRefreshed).toBe(1);
    expect(bargainingCampaigns(world)[opened.id]?.mandate.coverage).not.toBe(coverageBefore);
  });

  it("autoplay opens NPP campaigns and answers them without touching revenue", () => {
    const world = createWorld(WORLD);
    advanceTurn(world);
    const led = Object.values(world.unions).find((union) => union.ownerType === "npp" && union.ownerId != null);
    expect(led).toBeDefined();
    led!.treasury = 5000;
    led!.unionization = 70;
    const assets = corporateSectorAssets(world);
    for (const asset of Object.values(assets)) {
      if (asset.countryId === led!.countryId && asset.sectorType === led!.sectorType) asset.unionization = 70;
    }
    const revenueBefore = Object.values(world.corporations).reduce((sum, corp) => sum + corp.revenue, 0);
    const result = processLabourRelationsTurn(world, world.meta.turn + 1);
    expect(result.campaignsOpened).toBeGreaterThan(0);
    const revenueAfter = Object.values(world.corporations).reduce((sum, corp) => sum + corp.revenue, 0);
    expect(revenueAfter).toBe(revenueBefore);
  });
});

describe("#322 deterministic employer policy", () => {
  function policyCampaign(overrides: Record<string, unknown> = {}) {
    return {
      status: "negotiating" as const,
      currentOffer: { revision: 1, proposedBy: "union" as const, wageLevel: 1.2, agreementDurationTurns: 48, noStrikeTurns: 24, proposedAtTurn: 0 },
      offers: [
        { revision: 1, proposedBy: "union" as const, wageLevel: 1.2, agreementDurationTurns: 48, noStrikeTurns: 24, proposedAtTurn: 0 },
      ],
      mandate: { coverage: 70, grievance: 0, laborTightness: 50, lawSupport: 50, strikeFundRunway: 6, support: 47, leverage: 40, organizedLocalCount: 1, totalLocalCount: 1 },
      deadlineTurn: 8,
      lastActionTurn: 0,
      escalationLevel: "none" as const,
      escalationStartedAtTurn: null,
      ...overrides,
    };
  }

  it("settles toward the shared wage: leverage, capacity, and action pressure move it", () => {
    // floor 1.0, claim 1.2, no leverage/capacity/pressure: 1.0 + 0.2*0.25 = 1.05.
    expect(
      calculateNppSettlementWage({ openingUnionWage: 1.2, employerWageLevel: 1.0, unionLeverage: 0, employerProfitMargin: 0 }),
    ).toBe(1.05);
    const pressured = calculateNppSettlementWage({
      openingUnionWage: 1.2,
      employerWageLevel: 1.0,
      unionLeverage: 40,
      employerProfitMargin: 10,
      actionPressure: 1,
    });
    expect(pressured).toBeGreaterThan(1.05);
    expect(pressured).toBeLessThanOrEqual(1.2);
  });

  it("accepts a fair offer and counters toward the settlement wage", () => {
    const accept = decideNppBargainingAction({
      campaign: policyCampaign({
        currentOffer: { revision: 2, proposedBy: "employer" as const, wageLevel: 1.06, agreementDurationTurns: 48, noStrikeTurns: 24, proposedAtTurn: 1 },
        offers: [
          { revision: 1, proposedBy: "union" as const, wageLevel: 1.2, agreementDurationTurns: 48, noStrikeTurns: 24, proposedAtTurn: 0 },
          { revision: 2, proposedBy: "employer" as const, wageLevel: 1.06, agreementDurationTurns: 48, noStrikeTurns: 24, proposedAtTurn: 1 },
        ],
        lastActionTurn: 1,
      }),
      party: "union",
      currentTurn: 2,
      employerWageLevel: 1.0,
      employerProfitMargin: 0,
    });
    // Settlement with leverage 40: 1.0 + 0.2*(0.25+0.18) = 1.086. Offer 1.06 < 1.086: counter, not accept.
    expect(accept.action).toBe("counter");
    const generous = decideNppBargainingAction({
      campaign: policyCampaign({
        currentOffer: { revision: 2, proposedBy: "employer" as const, wageLevel: 1.1, agreementDurationTurns: 48, noStrikeTurns: 24, proposedAtTurn: 1 },
        offers: [
          { revision: 1, proposedBy: "union" as const, wageLevel: 1.2, agreementDurationTurns: 48, noStrikeTurns: 24, proposedAtTurn: 0 },
          { revision: 2, proposedBy: "employer" as const, wageLevel: 1.1, agreementDurationTurns: 48, noStrikeTurns: 24, proposedAtTurn: 1 },
        ],
        lastActionTurn: 1,
      }),
      party: "union",
      currentTurn: 2,
      employerWageLevel: 1.0,
      employerProfitMargin: 0,
    });
    expect(generous).toEqual({ action: "accept" });
  });

  it("stays out when the campaign ended, already acted, or awaits the other party", () => {
    expect(
      decideNppBargainingAction({ campaign: policyCampaign({ status: "settled" }), party: "employer", currentTurn: 2, employerWageLevel: 1 }),
    ).toMatchObject({ action: "none", reason: "campaign-ended" });
    expect(
      decideNppBargainingAction({ campaign: policyCampaign({ lastActionTurn: 2 }), party: "employer", currentTurn: 2, employerWageLevel: 1 }),
    ).toMatchObject({ action: "none", reason: "already-acted" });
    expect(
      decideNppBargainingAction({ campaign: policyCampaign(), party: "union", currentTurn: 2, employerWageLevel: 1 }),
    ).toMatchObject({ action: "none", reason: "awaiting-other-party" });
  });

  it("ramps action pressure with sustained strikes", () => {
    expect(industrialActionPressure({ escalationLevel: "none", currentTurn: 5 })).toBe(0);
    expect(industrialActionPressure({ escalationLevel: "industry_strike", escalationStartedAtTurn: 5, currentTurn: 5 })).toBeCloseTo(0.25, 10);
    expect(industrialActionPressure({ escalationLevel: "industry_strike", escalationStartedAtTurn: 1, currentTurn: 5 })).toBe(1);
    expect(industrialActionPressure({ escalationLevel: "overtime_ban", escalationStartedAtTurn: 1, currentTurn: 5 })).toBeCloseTo(0.3, 10);
  });
});

describe("#322 worker political feedback", () => {
  it("drags security/civic life during disputes and lifts them after settlement", () => {
    const { world } = shopWorld();
    const disputed = openDispute(world);
    const during = labourNudgesForTurn(world, 1);
    expect(during.get("US")?.get("economy.workerSecurity")).toBeLessThan(0);
    settleBargainingCampaignDirect(world, disputed.id, "employer", 2);
    const after = labourNudgesForTurn(world, 2);
    expect(after.get("US")?.get("economy.workerSecurity")).toBeGreaterThan(0);
  });

  it("excludes suspended unions from service nudges", () => {
    const { world, union } = shopWorld();
    union.activeServices = ["healthFund"];
    expect(labourNudgesForTurn(world, 0).get("US")?.get("economy.workerSecurity")).toBeGreaterThan(0);
    union.suspended = true;
    expect(labourNudgesForTurn(world, 0).get("US")).toBeUndefined();
  });
});

describe("#322 public turn and session seams", () => {
  it("advanceTurn carries an open campaign through the full registry without errors", () => {
    const { world } = shopWorld();
    openBargainingCampaignAction(world, { unionId: UNION, employerCorporationId: EMPLOYER, terms: TERMS, turn: world.meta.turn });
    for (let i = 0; i < 10; i++) advanceTurn(world);
    const campaign = Object.values(world.bargainingCampaigns ?? {})[0];
    expect(campaign).toBeDefined();
    expect(["negotiating", "dispute", "settled", "lapsed", "withdrawn"]).toContain(campaign.status);
  });

  it("survives a save/reload mid-campaign and continues identically", () => {
    const { world, union, asset } = shopWorld();
    union.unionization = 100;
    asset.unionization = 100;
    const disputed = openDispute(world);
    moveBargainingCampaignAsUnion(world, { campaignId: disputed.id, action: "escalate", turn: 2 });
    moveBargainingCampaignAsUnion(world, { campaignId: disputed.id, action: "escalate", turn: 3 });
    const reloaded = deserializeSave(serializeSave(world, "2026-09-17T00:00:00.000Z"));
    expect(JSON.stringify(reloaded.bargainingCampaigns)).toBe(JSON.stringify(world.bargainingCampaigns));
    expect(JSON.stringify(reloaded.collectiveAgreements)).toBe(JSON.stringify(world.collectiveAgreements));
    expect(JSON.stringify(reloaded.corporateSectors)).toBe(JSON.stringify(world.corporateSectors));
    // The reloaded world keeps acting: the employer can still answer.
    const answered = answerBargainingCampaignAsEmployer(reloaded, {
      campaignId: disputed.id,
      action: "counter",
      terms: { wageLevel: 1.05, agreementDurationTurns: 48, noStrikeTurns: 24 },
      turn: 4,
    });
    expect(answered.currentOffer.revision).toBe(2);
  });

  it("round-trips a pre-#322 save byte-identical", () => {
    const world = createWorld(WORLD);
    const raw = JSON.parse(serializeSave(world, "2026-09-17T00:00:00.000Z")) as Record<string, unknown>;
    const inner = raw["world"] as Record<string, unknown>;
    expect(inner["bargainingCampaigns"]).toBeUndefined();
    expect(inner["collectiveAgreements"]).toBeUndefined();
    const loaded = deserializeSave(JSON.stringify(raw));
    expect(loaded.bargainingCampaigns).toBeUndefined();
    expect(loaded.collectiveAgreements).toBeUndefined();
    expect(serializeSave(loaded, "2026-09-17T00:00:00.000Z")).toBe(JSON.stringify(raw));
  });

  it("fails closed on present-but-invalid bargaining maps", () => {
    const { world } = shopWorld();
    openBargainingCampaignAction(world, { unionId: UNION, employerCorporationId: EMPLOYER, terms: TERMS, turn: 0 });
    const raw = JSON.parse(serializeSave(world, "2026-09-17T00:00:00.000Z")) as Record<string, unknown>;
    const inner = raw["world"] as Record<string, Record<string, Record<string, unknown>>>;
    const campaigns = inner["bargainingCampaigns"]!;
    const key = Object.keys(campaigns)[0]!;
    campaigns["bogus-key"] = campaigns[key]!;
    expect(() => deserializeSave(JSON.stringify(raw))).toThrow(/key does not match id/);
    delete campaigns["bogus-key"];
    campaigns[key]!["status"] = "chaos";
    expect(() => deserializeSave(JSON.stringify(raw))).toThrow(/status/);
    // Optional maps may also be absent entirely: absent stays valid.
    delete inner["bargainingCampaigns"];
    delete inner["collectiveAgreements"];
    expect(() => deserializeSave(JSON.stringify(raw))).not.toThrow();
  });
});
