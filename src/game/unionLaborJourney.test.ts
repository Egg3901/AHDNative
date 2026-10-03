import { describe, expect, it } from "vitest";
import { corporateSectorAssets, createWorld } from "@ahdclient/engine";
import { GameSession } from "./session";

const UNION_ID = "US-manufacturing";
const EMPLOYER_ID = "US-manufacturing";
const STAMP = "2026-10-02T00:00:00Z";

function savedWorld(session: GameSession) {
  return JSON.parse(session.serialize(STAMP)).world as ReturnType<typeof createWorld>;
}

describe.sequential("continuous union labor journey through the public session", () => {
  // These stages share one actual character and its complete world. Each
  // keeps the original 120-second limit; no history, calendar or RNG is reset.
  const session = new GameSession();
  const unionRow = () => session.unionManagement().unions.find((row) => row.id === UNION_ID)!;
  let targetId: string | undefined;

  it("earns leadership and shop organization through actions and actual dues", () => {
    session.create({
      seed: "union-public-labor-journey", playerName: "Alex", countryId: "US", era: "1953",
      creation: {
        name: "Alex", homeRegionId: "AL", partyId: null,
        stats: { charisma: 4, debate: 4, energy: 4, fundraising: 4, businessAcumen: 4, statecraft: 4, intellect: 4 },
        policies: { economic: 0, social: 0 },
        demographics: { race: "white", gender: "male", education: "college", wealth: "middle" },
      },
    });
    expect(unionRow().treasury).toBe(500);

    // Earn organizing actions through ordinary turns. The union funds shop
    // drives from its actual dues; no starting resources or offices are edited.
    let resourceTurns = 0;
    const earnActions = (minimum: number) => {
      while (session.view().player.actions < minimum) {
        expect(resourceTurns++).toBeLessThan(30);
        session.advance();
      }
    };
    for (let drive = 0; drive < 30 && !unionRow().electionOpen; drive++) {
      earnActions(5);
      session.organizeUnion(UNION_ID);
    }
    expect(session.unionManagement().unions.find((row) => row.id === UNION_ID)!.electionOpen).toBe(true);
    expect(session.castUnionLeadershipVote(UNION_ID)).toMatchObject({ ok: true, pendingLeaderCharacterId: "player" });
    expect(session.unionManagement().unions.find((row) => row.id === UNION_ID)!.ownerType).not.toBe("player");
    expect(session.acceptUnionLeadership(UNION_ID)).toMatchObject({ ok: true, ownerType: "player", ownerId: "player" });

    expect(session.setUnionDues(UNION_ID, Math.min(100, unionRow().maxDuesPerWorkerAnnual)).ok).toBe(true);
    session.advance();
    expect(session.setUnionPoliticalContributions(UNION_ID, 0.5).ok).toBe(true);

    targetId = unionRow().sectors.find((sector) => sector.corporationId === EMPLOYER_ID)?.id;
    expect(targetId).toBeDefined();
    for (let drive = 0; drive < 40; drive++) {
      if (unionRow().sectors.find((sector) => sector.id === targetId)!.unionization >= 99) break;
      earnActions(1);
      while (unionRow().treasury < unionRow().sectors.find((sector) => sector.id === targetId)!.treasuryCost) {
        expect(resourceTurns++).toBeLessThan(30);
        session.advance();
      }
      session.organizeUnionSector(UNION_ID, targetId!);
    }
    const organizedTarget = unionRow().sectors.find((sector) => sector.id === targetId)!;
    expect(organizedTarget.unionization).toBeGreaterThanOrEqual(99);
    expect(organizedTarget.representingUnionId).toBe(UNION_ID);
  }, 120_000);

  it("pays the organizer PAC and continues the complete saved world identically", () => {
    // Keep an otherwise identical saved control at 0% beside the public 50%
    // contribution treatment. Reload both before the ordinary dues turn so
    // this measures the persisted player control and its actual payout.
    const contributionControl = new GameSession();
    contributionControl.load(session.serialize(STAMP));
    expect(contributionControl.setUnionPoliticalContributions(UNION_ID, 0).ok).toBe(true);
    const contributionControlSave = contributionControl.serialize(STAMP);
    contributionControl.load(contributionControlSave);
    const treatmentSave = session.serialize(STAMP);
    session.load(treatmentSave);
    expect(savedWorld(session).unions[UNION_ID]!.politicalContributionPct).toBe(0.5);
    expect(savedWorld(contributionControl).unions[UNION_ID]!.politicalContributionPct).toBe(0);

    const fundsBeforeDuesTurn = savedWorld(session).player.funds;
    const controlFundsBeforeDuesTurn = savedWorld(contributionControl).player.funds;
    const duesTurn = session.view().turn + 1;
    session.advance();
    contributionControl.advance();
    const duesSave = session.serialize(STAMP);
    const duesWorld = savedWorld(session);
    const controlDuesWorld = savedWorld(contributionControl);
    const firstPayout = duesWorld.unionContributionLedger!.filter((row) => row.unionId === UNION_ID && row.turn === duesTurn);
    expect(firstPayout).toHaveLength(1);
    expect(firstPayout[0]).toMatchObject({ recipientId: "player", source: "union_pac", amount: expect.any(Number) });
    expect(firstPayout[0]!.amount).toBeGreaterThan(0);
    expect(
      duesWorld.player.funds - fundsBeforeDuesTurn - (controlDuesWorld.player.funds - controlFundsBeforeDuesTurn),
    ).toBe(firstPayout[0]!.amount);
    expect(controlDuesWorld.unionContributionLedger?.filter((row) => row.unionId === UNION_ID && row.turn === duesTurn) ?? []).toHaveLength(0);

    const resumedDues = new GameSession();
    resumedDues.load(duesSave);
    resumedDues.advance();
    session.advance();
    expect(resumedDues.serialize(STAMP)).toBe(session.serialize(STAMP));
  }, 120_000);

  it("bargains, escalates a strike, saves, and receives the employer response", () => {
    const campaign = session.callUnionBargaining(UNION_ID, EMPLOYER_ID, {
      wageLevel: 1.5,
      agreementDurationTurns: 48,
      noStrikeTurns: 24,
    });
    expect(campaign.status).toBe("negotiating");

    // The autonomous employer answers the actual public call, then the
    // source deadline moves a live negotiation to dispute. No test-side
    // mutation of campaign status or mandate is used.
    let observedEmployerResponse = false;
    for (let turn = 0; turn < 12; turn++) {
      session.advance();
      const current = session.unionBargaining().campaigns[0]!;
      if (current.currentOffer.proposedBy === "employer" || current.status === "settled") observedEmployerResponse = true;
      if (current.status === "dispute") break;
    }
    const disputed = session.unionBargaining().campaigns[0]!;
    expect(observedEmployerResponse).toBe(true);
    expect(disputed.status).toBe("dispute");
    expect(disputed.currentOffer.proposedBy).toBe("employer");

    // Keep a same-state, same-turn control before the selective strike.
    const overtime = session.moveUnionBargaining(disputed.id, "escalate");
    expect(overtime.kind).toBe("moved");
    if (overtime.kind !== "moved") throw new Error("expected overtime-ban move");
    expect(overtime.campaign.escalationLevel).toBe("overtime_ban");

    session.advance();
    const control = new GameSession();
    control.load(session.serialize(STAMP));
    const selective = session.moveUnionBargaining(disputed.id, "escalate");
    expect(selective.kind).toBe("moved");
    if (selective.kind !== "moved") throw new Error("expected selective-strike move");
    expect(selective.campaign.escalationLevel).toBe("selective_strike");
    expect(selective.sectorsStriking).toBeGreaterThan(0);

    session.advance();
    control.advance();
    const treatedWorld = savedWorld(session);
    const controlWorld = savedWorld(control);
    expect(treatedWorld.meta.turn).toBe(controlWorld.meta.turn);
    const treatedAsset = corporateSectorAssets(treatedWorld)[targetId!]!;
    const controlAsset = corporateSectorAssets(controlWorld)[targetId!]!;
    expect(treatedAsset.strikeStartedAtTurn).not.toBeNull();
    expect(controlAsset.strikeStartedAtTurn).toBeNull();
    // This earned journey reaches a demand-limited plant. Game's actual
    // demandThrottleFactor and resolveSectorLabourProductionEffects at
    // 0538f426 reproduce equal output for these saved inputs: sales plus the
    // 15% probe constrain both the 0.75 strike and 0.96 overtime capacity.
    // The source strike still deducts eight margin points and lowers profit;
    // worker expectations and the bargaining mandate also respond to it.
    expect(treatedAsset.producedUnits).toBe(controlAsset.producedUnits);
    expect(treatedWorld.corporations[EMPLOYER_ID]!.revenue).toBe(controlWorld.corporations[EMPLOYER_ID]!.revenue);
    expect(controlAsset.effectiveProfitMargin! - treatedAsset.effectiveProfitMargin!).toBeCloseTo(8, 10);
    expect(treatedAsset.plantsPnl!.profit).toBeLessThan(controlAsset.plantsPnl!.profit);
    expect(treatedAsset.workerExpectationIndex).toBeGreaterThan(controlAsset.workerExpectationIndex ?? controlAsset.wageLevel ?? 1);
    expect(session.unionBargaining().campaigns[0]!.mandate.grievance).toBeGreaterThan(control.unionBargaining().campaigns[0]!.mandate.grievance);

    const afterStrikeSave = session.serialize(STAMP);
    const reloaded = new GameSession();
    reloaded.load(afterStrikeSave);
    expect(reloaded.serialize(STAMP)).toBe(afterStrikeSave);

    // The player answers the employer's offer through the public session,
    // then the employer's autonomous response lands on the next ordinary
    // turn. Reloaded and live twins remain identical through that response.
    const currentOffer = reloaded.unionBargaining().campaigns[0]!.currentOffer;
    const counterTerms = {
      wageLevel: Math.min(1.5, currentOffer.wageLevel + 0.05),
      agreementDurationTurns: currentOffer.agreementDurationTurns,
      noStrikeTurns: currentOffer.noStrikeTurns,
    };
    reloaded.moveUnionBargaining(disputed.id, "counter", counterTerms);
    session.moveUnionBargaining(disputed.id, "counter", counterTerms);
    reloaded.advance();
    session.advance();
    const employerFollowup = reloaded.unionBargaining().campaigns[0];
    expect(employerFollowup).toBeDefined();
    expect(employerFollowup!.status === "settled" || employerFollowup!.currentOffer.proposedBy === "employer").toBe(true);
    expect(reloaded.serialize(STAMP)).toBe(session.serialize(STAMP));
  }, 120_000);
});
