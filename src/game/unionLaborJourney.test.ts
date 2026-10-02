import { describe, expect, it } from "vitest";
import { corporateSectorAssets, createWorld, serializeSave } from "@ahdclient/engine";
import { GameSession } from "./session";

const UNION_ID = "US-manufacturing";
const EMPLOYER_ID = "US-manufacturing";
const STAMP = "2026-10-02T00:00:00Z";

function savedWorld(session: GameSession) {
  return JSON.parse(session.serialize(STAMP)).world as ReturnType<typeof createWorld>;
}

describe("union labor journey through the public session", () => {
  it("organizes, elects, funds, bargains, strikes, saves, and receives an employer response", () => {
    const session = new GameSession();
    session.create({ seed: "union-public-labor-journey", playerName: "Alex", countryId: "US", era: "1953" });

    // The accepted #322 public-action fixture supplies enough starting AP and
    // strike-fund cash to exercise the source journey without assigning the
    // presidency, manufacturing a bargaining state, or editing local density.
    const initial = savedWorld(session);
    initial.player.actions = 100;
    initial.unions[UNION_ID]!.treasury = 1_000_000;
    session.load(serializeSave(initial, STAMP));

    for (let drive = 0; drive < 12 && !session.unionManagement().unions.find((row) => row.id === UNION_ID)!.electionOpen; drive++) {
      session.organizeUnion(UNION_ID);
    }
    expect(session.unionManagement().unions.find((row) => row.id === UNION_ID)!.electionOpen).toBe(true);
    expect(session.castUnionLeadershipVote(UNION_ID)).toMatchObject({ ok: true, pendingLeaderCharacterId: "player" });
    expect(session.unionManagement().unions.find((row) => row.id === UNION_ID)!.ownerType).not.toBe("player");
    expect(session.acceptUnionLeadership(UNION_ID)).toMatchObject({ ok: true, ownerType: "player", ownerId: "player" });

    const unionRow = () => session.unionManagement().unions.find((row) => row.id === UNION_ID)!;
    expect(session.setUnionDues(UNION_ID, Math.min(100, unionRow().maxDuesPerWorkerAnnual)).ok).toBe(true);
    expect(session.setUnionPoliticalContributions(UNION_ID, 0.5).ok).toBe(true);

    const targetId = unionRow().sectors.find((sector) => sector.corporationId === EMPLOYER_ID)?.id;
    expect(targetId).toBeDefined();
    for (let drive = 0; drive < 40; drive++) {
      if (unionRow().sectors.find((sector) => sector.id === targetId)!.unionization >= 99) break;
      session.organizeUnionSector(UNION_ID, targetId!);
    }
    const organizedTarget = unionRow().sectors.find((sector) => sector.id === targetId)!;
    expect(organizedTarget.unionization).toBeGreaterThanOrEqual(99);
    expect(organizedTarget.representingUnionId).toBe(UNION_ID);

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
    session.advance();
    contributionControl.advance();
    const duesSave = session.serialize(STAMP);
    const duesWorld = savedWorld(session);
    const controlDuesWorld = savedWorld(contributionControl);
    const firstPayout = duesWorld.unionContributionLedger!.filter((row) => row.unionId === UNION_ID && row.turn === 1);
    expect(firstPayout).toHaveLength(1);
    expect(firstPayout[0]).toMatchObject({ recipientId: "player", source: "union_pac", amount: expect.any(Number) });
    expect(firstPayout[0]!.amount).toBeGreaterThan(0);
    expect(
      duesWorld.player.funds - fundsBeforeDuesTurn - (controlDuesWorld.player.funds - controlFundsBeforeDuesTurn),
    ).toBe(firstPayout[0]!.amount);
    expect(controlDuesWorld.unionContributionLedger?.filter((row) => row.unionId === UNION_ID && row.turn === 1) ?? []).toHaveLength(0);

    const resumedDues = new GameSession();
    resumedDues.load(duesSave);
    resumedDues.advance();
    session.advance();
    expect(savedWorld(resumedDues)).toEqual(savedWorld(session));

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
    control.advance();
    const selective = session.moveUnionBargaining(disputed.id, "escalate");
    expect(selective.kind).toBe("moved");
    if (selective.kind !== "moved") throw new Error("expected selective-strike move");
    expect(selective.campaign.escalationLevel).toBe("selective_strike");
    expect(selective.sectorsStriking).toBeGreaterThan(0);

    session.advance();
    control.advance();
    const treatedWorld = savedWorld(session);
    const controlWorld = savedWorld(control);
    const treatedAsset = corporateSectorAssets(treatedWorld)[targetId!]!;
    const controlAsset = corporateSectorAssets(controlWorld)[targetId!]!;
    expect(treatedAsset.strikeStartedAtTurn).not.toBeNull();
    // This live-session twin includes the prior overtime-ban turn, and the
    // strike also changes worker expectations. The isolated source factor
    // (0.75 versus idle, 0.96 for overtime ban) is asserted in
    // corporationLabour.test.ts; here require the matched live output to fall.
    expect(treatedAsset.producedUnits).toBeLessThan(controlAsset.producedUnits!);
    expect(treatedWorld.corporations[EMPLOYER_ID]!.revenue).toBeLessThan(controlWorld.corporations[EMPLOYER_ID]!.revenue);

    const afterStrikeSave = session.serialize(STAMP);
    const reloaded = new GameSession();
    reloaded.load(afterStrikeSave);
    expect(savedWorld(reloaded)).toEqual(treatedWorld);

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
    expect(savedWorld(reloaded)).toEqual(savedWorld(session));
  }, 120_000);
});
