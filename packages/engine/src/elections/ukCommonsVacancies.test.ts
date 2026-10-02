import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { executeAction } from "../actions/execute.js";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";
import { scheduleUkCommonsByElections } from "./ukCommonsVacancies.js";
import { seatHolders } from "./orchestration.js";
import { governmentFormationPhase, governmentVacancyWatcherPhase, triggerSnapElection } from "../government/phases.js";

describe("UK Commons vacancy plumbing", () => {
  it("does not invent a held regional Commons office for an unelected player", () => {
    const world = createWorld({ seed: "commons-no-held-seat", playerName: "UK MP", countryId: "UK", era: "2019" });
    const result = executeAction(world, "player", "resignCommonsSeat", {});
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toContain("do not hold a UK Commons seat");
    expect(world.ukCommonsVacancies).toBeUndefined();
  });

  it("schedules a grouped regional vacancy with the source carve and leaves other regional MPs seated", () => {
    const world = createWorld({ seed: "commons-regional-vacancy-reader", playerName: "UK MP", countryId: "UK", era: "2019" });
    const holder = world.politicians.find((politician) => politician.countryId === "UK" && politician.chamberKey === "commons")!;
    holder.electedState = "LON";
    world.ukCommonsVacancies = [
      { id: "vacancy-a", countryId: "UK", regionId: "LON", formerHolderId: "former-a", seats: 2, reason: "resignation", vacatedTurn: 0, status: "open" },
      { id: "vacancy-b", countryId: "UK", regionId: "LON", formerHolderId: "former-b", seats: 3, reason: "resignation", vacatedTurn: 0, status: "open" },
    ];

    scheduleUkCommonsByElections(world);

    const special = world.elections.find((election) => election.electionType === "special_commons");
    expect(special).toMatchObject({ countryId: "UK", state: "LON", totalSeats: 5, startTurn: world.meta.turn, primaryEndTurn: world.meta.turn + 24, endTurn: world.meta.turn + 48, byElectionCarve: expect.any(Number), vacancyIds: ["vacancy-a", "vacancy-b"] });
    expect(world.ukCommonsVacancies?.every((vacancy) => vacancy.status === "scheduled" && vacancy.electionId === special!.id)).toBe(true);
    expect(seatHolders(world, special!)).toEqual([]);
    expect(holder.chamberKey).toBe("commons");
    const restored = deserializeSave(serializeSave(world, "commons-regional-vacancy-reader"));
    expect(restored.ukCommonsVacancies).toEqual(world.ukCommonsVacancies);
    expect(restored.elections.find((election) => election.id === special!.id)).toEqual(JSON.parse(JSON.stringify(special)));
  });

  it("cancels live Commons specials and reopens their claimed vacancies on a snap", () => {
    const world = createWorld({ seed: "commons-snap-cancels-special", playerName: "UK MP", countryId: "UK", era: "2019" });
    world.ukCommonsVacancies = [{ id: "vacancy-snap", countryId: "UK", regionId: "LON", formerHolderId: "former", seats: 2, reason: "resignation", vacatedTurn: 0, status: "open" }];
    scheduleUkCommonsByElections(world);
    const special = world.elections.find((election) => election.electionType === "special_commons")!;

    governmentFormationPhase.run(world, undefined as never);
    triggerSnapElection(world, "UK", "commons", world.governments.UK!);

    expect(world.elections.find((election) => election.id === special.id)?.status).toBe("cancelled");
    expect(world.ukCommonsVacancies).toMatchObject([expect.objectContaining({ status: "open" })]);
  });

  it("carries a weighted held Commons office into the regional special seat count", () => {
    const world = createWorld({ seed: "commons-weighted-vacancy", playerName: "UK MP", countryId: "UK", era: "2019" });
    world.player.legislativeSeat = { countryId: "UK", chamberKey: "commons", regionId: "LON", seatsHeld: 4 };

    expect(executeAction(world, "player", "resignCommonsSeat", {}).ok).toBe(true);
    expect(world.ukCommonsVacancies).toMatchObject([expect.objectContaining({ regionId: "LON", seats: 4, status: "open" })]);
    scheduleUkCommonsByElections(world);
    expect(world.elections.find((election) => election.electionType === "special_commons")).toMatchObject({ totalSeats: 4, byElectionCarve: expect.any(Number) });
  });

  it("does not arm a first-run UK government's source-absent PM vacancy deadline", () => {
    const world = createWorld({ seed: "commons-initial-pm-deadline", playerName: "UK MP", countryId: "UK", era: "2019" });
    governmentFormationPhase.run(world, undefined as never);
    expect(world.governments.UK?.pmVacancyDeadlineTurn).toBeNull();

    world.meta.turn = 100;
    governmentVacancyWatcherPhase.run(world, undefined as never);
    expect(world.elections.some((election) => election.countryId === "UK" && election.electionType === "snap_commons")).toBe(false);
  });

  it("uses the source generic UK campaign action through the public boundary", () => {
    const world = createWorld({
      seed: "commons-public-generic-campaign",
      playerName: "UK MP",
      countryId: "UK",
      era: "1953",
      homeRegionId: "LON",
      wealth: "high",
      stats: { charisma: 10, debate: 10, energy: 3, fundraising: 1, businessAcumen: 1, statecraft: 1, intellect: 2 },
    });
    advanceTurn(world);
    expect(executeAction(world, "player", "convertCash", { amount: world.player.cash }).ok).toBe(true);
    const before = { actions: world.player.actions, funds: world.player.funds, influence: world.player.politicalInfluence };
    const result = executeAction(world, "player", "campaign", {});
    expect(result, JSON.stringify({ result, before, after: { actions: world.player.actions, funds: world.player.funds, influence: world.player.politicalInfluence } })).toMatchObject({ ok: true });
    expect(world.player.politicalInfluence).toBeGreaterThan(before.influence);
    expect(world.player.actions).toBeLessThan(before.actions);
    expect(world.player.funds).toBeLessThan(before.funds);
  });

  it("carries a public LON candidate through a source campaign, resignation, special race, and save", () => {
    const world = createWorld({
      seed: "commons-public-player-office-probe",
      playerName: "UK MP",
      countryId: "UK",
      era: "1953",
      partyId: "UK_LAB",
      homeRegionId: "LON",
      policies: { economic: -2, social: -3 },
      wealth: "high",
      // The public creator requires exactly 28 stat points. This legal build
      // balances campaign charisma/debate with source fundraising capacity.
      stats: { charisma: 8, debate: 8, energy: 4, fundraising: 5, businessAcumen: 1, statecraft: 1, intellect: 1 },
    });
    advanceTurn(world);
    const regular = world.elections.find((election) => election.countryId === "UK" && election.electionType === "commons" && election.state === "LON");
    expect(regular).toBeDefined();
    expect(executeAction(world, "player", "declareCandidacy", { electionId: regular!.id }).ok).toBe(true);
    expect(executeAction(world, "player", "convertCash", { amount: world.player.cash }).ok).toBe(true);
    let publicCampaignActions = 0;
    let publicFundraiseActions = 0;
    let publicDonorBaseActions = 0;
    let publicAdActions = 0;
    const publicActionFailures: Array<{ turn: number; action: string; error: string }> = [];
    const recordFailure = (action: string, error: string | undefined) => {
      if (publicActionFailures.length < 8 && error) publicActionFailures.push({ turn: world.meta.turn, action, error });
    };
    const campaignIfAvailable = () => {
      while (world.player.donorBaseLevel < 5 && world.player.actions >= 4) {
        const built = executeAction(world, "player", "buildDonorBase", {});
        if (built.ok) publicDonorBaseActions++;
        else {
          recordFailure("buildDonorBase", built.error);
          break;
        }
      }
      if (world.player.favorability < 65 && world.player.actions >= 5 && (world.meta.turn === 1 || world.meta.turn % 8 === 0)) {
        const advertised = executeAction(world, "player", "advertise", {});
        if (advertised.ok) publicAdActions++;
        else recordFailure("advertise", advertised.error);
      }
      if (world.player.politicalInfluence < 100 && world.player.actions > 0) {
        let result = executeAction(world, "player", "campaign", {});
        if (result.ok) publicCampaignActions++;
        else if (result.error?.startsWith("Not enough funds.")) {
          if (world.player.donorBaseLevel <= 0 && world.player.actions >= 4) {
            const built = executeAction(world, "player", "buildDonorBase", {});
            if (built.ok) publicDonorBaseActions++;
            else recordFailure("buildDonorBase", built.error);
          }
          if (world.player.donorBaseLevel > 0 && world.player.actions >= 3) {
            const raised = executeAction(world, "player", "fundraise", {});
            if (raised.ok) {
              publicFundraiseActions++;
              if (world.player.actions > 0) {
                result = executeAction(world, "player", "campaign", {});
                if (result.ok) publicCampaignActions++;
                else recordFailure("campaignAfterFundraise", result.error);
              }
            } else recordFailure("fundraise", raised.error);
          } else recordFailure("campaign", result.error);
        } else recordFailure("campaign", result.error);
      }
    };
    campaignIfAvailable();
    while (regular!.status !== "resolved" && world.meta.turn <= regular!.endTurn) {
      advanceTurn(world);
      campaignIfAvailable();
    }
    expect(regular!.status).toBe("resolved");
    const topVotes = [...Object.entries(regular!.tally)].sort(([, a], [, b]) => b - a).slice(0, 12);
    const candidateInputs = regular!.candidates
      .filter((candidate) => candidate.id === "player" || topVotes.slice(0, 3).some(([id]) => id === candidate.id))
      .map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        partyId: candidate.partyId,
        isNPP: candidate.isNPP,
        support: world.candidateSupports[candidate.id]?.support ?? 50,
        favorability: candidate.id === "player" ? world.player.favorability : world.politicians.find((politician) => politician.id === candidate.id)?.favorability,
        politicalInfluence: candidate.id === "player" ? world.player.politicalInfluence : world.politicians.find((politician) => politician.id === candidate.id)?.politicalInfluence,
        policies: candidate.id === "player" ? world.player.policies : world.politicians.find((politician) => politician.id === candidate.id)?.ideology,
      }));
    expect(world.player.legislativeSeat, JSON.stringify({
      turn: world.meta.turn,
      electionId: regular!.id,
      winnerIds: regular!.winners.slice(0, 5),
      playerVotes: regular!.tally.player,
      topVotes: topVotes.slice(0, 5),
      candidateInputs,
      electorate: {
        population: world.regions.LON?.population,
        votingEligiblePopulation: world.regions.LON?.votingEligiblePopulation,
        categoryWeights: world.stateDemographics.LON?.categoryWeights,
        groups: Object.fromEntries(Object.entries(world.stateDemographics.LON?.groups ?? {}).map(([id, group]) => [id, { population: group.population, economicLean: group.economicLean, socialLean: group.socialLean, turnout: group.turnout }])),
        regionTurnout: world.regionTurnouts.LON,
      },
      partyOrganizations: Object.values(world.partyRegions).filter((row) => row.regionId === "LON" && ["UK_LAB", "UK_CON", "UK_LIB"].includes(row.partyId)),
      playerFavorability: world.player.favorability,
      politicalInfluence: world.player.politicalInfluence,
      donorBaseLevel: world.player.donorBaseLevel,
      finalFunds: world.player.funds,
      publicCampaignActions,
      publicFundraiseActions,
      publicDonorBaseActions,
      publicAdActions,
      publicActionFailures,
    })).toMatchObject({ countryId: "UK", chamberKey: "commons", regionId: "LON" });
    const heldSeats = world.player.legislativeSeat!.seatsHeld ?? 1;
    expect(executeAction(world, "player", "resignCommonsSeat", {}).ok).toBe(true);
    expect(world.ukCommonsVacancies).toMatchObject([expect.objectContaining({ regionId: "LON", formerHolderId: "player", seats: heldSeats, status: "open" })]);

    advanceTurn(world);
    const special = world.elections.find((election) => election.countryId === "UK" && election.electionType === "special_commons" && election.state === "LON");
    expect(special).toMatchObject({ totalSeats: heldSeats, byElectionCarve: expect.any(Number), vacancyIds: [world.ukCommonsVacancies![0]!.id] });
    expect(executeAction(world, "player", "declareCandidacy", { electionId: special!.id }).ok).toBe(true);
    while (special!.status !== "resolved" && world.meta.turn <= special!.endTurn) {
      advanceTurn(world);
      campaignIfAvailable();
    }
    expect(special!.status).toBe("resolved");
    expect(world.ukCommonsVacancies).toMatchObject([expect.objectContaining({ status: "filled", filledById: "player" })]);
    expect(world.player.legislativeSeat).toMatchObject({ countryId: "UK", chamberKey: "commons", regionId: "LON" });
    const restored = deserializeSave(serializeSave(world, "commons-public-player-office-probe"));
    expect(restored.ukCommonsVacancies).toEqual(world.ukCommonsVacancies);
    expect(restored.player.legislativeSeat).toEqual(world.player.legislativeSeat);
    expect(restored.elections.find((election) => election.id === special!.id)).toEqual(JSON.parse(JSON.stringify(special)));
  });
});
