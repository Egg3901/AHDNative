import { describe, expect, it } from "vitest";
import {
  BARGAINING_DEADLINE_TURNS,
  AGREEMENT_DURATION_MIN_TURNS,
  AGREEMENT_DURATION_MAX_TURNS,
  BARGAINING_MAX_OFFERS,
  BARGAINING_MIN_COVERAGE,
  BARGAINING_MIN_SUPPORT,
  BARGAINING_ESCALATION_SUPPORT,
  OVERTIME_BAN_OUTPUT_FACTOR,
  OVERTIME_BAN_UPKEEP_PER_LOCAL,
  BARGAINING_DISPUTE_MAX_TURNS,
  BARGAINING_REOPEN_COOLDOWN_TURNS,
  STRIKE_CALL_MIN_UNIONIZATION,
  STRIKE_CALL_COST_PER_SECTOR,
  UNION_STRIKE_CALL_COOLDOWN_TURNS,
  STRIKE_UNIONIZATION_THRESHOLD,
  STRIKE_EXPECTATION_GAP_THRESHOLD,
  STRIKE_CONCESSION_GAP_THRESHOLD,
  WORKER_EXPECTATION_TREND_STEP,
  STRIKE_DURATION_TURNS,
  STRIKE_COOLDOWN_TURNS,
  STRIKE_REVENUE_THROTTLE,
  STRIKE_MARGIN_PENALTY_PP,
  STRIKE_WAITOUT_UNIONIZATION_BUMP,
  WAGE_LEVEL_MIN,
  WAGE_LEVEL_MAX,
  RATIFICATION_VOTE_TURNS,
  buildBargainingMandate,
  validateBargainingMandate,
  validateBargainingTerms,
  openBargainingCampaign,
  counterBargainingOffer,
  moveCampaignToDispute,
  nextBargainingEscalationLevel,
  escalateBargainingCampaign,
  buildBargainingEscalationPlan,
  settleBargainingCampaign,
  disputeLapseTurn,
  isCollectiveAgreementActive,
  bargainingReopenTurn,
  openRatificationVote,
  tallyRatificationBallots,
  resolveRatification,
  isRatificationOpen,
  ratificationBlockReason,
  realWageIndex,
  trendWorkerExpectation,
  strikeCallCost,
  escalationUpkeepPerTurn,
  stepSectorStrike,
  recordEscalationExpectations,
} from "./bargaining.js";
import type { BargainingCampaign } from "./campaigns.js";

function mandate(overrides: Partial<Parameters<typeof buildBargainingMandate>[0]> = {}) {
  return buildBargainingMandate({
    locals: [{ workers: 100, unionization: 70, wageLevel: 1 }],
    laborTightness: 50,
    lawSupport: 50,
    treasury: 5000,
    strikeCost: 400,
    ...overrides,
  });
}

function openCampaign(turn = 0): BargainingCampaign {
  const opened = openBargainingCampaign({
    id: "u::e::0",
    unionId: "u",
    countryId: "US",
    employerCorporationId: "e",
    sectorIds: ["s1"],
    mandate: mandate(),
    terms: { wageLevel: 1.1, agreementDurationTurns: 48, noStrikeTurns: 24 },
    currentTurn: turn,
  });
  if ("ok" in opened) throw new Error(opened.error);
  return opened;
}

