import { describe, expect, it } from "vitest";
import { advanceTurn, deserializeSave, serializeSave } from "@ahdclient/engine";
import { GameSession } from "./session";

const SAVED_AT = "2026-10-02T00:00:00.000Z";

// Exact current Game consequence math + legacy trust board bridge, with the
// source executive route's neutral governing-party context. Source public
// trust has quality span60 and maps to governance.integrity, capped at12.
describe("source investor and trust consequences of executive taking (#75)", () => {
  it.each([
    { tier: "discounted" as const, soci: 0, hit: 5.3, boardDelta: 3.75 },
    { tier: "seizure" as const, soci: 0, hit: 14, boardDelta: 5 },
    { tier: "discounted" as const, soci: 100, hit: 10.3, boardDelta: -8.75 },
    { tier: "seizure" as const, soci: 100, hit: 19, boardDelta: -11.666666666666666 },
  ])("applies $tier private rescue at source concentration $soci and preserves its actual board value and ledger", ({ tier, soci, hit, boardDelta }) => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: `source-taking-politics-${tier}-${soci}`, playerName: "Alex", mode: "hos", homeRegionId: "NY" });
    const saved = JSON.parse(session.serialize(SAVED_AT));
    saved.world.meta.turn = 72;
    Object.assign(saved.world.corporations["US-media"], { nationalizationOwnerKind: "player", ceoVacant: true, ceoVacantSinceTurn: 0 });
    Object.assign(saved.world.budgets.US, { investorConfidence: 70, stateOwnershipConcentration: soci });
    const boards = saved.world.regionalPoliticalMetrics as Record<string, {countryId: string; values: Record<string, number>} >;
    for (const board of Object.values(boards)) if (board.countryId === "US") board.values["governance.integrity"] = 50;
    const foreignBefore = structuredClone(Object.fromEntries(Object.entries(boards).filter(([, board]) => board.countryId !== "US")));
    session.load(JSON.stringify(saved));
    expect(session.act("nationalizeCorporation", { corporationId: "US-media", tier }).ok).toBe(true);
    const taken = JSON.parse(session.serialize(SAVED_AT));
    expect(taken.world.budgets.US.investorConfidence).toBeCloseTo(70 - hit, 10);
    for (const [id, board] of Object.entries(boards)) {
      if (board.countryId === "US") expect(taken.world.regionalPoliticalMetrics[id].values["governance.integrity"]).toBeCloseTo(50 + boardDelta, 10);
      else expect(taken.world.regionalPoliticalMetrics[id]).toEqual(foreignBefore[id]);
    }
    expect(session.stateOwnership().rows[0]).toMatchObject({ confidenceBefore: 70, confidenceAfter: 70 - hit });
    const resumed = new GameSession();
    resumed.load(session.serialize(SAVED_AT));
    expect(resumed.stateOwnership()).toEqual(session.stateOwnership());
    session.advance();
    resumed.advance();
    expect(resumed.serialize(SAVED_AT)).toBe(session.serialize(SAVED_AT));
    expect(JSON.parse(resumed.serialize(SAVED_AT)).world.budgets.US.investorConfidence).toBeCloseTo(70 - hit * 0.95, 3);
  });

  it.each([
    { soci: 0, hit: 8, boardDelta: -3.3333333333333335 },
    { soci: 100, hit: 28, boardDelta: -11.666666666666666 },
  ])("applies a fair legislative taking at source concentration $soci through its actual notice deadline", ({ soci, hit, boardDelta }) => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: `source-fair-legislative-${soci}`, playerName: "Alex", mode: "hos", homeRegionId: "NY" });
    const saved = JSON.parse(session.serialize(SAVED_AT));
    // Recorded player creator and proposal resources, not an earned founding
    // career. A bare passed bill is unpopular even if this issuer is distressed.
    Object.assign(saved.world.corporations["US-media"], { nationalizationOwnerKind: "player", ceoVacant: true, ceoVacantSinceTurn: 0 });
    saved.world.player.nationalInfluence = 5;
    saved.world.executives.US.presidentParty = null;
    Object.assign(saved.world.budgets.US, { investorConfidence: 70, stateOwnershipConcentration: soci });
    for (const board of Object.values(saved.world.regionalPoliticalMetrics) as Array<{ countryId: string; values: Record<string, number> }>) {
      if (board.countryId === "US") board.values["governance.integrity"] = 50;
    }
    session.load(JSON.stringify(saved));
    expect(session.act("sponsorBill", { catalogId: "state_ownership.nationalize", corporationId: "US-media" }).ok).toBe(true);
    const notice = JSON.parse(session.serialize(SAVED_AT));
    expect(notice.world.pendingNationalizations[0]).toMatchObject({ method: "legislative", tier: "fair", triggers: ["supermajority"], governingPartyId: null, noticeDeadlineTurn: 48 });
    expect(notice.world.corporations["US-media"]).toBeDefined();
    // Recorded near-deadline continuation; ordinary advanceTurn owns expiry.
    notice.world.meta.turn = 47;
    const direct = deserializeSave(JSON.stringify(notice));
    const resumed = deserializeSave(serializeSave(direct, SAVED_AT));
    const beforeBoards = structuredClone(direct.regionalPoliticalMetrics);
    let boardChecks = 0;
    advanceTurn(direct, {
      afterPhase(name, observed) {
        if (name !== "corporationTurn") return;
        expect(observed.stateOwnershipLedger?.at(-1)).toMatchObject({ method: "legislative", confidenceBefore: 70, confidenceAfter: 70 - hit });
        for (const [id, before] of Object.entries(beforeBoards ?? {})) {
          const after = observed.regionalPoliticalMetrics![id]!;
          if (before.countryId === "US") {
            expect(after.values["governance.integrity"]).toBeCloseTo(50 + boardDelta, 10);
            boardChecks++;
          } else expect(after).toEqual(before);
        }
      },
    });
    advanceTurn(resumed);
    expect(boardChecks).toBeGreaterThan(0);
    expect(serializeSave(resumed, SAVED_AT)).toBe(serializeSave(direct, SAVED_AT));
    session.load(serializeSave(direct, SAVED_AT));
    expect(JSON.parse(session.serialize(SAVED_AT)).world.budgets.US.investorConfidence).toBeCloseTo(70 - hit * 0.95, 10);
    const reloadedSession = new GameSession();
    reloadedSession.load(session.serialize(SAVED_AT));
    session.advance();
    reloadedSession.advance();
    expect(reloadedSession.serialize(SAVED_AT)).toBe(session.serialize(SAVED_AT));
  });

  it("leaves NPC takings' investor confidence and political board untouched even at high state concentration", () => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "source-npc-no-political-hit", playerName: "Alex", mode: "hos", homeRegionId: "NY" });
    const saved = JSON.parse(session.serialize(SAVED_AT));
    Object.assign(saved.world.budgets.US, { investorConfidence: 60, stateOwnershipConcentration: 100 });
    session.load(JSON.stringify(saved));
    expect(session.act("nationalizeCorporation", { corporationId: "US-media", tier: "discounted" }).ok).toBe(true);
    const taken = JSON.parse(session.serialize(SAVED_AT));
    expect(taken.world.budgets.US.investorConfidence).toBe(60);
    expect(taken.world.regionalPoliticalMetrics).toEqual(saved.world.regionalPoliticalMetrics);
    expect(session.stateOwnership().rows[0]).toMatchObject({ confidenceBefore: 60, confidenceAfter: 60 });
  });
});
