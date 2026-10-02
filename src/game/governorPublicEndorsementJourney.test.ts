import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

/**
 * Negative player-reachability witness for #98, not a completion claim. The
 * character is created through the public 1953 flow, joins the GOP, wins its
 * primary, and uses public campaign actions. The current Native result still
 * elects the Democratic NPC in WY, so no governor power or endorsement
 * consumer can honestly be reached by this run.
 */
describe("source-backed public governor reachability evidence", () => {
  it("records a public Wyoming Republican primary win followed by the current Democratic general winner", () => {
    const session = new GameSession();
    let view = session.create({
      era: "1953",
      countryId: "US",
      seed: "public-governor-wy-rep-01",
      playerName: "Alex",
      homeRegionId: "WY",
      creation: {
        name: "Alex",
        homeRegionId: "WY",
        partyId: null,
        policies: { economic: 3, social: 2 },
        demographics: { race: "white", gender: "male", education: "college", wealth: "middle" },
      },
    });
    expect(view.player.homeRegionId).toBe("WY");
    expect(session.act("joinParty", { partyId: "US_REP" }).ok).toBe(true);
    view = session.advance();

    const governorRaceId = "governor:US:WY:c1";
    let governorRace = view.elections.find((race) => race.id === governorRaceId);
    expect(governorRace).toMatchObject({ electionType: "governor", status: "active", phase: "primary", candidacy: { available: true } });
    expect(session.act("declareCandidacy", { electionId: governorRaceId }).ok).toBe(true);

    const filedSave = session.serialize("2026-10-02T00:00:00.000Z");
    const filedState = JSON.parse(filedSave) as { world: { elections: Array<{ id: string; primaryEndTurn: number; endTurn: number; candidates: Array<{ id: string }> }> } };
    const filedRace = filedState.world.elections.find((race) => race.id === governorRaceId)!;
    expect(filedRace.candidates.some((candidate) => candidate.id === "player")).toBe(true);
    const primaryEndTurn = filedRace.primaryEndTurn;

    const primaryReload = new GameSession();
    view = primaryReload.load(filedSave);
    while (view.turn <= primaryEndTurn) view = primaryReload.advance();
    const primaryState = JSON.parse(primaryReload.serialize("2026-10-02T00:00:00.000Z")) as {
      world: { elections: Array<{ id: string; primaryResults?: { byParty: Record<string, Array<{ candidateId: string; won: boolean }>> } }> };
    };
    const primaryRace = primaryState.world.elections.find((race) => race.id === governorRaceId)!;
    const playerPrimary = primaryRace.primaryResults?.byParty.US_REP?.find((entry) => entry.candidateId === "player");
    expect(playerPrimary?.won, `source Republican primary result: ${JSON.stringify(primaryRace.primaryResults?.byParty.US_REP)}`).toBe(true);

    const beforeGeneralSave = primaryReload.serialize("2026-10-02T00:00:00.000Z");
    const generalState = JSON.parse(beforeGeneralSave) as { world: { elections: Array<{ id: string; endTurn: number }> } };
    const generalEndTurn = generalState.world.elections.find((race) => race.id === governorRaceId)!.endTurn;
    const generalReload = new GameSession();
    view = generalReload.load(beforeGeneralSave);

    let successfulAds = 0;
    let adAttempt = 0;
    const favorableGroups = ["evangelicals", "rural_traditionalists", "small_business", "libertarians"];
    while (view.turn <= generalEndTurn) {
      if ((view.turn - primaryEndTurn) % 3 === 0) {
        const politics = generalReload.politics();
        const campaign = politics.elections.find((race) => race.id === governorRaceId)?.playerCampaign;
        const groupId = favorableGroups[adAttempt % favorableGroups.length]!;
        const target = campaign?.targetedAds.targets.find((entry) => entry.group === groupId && !entry.maxed);
        if (campaign?.targetedAds.action.available && target) {
          const result = generalReload.act("campaignTargetedAd", {
            electionId: governorRaceId,
            regionId: "WY",
            demographicCategory: target.category,
            demographicGroup: target.group,
          });
          if (result.ok) successfulAds += 1;
          adAttempt += 1;
        }
      }
      view = generalReload.advance();
    }
    expect(successfulAds).toBeGreaterThan(0);

    const governorResult = JSON.parse(generalReload.serialize("2026-10-02T00:00:00.000Z")) as {
      world: { elections: Array<{ id: string; winners?: string[] }> };
    };
    const resolvedGovernorRace = governorResult.world.elections.find((race) => race.id === governorRaceId)!;
    expect(resolvedGovernorRace.winners).toEqual(["US-CH:governor:US:WY:c1:US_DEM:0"]);
  }, 900_000);
});