describe("#322 bargaining constants (audited, no invented numbers)", () => {
  it("pins escalation support rungs, clocks, and strike economics", () => {
    expect(BARGAINING_ESCALATION_SUPPORT).toEqual({ overtime_ban: 35, selective_strike: 50, industry_strike: 65 });
    expect(OVERTIME_BAN_OUTPUT_FACTOR).toBe(0.96);
    expect(OVERTIME_BAN_UPKEEP_PER_LOCAL).toBe(40);
    expect(STRIKE_REVENUE_THROTTLE).toBe(0.25);
    expect(STRIKE_MARGIN_PENALTY_PP).toBe(-8);
    expect(BARGAINING_DEADLINE_TURNS).toBe(8);
    expect(BARGAINING_DISPUTE_MAX_TURNS).toBe(16);
    expect(BARGAINING_REOPEN_COOLDOWN_TURNS).toBe(8);
    expect(STRIKE_CALL_COST_PER_SECTOR).toBe(400);
    expect(STRIKE_CALL_MIN_UNIONIZATION).toBe(30);
    expect(UNION_STRIKE_CALL_COOLDOWN_TURNS).toBe(8);
    expect(STRIKE_UNIONIZATION_THRESHOLD).toBe(55);
    expect(STRIKE_DURATION_TURNS).toBe(4);
    expect(STRIKE_COOLDOWN_TURNS).toBe(12);
    expect(STRIKE_WAITOUT_UNIONIZATION_BUMP).toBe(10);
    expect(WAGE_LEVEL_MIN).toBe(0.8);
    expect(WAGE_LEVEL_MAX).toBe(1.5);
    expect(RATIFICATION_VOTE_TURNS).toBe(3);
    expect(AGREEMENT_DURATION_MIN_TURNS).toBe(24);
    expect(AGREEMENT_DURATION_MAX_TURNS).toBe(192);
    expect(BARGAINING_MAX_OFFERS).toBe(12);
    expect(BARGAINING_MIN_COVERAGE).toBe(20);
    expect(BARGAINING_MIN_SUPPORT).toBe(25);
  });
});

describe("#322 mandate gates", () => {
  it("opens with organized coverage: support blends coverage/grievance/law", () => {
    const m = mandate();
    expect(m.coverage).toBe(70);
    expect(m.organizedLocalCount).toBe(1);
    expect(m.totalLocalCount).toBe(1);
    // support = 70*0.6 + 0*0.3 + 50*0.1 = 47
    expect(m.support).toBe(47);
    expect(validateBargainingMandate(m)).toEqual({ ok: true });
  });

  it("refuses unorganized shops and empty scope", () => {
    const thin = mandate({ locals: [{ workers: 100, unionization: 10, wageLevel: 1 }] });
    expect(validateBargainingMandate(thin)).toEqual({
      ok: false,
      error: "The union needs more organized workers at this employer.",
    });
    const empty = mandate({ locals: [] });
    expect(validateBargainingMandate(empty)).toEqual({
      ok: false,
      error: "This employer has no locals in the union's industry.",
    });
  });

  it("grievance rises with the expectation gap above the real wage", () => {
    const calm = mandate();
    const angry = mandate({ locals: [{ workers: 100, unionization: 70, wageLevel: 1, workerExpectationIndex: 1.3 }] });
    expect(angry.grievance).toBeGreaterThan(calm.grievance);
    expect(angry.support).toBeGreaterThan(calm.support);
  });
});

describe("#322 terms validation", () => {
  it("accepts a well-formed package and rejects out-of-range terms", () => {
    expect(validateBargainingTerms({ wageLevel: 1.1, agreementDurationTurns: 48, noStrikeTurns: 24 })).toEqual({ ok: true });
    expect(validateBargainingTerms({ wageLevel: 0.5, agreementDurationTurns: 48, noStrikeTurns: 24 }).ok).toBe(false);
    expect(validateBargainingTerms({ wageLevel: 1.6, agreementDurationTurns: 48, noStrikeTurns: 24 }).ok).toBe(false);
    expect(validateBargainingTerms({ wageLevel: 1.1, agreementDurationTurns: 8, noStrikeTurns: 8 }).ok).toBe(false);
    expect(validateBargainingTerms({ wageLevel: 1.1, agreementDurationTurns: 48, noStrikeTurns: 49 }).ok).toBe(false);
  });
});

