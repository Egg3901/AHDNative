import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

const SAVED_AT = "2026-10-03T11:00:00.000Z";

describe("party merger public session boundary", () => {
  it("records only committed actions, persists the proposal and replays a frozen-clock continuation", () => {
    const observedAtMs = Date.parse(SAVED_AT);
    const clock = () => observedAtMs;
    const created = new GameSession({ clock });
    created.create({ era: "1953", countryId: "US", seed: "merger-session-clock", playerName: "Morgan" });
    expect(created.act("joinParty", { partyId: "US_DEM" }).ok).toBe(true);

    // A declared eligible-chair fixture isolates the public proposal command;
    // no second human committee member or approval is fabricated.
    const setup = JSON.parse(created.serialize(SAVED_AT)) as {
      world: {
        parties: Record<string, { chairId: string | null }>;
        player: { actions: number; funds: number; partyActivityPendingByTurn?: Record<string, number> };
      };
    };
    expect(setup.world.player.partyActivityPendingByTurn).toBeUndefined();
    setup.world.parties.US_DEM!.chairId = "player";
    const playerBeforeProposal = { ...setup.world.player };
    const session = new GameSession({ clock });
    session.load(JSON.stringify(setup));

    const proposalAction = session.act("proposePartyMerger", { targetPartyId: "US_REP" });
    expect(proposalAction.ok).toBe(true);
    expect(session.view().player.actions).toBe(playerBeforeProposal.actions);
    expect(session.view().player.funds).toBe(playerBeforeProposal.funds);
    expect(session.partyManagement().merger?.proposals).toEqual([
      expect.objectContaining({ proposerPartyName: "Democratic Party", targetPartyName: "Republican Party", status: "open" }),
    ]);

    expect(session.act("fundraise").ok).toBe(true);
    expect(session.act("fundraise").ok).toBe(true);
    const refused = session.act("proposePartyMerger", { targetPartyId: "US_REP" });
    expect(refused.ok).toBe(false);
    session.advance();

    const saved = session.serialize(SAVED_AT);
    const save = JSON.parse(saved) as {
      world: {
        partyMergerProposals?: Array<{ id: string; status: string }>;
        player: {
          partyActivityPendingByTurn?: Record<string, number>;
          partyActivitySummaries?: Array<{ timestampMs: number; actionCount: number }>;
        };
      };
    };
    expect(save.world.partyMergerProposals).toEqual([
      expect.objectContaining({ status: "open" }),
    ]);
    expect(save.world.player.partyActivityPendingByTurn).toBeUndefined();
    expect(save.world.player.partyActivitySummaries).toEqual([
      { timestampMs: observedAtMs, actionCount: 2 },
    ]);

    const resumed = new GameSession({ clock });
    resumed.load(saved);
    const control = new GameSession({ clock });
    control.load(saved);
    resumed.advance();
    control.advance();
    expect(resumed.serialize(SAVED_AT)).toBe(control.serialize(SAVED_AT));
  });
});