describe("#322 open/counter/dispute", () => {
  it("opens negotiating with a union revision-1 offer and an 8-turn deadline", () => {
    const campaign = openCampaign(5);
    expect(campaign.status).toBe("negotiating");
    expect(campaign.currentOffer).toMatchObject({ revision: 1, proposedBy: "union", wageLevel: 1.1 });
    expect(campaign.deadlineTurn).toBe(13);
    expect(campaign.lastActionTurn).toBe(5);
  });

  it("refuses to open below the mandate floors", () => {
    const refused = openBargainingCampaign({
      id: "u::e::0",
      unionId: "u",
      countryId: "US",
      employerCorporationId: "e",
      sectorIds: ["s1"],
      mandate: mandate({ locals: [{ workers: 100, unionization: 10, wageLevel: 1 }] }),
      terms: { wageLevel: 1.1, agreementDurationTurns: 48, noStrikeTurns: 24 },
      currentTurn: 0,
    });
    expect(refused).toMatchObject({ ok: false });
  });

  it("counters bump the revision and void an open ballot on the replaced offer", () => {
    const campaign = {
      ...openCampaign(),
      ratification: {
        offerRevision: 1,
        status: "open" as const,
        openedAtTurn: 0,
        closesAtTurn: 3,
        weights: [],
        totalStrength: 0,
        closedAtTurn: null,
      },
    };
    const next = counterBargainingOffer({
      campaign,
      proposedBy: "employer",
      terms: { wageLevel: 1.05, agreementDurationTurns: 48, noStrikeTurns: 24 },
      currentTurn: 1,
    });
    if ("ok" in next) throw new Error(next.error);
    expect(next.currentOffer.revision).toBe(2);
    expect(next.offers).toHaveLength(2);
    expect(next.ratification?.status).toBe("void");
  });

  it("refuses same-side answers, ended campaigns, and the round limit", () => {
    const campaign = openCampaign();
    expect(
      counterBargainingOffer({ campaign, proposedBy: "union", terms: { wageLevel: 1.2, agreementDurationTurns: 48, noStrikeTurns: 24 }, currentTurn: 1 }),
    ).toMatchObject({ ok: false });
    const settled = { ...campaign, status: "settled" as const };
    expect(
      counterBargainingOffer({ campaign: settled, proposedBy: "employer", terms: { wageLevel: 1.05, agreementDurationTurns: 48, noStrikeTurns: 24 }, currentTurn: 1 }),
    ).toMatchObject({ ok: false });
  });

  it("moves negotiating campaigns to dispute exactly once", () => {
    const campaign = openCampaign();
    const disputed = moveCampaignToDispute(campaign, 2);
    if ("ok" in disputed) throw new Error(disputed.error);
    expect(disputed.status).toBe("dispute");
    expect(disputed.disputeStartedAtTurn).toBe(2);
    expect(moveCampaignToDispute(disputed, 3)).toMatchObject({ ok: false });
  });
});

describe("#322 escalation ladder", () => {
  function disputedWithSupport(support: number, turn = 1): BargainingCampaign {
    const campaign = openCampaign();
    const moved = moveCampaignToDispute(campaign, turn);
    if ("ok" in moved) throw new Error(moved.error);
    return { ...moved, mandate: { ...moved.mandate, support }, lastActionTurn: turn };
  }

  it("climbs none -> overtime_ban -> selective -> industry, then stops", () => {
    expect(nextBargainingEscalationLevel("none")).toBe("overtime_ban");
    expect(nextBargainingEscalationLevel("overtime_ban")).toBe("selective_strike");
    expect(nextBargainingEscalationLevel("selective_strike")).toBe("industry_strike");
    expect(nextBargainingEscalationLevel("industry_strike")).toBeNull();
  });

  it("gates each rung on member support and one act per turn", () => {
    const weak = disputedWithSupport(20);
    expect(escalateBargainingCampaign(weak, 2)).toMatchObject({ ok: false });
    const banReady = disputedWithSupport(40);
    const banned = escalateBargainingCampaign(banReady, 2);
    if ("ok" in banned) throw new Error(banned.error);
    expect(banned.escalationLevel).toBe("overtime_ban");
    // Same-turn second act refused.
    expect(escalateBargainingCampaign(banned, 2)).toMatchObject({ ok: false });
    // 40 support cannot climb to selective (needs 50).
    expect(escalateBargainingCampaign({ ...banned, lastActionTurn: 2 }, 3)).toMatchObject({ ok: false });
  });

  it("builds a strike plan charging 400 per newly struck local, upkeep 40 per ban local", () => {
    expect(strikeCallCost(2)).toBe(800);
    expect(escalationUpkeepPerTurn("overtime_ban", 3)).toBe(120);
    expect(escalationUpkeepPerTurn("selective_strike", 3)).toBe(0);
    const campaign = disputedWithSupport(70);
    const plan = buildBargainingEscalationPlan(
      campaign,
      [{ id: "s1", unionization: 70, strikeStartedAtTurn: null, strikeCooldownUntilTurn: null }],
      2,
      { treasury: 5000, lastCalledStrikeTurn: null },
    );
    expect(plan.nextLevel).toBe("overtime_ban");
    expect(plan.newStrikeLocalIds).toEqual([]);
    expect(plan.cashCost).toBe(0);
    expect(plan.upkeepPerTurn).toBe(40);
    expect(plan.blockedReason).toBeNull();
  });

  it("selective strikes hit half the eligible locals; industry hits all eligible", () => {
    const campaign = { ...disputedWithSupport(70), escalationLevel: "overtime_ban" as const, sectorIds: ["s1", "s2", "s3"] };
    const locals = ["s1", "s2", "s3"].map((id) => ({
      id,
      unionization: 70,
      strikeStartedAtTurn: null,
      strikeCooldownUntilTurn: null,
    }));
    const selective = buildBargainingEscalationPlan(campaign, locals, 3, { treasury: 5000, lastCalledStrikeTurn: null });
    expect(selective.nextLevel).toBe("selective_strike");
    expect(selective.newStrikeLocalIds).toHaveLength(2);
    expect(selective.cashCost).toBe(800);
    const industry = buildBargainingEscalationPlan(
      { ...campaign, escalationLevel: "selective_strike" },
      locals,
      3,
      { treasury: 5000, lastCalledStrikeTurn: null },
    );
    expect(industry.newStrikeLocalIds).toHaveLength(3);
  });

  it("blocks strikes with no eligible target, on union cooldown, or without funds", () => {
    const campaign = { ...disputedWithSupport(70), escalationLevel: "overtime_ban" as const };
    const thin = [{ id: "s1", unionization: 10, strikeStartedAtTurn: null, strikeCooldownUntilTurn: null }];
    expect(
      buildBargainingEscalationPlan(campaign, thin, 3, { treasury: 5000, lastCalledStrikeTurn: null }).blockedCode,
    ).toBe("no_target");
    const eligible = [{ id: "s1", unionization: 70, strikeStartedAtTurn: null, strikeCooldownUntilTurn: null }];
    expect(
      buildBargainingEscalationPlan(campaign, eligible, 3, { treasury: 5000, lastCalledStrikeTurn: 0 }).blockedCode,
    ).toBe("strike_cooldown");
    expect(
      buildBargainingEscalationPlan(campaign, eligible, 20, { treasury: 100, lastCalledStrikeTurn: null }).blockedCode,
    ).toBe("insufficient_funds");
  });
});

describe("#322 settlement, lapse, reopen", () => {
  it("settles on the current offer with inclusive start / exclusive expiry", () => {
    const campaign = openCampaign();
    const countered = counterBargainingOffer({
      campaign,
      proposedBy: "employer",
      terms: { wageLevel: 1.05, agreementDurationTurns: 48, noStrikeTurns: 24 },
      currentTurn: 1,
    });
    if ("ok" in countered) throw new Error(countered.error);
    const settled = settleBargainingCampaign({ campaign: countered, acceptedBy: "union", currentTurn: 2 });
    if (!settled.ok) throw new Error(settled.error);
    expect(settled.campaign.status).toBe("settled");
    expect(settled.agreement).toMatchObject({ wageLevel: 1.05, startsAtTurn: 2, expiresAtTurn: 50, noStrikeUntilTurn: 26 });
    expect(isCollectiveAgreementActive(settled.agreement, 2)).toBe(true);
    expect(isCollectiveAgreementActive(settled.agreement, 49)).toBe(true);
    expect(isCollectiveAgreementActive(settled.agreement, 50)).toBe(false);
    expect(isCollectiveAgreementActive({ ...settled.agreement, status: "expired" }, 10)).toBe(false);
  });

  it("refuses self-accept and settlement of ended campaigns", () => {
    const campaign = openCampaign();
    expect(settleBargainingCampaign({ campaign, acceptedBy: "union", currentTurn: 1 }).ok).toBe(false);
    const ended = { ...campaign, status: "withdrawn" as const };
    expect(settleBargainingCampaign({ campaign: ended, acceptedBy: "employer", currentTurn: 1 }).ok).toBe(false);
  });

  it("lapses 16 turns after the dispute starts and reopens after an 8-turn cooldown", () => {
    const moved = moveCampaignToDispute(openCampaign(), 8);
    if ("ok" in moved) throw new Error(moved.error);
    expect(disputeLapseTurn(moved)).toBe(24);
    expect(bargainingReopenTurn(24)).toBe(32);
  });
});

describe("#322 ratification ballots", () => {
  const weights = new Map([
    ["alice", 60],
    ["bob", 40],
  ]);

  it("opens on organizer strength and stays shut with an empty electorate", () => {
    const vote = openRatificationVote({ campaign: openCampaign(), weights, currentTurn: 1 });
    expect(vote).toMatchObject({ offerRevision: 1, status: "open", openedAtTurn: 1, closesAtTurn: 4, totalStrength: 100 });
    expect(openRatificationVote({ campaign: openCampaign(), weights: new Map(), currentTurn: 1 })).toBeNull();
  });

  it("closes early on a strength majority; ties and silence ratify at the deadline", () => {
    const vote = openRatificationVote({ campaign: openCampaign(), weights, currentTurn: 1 })!;
    const majority = tallyRatificationBallots(vote, [{ voterCharacterId: "alice", vote: "ratify", offerRevision: 1 }]);
    expect(resolveRatification(vote, majority, 1)).toBe("ratified");
    const rejected = tallyRatificationBallots(vote, [{ voterCharacterId: "alice", vote: "reject", offerRevision: 1 }]);
    expect(resolveRatification(vote, rejected, 1)).toBe("rejected");
    // No majority either way before the deadline: still open.
    const split = { ratifyStrength: 0, rejectStrength: 0, castStrength: 0, outstandingStrength: 100, ratifyCount: 0, rejectCount: 0 };
    expect(resolveRatification(vote, split, 2)).toBeNull();
    expect(resolveRatification(vote, split, 4)).toBe("ratified");
    // Stale revisions and zero-weight ballots never count.
    const stale = tallyRatificationBallots(vote, [
      { voterCharacterId: "alice", vote: "reject", offerRevision: 99 },
      { voterCharacterId: "mallory", vote: "reject", offerRevision: 1 },
    ]);
    expect(stale.castStrength).toBe(0);
  });

  it("isRatificationOpen and ratificationBlockReason gate re-votes", () => {
    const campaign = openCampaign();
    expect(isRatificationOpen(campaign, 1)).toBe(false);
    expect(ratificationBlockReason(campaign, 1)).toBeNull();
    const voting = {
      ...campaign,
      ratification: openRatificationVote({ campaign, weights, currentTurn: 1 })!,
    };
    expect(isRatificationOpen(voting, 2)).toBe(true);
    expect(isRatificationOpen(voting, 4)).toBe(false);
    expect(ratificationBlockReason(voting, 2)).toMatch(/already voting/);
    const rejected = { ...voting, ratification: { ...voting.ratification!, status: "rejected" as const, closedAtTurn: 4 } };
    expect(ratificationBlockReason(rejected, 5)).toMatch(/counteroffer/);
  });
});

describe("#322 strike state machine", () => {
  it("trends expectations toward the real wage without overshoot; absent starts at par", () => {
    expect(realWageIndex(1, undefined)).toBe(1);
    expect(trendWorkerExpectation(null, 1)).toBe(1);
    expect(trendWorkerExpectation(1.17, 1)).toBeCloseTo(1.15, 10);
    expect(trendWorkerExpectation(1.01, 1)).toBe(1);
    expect(WORKER_EXPECTATION_TREND_STEP).toBe(0.02);
  });

  it("ignites above density 55 with a 0.12 gap, then concedes or waits out", () => {
    const started = stepSectorStrike({
      unionization: 70,
      realWage: 1,
      workerExpectation: 1.2,
      turn: 10,
      prior: { strikeStartedAtTurn: null, strikeCooldownUntilTurn: null },
    });
    expect(started.event).toBe("started");
    expect(started.next.strikeStartedAtTurn).toBe(10);
    // Below-threshold density never ignites.
    expect(
      stepSectorStrike({ unionization: 40, realWage: 1, workerExpectation: 1.5, turn: 10, prior: {} }).event,
    ).toBeNull();
    // Hysteresis: the trigger gap (0.12) sits strictly above the concession gap (0.04).
    expect(STRIKE_EXPECTATION_GAP_THRESHOLD).toBeGreaterThan(STRIKE_CONCESSION_GAP_THRESHOLD);
    const concession = stepSectorStrike({
      unionization: 70,
      realWage: 1,
      workerExpectation: 1.03,
      turn: 11,
      prior: { strikeStartedAtTurn: 10, strikeCooldownUntilTurn: null },
    });
    expect(concession.event).toBe("resolved_concession");
    expect(concession.next.strikeCooldownUntilTurn).toBe(11 + STRIKE_COOLDOWN_TURNS);
    const waitout = stepSectorStrike({
      unionization: 70,
      realWage: 1,
      workerExpectation: 1.5,
      turn: 14,
      prior: { strikeStartedAtTurn: 10, strikeCooldownUntilTurn: null },
    });
    expect(waitout.event).toBe("resolved_waitout");
    expect(waitout.unionizationBump).toBe(10);
    // Still running before either exit.
    const running = stepSectorStrike({
      unionization: 70,
      realWage: 1,
      workerExpectation: 1.5,
      turn: 11,
      prior: { strikeStartedAtTurn: 10, strikeCooldownUntilTurn: null },
    });
    expect(running.event).toBeNull();
    expect(running.next.strikeStartedAtTurn).toBe(10);
  });

  it("resolves banned and agreement-protected strikes; cooldowns block reignition", () => {
    const banned = stepSectorStrike({
      unionization: 70,
      realWage: 1,
      workerExpectation: 1.5,
      turn: 11,
      prior: { strikeStartedAtTurn: 10, strikeCooldownUntilTurn: null },
      unionsBanned: true,
    });
    expect(banned.event).toBe("resolved_banned");
    const agreement = stepSectorStrike({
      unionization: 70,
      realWage: 1,
      workerExpectation: 1.5,
      turn: 11,
      prior: { strikeStartedAtTurn: 10, strikeCooldownUntilTurn: null },
      noStrikeProtected: true,
    });
    expect(agreement.event).toBe("resolved_agreement");
    const cooling = stepSectorStrike({
      unionization: 70,
      realWage: 1,
      workerExpectation: 1.5,
      turn: 11,
      prior: { strikeStartedAtTurn: null, strikeCooldownUntilTurn: 20 },
    });
    expect(cooling.event).toBeNull();
  });

  it("records pre-strike expectations once for later restore", () => {
    const records = recordEscalationExpectations(undefined, [{ id: "s1", workerExpectationIndex: 1.05 }]);
    expect(records).toEqual([{ sectorId: "s1", previousExpectationIndex: 1.05 }]);
    const kept = recordEscalationExpectations(records, [{ id: "s1", workerExpectationIndex: 9 }]);
    expect(kept).toEqual([]);
  });
});
