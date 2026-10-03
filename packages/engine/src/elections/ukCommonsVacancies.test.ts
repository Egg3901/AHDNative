import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { executeAction } from "../actions/execute.js";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";
import { scheduleUkCommonsByElections } from "./ukCommonsVacancies.js";
import { recomputeComposition, seatHolders } from "./orchestration.js";
import {
  governmentFormationPhase,
  governmentVacancyWatcherPhase,
  triggerSnapElection,
} from "../government/phases.js";
import { enrichCandidates } from "../electionEngine/candidateEnrichment.js";
import { writeFileSync } from "node:fs";

describe("UK Commons vacancy plumbing", () => {
  it("does not invent a held regional Commons office for an unelected player", () => {
    const world = createWorld({
      seed: "commons-no-held-seat",
      playerName: "UK MP",
      countryId: "UK",
      era: "2019",
    });
    const result = executeAction(world, "player", "resignCommonsSeat", {});
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toContain(
      "do not hold a UK Commons seat",
    );
    expect(world.ukCommonsVacancies).toBeUndefined();
  });

  it("crosses the floor through the public action and records the exact weighted Commons vacancy", () => {
    const world = createWorld({ seed: "commons-defection-action", playerName: "UK MP", countryId: "UK", era: "2019" });
    world.player.actions = 0;
    expect(executeAction(world, "player", "joinParty", { partyId: "UK_LAB" }).ok).toBe(true);
    world.player.legislativeSeat = { countryId: "UK", chamberKey: "commons", regionId: "LON", seatsHeld: 3 };

    const result = executeAction(world, "player", "defectCommonsSeat", { partyId: "UK_CON" });

    expect(result.ok).toBe(true);
    expect(world.player.partyId).toBe("UK_CON");
    expect(world.player.legislativeSeat).toBeNull();
    expect(world.ukCommonsVacancies).toEqual([expect.objectContaining({
      countryId: "UK",
      regionId: "LON",
      formerHolderId: "player",
      seats: 3,
      reason: "defection",
      status: "open",
    })]);
    const restored = deserializeSave(serializeSave(world, "commons-defection-action"));
    expect(restored.ukCommonsVacancies).toEqual(world.ukCommonsVacancies);
    expect(restored.player.partyId).toBe("UK_CON");
  });

  it("turns an existing retired Commons office into a weighted vacancy on the ordinary watcher", () => {
    const world = createWorld({ seed: "commons-retirement-watcher", playerName: "UK MP", countryId: "UK", era: "2019" });
    const holder = world.politicians.find((politician) => politician.countryId === "UK" && politician.chamberKey === "commons")!;
    holder.electedState = "LON";
    holder.seatsHeld = 4;
    holder.retiredAt = "2019-01-01T00:00:00.000Z";
    recomputeComposition(world, "UK", "commons");
    const beforePartySeats = world.legislatures.UK!.chambers.find((chamber) => chamber.key === "commons")!.composition.seatsByParty[holder.partyId] ?? 0;

    advanceTurn(world);
    expect(world.meta.turn).toBe(1);

    expect(holder.chamberKey).toBe("");
    expect(world.ukCommonsVacancies).toEqual([expect.objectContaining({
      formerHolderId: holder.id,
      regionId: "LON",
      seats: 4,
      reason: "retirement",
      status: "scheduled",
    })]);
    expect(world.legislatures.UK!.chambers.find((chamber) => chamber.key === "commons")!.composition.seatsByParty[holder.partyId] ?? 0).toBe(beforePartySeats - 4);
    expect(deserializeSave(serializeSave(world, "commons-retirement-watcher")).ukCommonsVacancies).toEqual(world.ukCommonsVacancies);
  });

  it("schedules a grouped regional vacancy with the source carve and leaves other regional MPs seated", () => {
    const world = createWorld({
      seed: "commons-regional-vacancy-reader",
      playerName: "UK MP",
      countryId: "UK",
      era: "2019",
    });
    const holder = world.politicians.find(
      (politician) =>
        politician.countryId === "UK" && politician.chamberKey === "commons",
    )!;
    holder.electedState = "LON";
    world.ukCommonsVacancies = [
      {
        id: "vacancy-a",
        countryId: "UK",
        regionId: "LON",
        formerHolderId: "former-a",
        seats: 2,
        reason: "resignation",
        vacatedTurn: 0,
        status: "open",
      },
      {
        id: "vacancy-b",
        countryId: "UK",
        regionId: "LON",
        formerHolderId: "former-b",
        seats: 3,
        reason: "resignation",
        vacatedTurn: 0,
        status: "open",
      },
    ];

    scheduleUkCommonsByElections(world);

    const special = world.elections.find(
      (election) => election.electionType === "special_commons",
    );
    expect(special).toMatchObject({
      countryId: "UK",
      state: "LON",
      totalSeats: 5,
      startTurn: world.meta.turn,
      primaryEndTurn: world.meta.turn + 24,
      endTurn: world.meta.turn + 48,
      byElectionCarve: expect.any(Number),
      vacancyIds: ["vacancy-a", "vacancy-b"],
    });
    expect(
      world.ukCommonsVacancies?.every(
        (vacancy) =>
          vacancy.status === "scheduled" && vacancy.electionId === special!.id,
      ),
    ).toBe(true);
    expect(seatHolders(world, special!)).toEqual([]);
    expect(holder.chamberKey).toBe("commons");
    const restored = deserializeSave(
      serializeSave(world, "commons-regional-vacancy-reader"),
    );
    expect(restored.ukCommonsVacancies).toEqual(world.ukCommonsVacancies);
    expect(
      restored.elections.find((election) => election.id === special!.id),
    ).toEqual(JSON.parse(JSON.stringify(special)));
  });

  it("cancels live Commons specials and reopens their claimed vacancies on a snap", () => {
    const world = createWorld({
      seed: "commons-snap-cancels-special",
      playerName: "UK MP",
      countryId: "UK",
      era: "2019",
    });
    world.ukCommonsVacancies = [
      {
        id: "vacancy-snap",
        countryId: "UK",
        regionId: "LON",
        formerHolderId: "former",
        seats: 2,
        reason: "resignation",
        vacatedTurn: 0,
        status: "open",
      },
    ];
    scheduleUkCommonsByElections(world);
    const special = world.elections.find(
      (election) => election.electionType === "special_commons",
    )!;

    governmentFormationPhase.run(world, undefined as never);
    triggerSnapElection(world, "UK", "commons", world.governments.UK!);

    expect(
      world.elections.find((election) => election.id === special.id)?.status,
    ).toBe("cancelled");
    expect(world.ukCommonsVacancies).toMatchObject([
      expect.objectContaining({ status: "open" }),
    ]);
  });

  it("carries a weighted held Commons office into the regional special seat count", () => {
    const world = createWorld({
      seed: "commons-weighted-vacancy",
      playerName: "UK MP",
      countryId: "UK",
      era: "2019",
    });
    world.player.legislativeSeat = {
      countryId: "UK",
      chamberKey: "commons",
      regionId: "LON",
      seatsHeld: 4,
    };

    expect(executeAction(world, "player", "resignCommonsSeat", {}).ok).toBe(
      true,
    );
    expect(world.ukCommonsVacancies).toMatchObject([
      expect.objectContaining({ regionId: "LON", seats: 4, status: "open" }),
    ]);
    scheduleUkCommonsByElections(world);
    expect(
      world.elections.find(
        (election) => election.electionType === "special_commons",
      ),
    ).toMatchObject({ totalSeats: 4, byElectionCarve: expect.any(Number) });
  });

  it("does not arm a first-run UK government's source-absent PM vacancy deadline", () => {
    const world = createWorld({
      seed: "commons-initial-pm-deadline",
      playerName: "UK MP",
      countryId: "UK",
      era: "2019",
    });
    governmentFormationPhase.run(world, undefined as never);
    expect(world.governments.UK?.pmVacancyDeadlineTurn).toBeNull();

    world.meta.turn = 100;
    governmentVacancyWatcherPhase.run(world, undefined as never);
    expect(
      world.elections.some(
        (election) =>
          election.countryId === "UK" &&
          election.electionType === "snap_commons",
      ),
    ).toBe(false);
  });

  it("uses the source generic UK campaign action through the public boundary", () => {
    const world = createWorld({
      seed: "commons-public-generic-campaign",
      playerName: "UK MP",
      countryId: "UK",
      era: "1953",
      homeRegionId: "LON",
      wealth: "high",
      stats: {
        charisma: 10,
        debate: 10,
        energy: 3,
        fundraising: 1,
        businessAcumen: 1,
        statecraft: 1,
        intellect: 2,
      },
    });
    advanceTurn(world);
    expect(
      executeAction(world, "player", "convertCash", {
        amount: world.player.cash,
      }).ok,
    ).toBe(true);
    const before = {
      actions: world.player.actions,
      funds: world.player.funds,
      influence: world.player.politicalInfluence,
    };
    const result = executeAction(world, "player", "campaign", {});
    expect(
      result,
      JSON.stringify({
        result,
        before,
        after: {
          actions: world.player.actions,
          funds: world.player.funds,
          influence: world.player.politicalInfluence,
        },
      }),
    ).toMatchObject({ ok: true });
    expect(world.player.politicalInfluence).toBeGreaterThan(before.influence);
    expect(world.player.actions).toBeLessThan(before.actions);
    expect(world.player.funds).toBeLessThan(before.funds);
  });

  it("carries a public NIR candidate through a source campaign, resignation, special race, and save", () => {
    const world = createWorld({
      seed: "commons-public-player-nir-sf-probe",
      playerName: "UK MP",
      countryId: "UK",
      era: "1953",
      partyId: "UK_SF",
      homeRegionId: "NIR",
      policies: { economic: -3, social: -2 },
      wealth: "high",
      // The public creator requires exactly 28 stat points. This legal build
      // balances campaign charisma/debate with source fundraising capacity.
      stats: {
        charisma: 8,
        debate: 8,
        energy: 4,
        fundraising: 5,
        businessAcumen: 1,
        statecraft: 1,
        intellect: 1,
      },
    });
    advanceTurn(world);
    const regular = world.elections.find(
      (election) =>
        election.countryId === "UK" &&
        election.electionType === "commons" &&
        election.state === "NIR",
    );
    expect(regular).toBeDefined();
    expect(
      executeAction(world, "player", "declareCandidacy", {
        electionId: regular!.id,
      }).ok,
    ).toBe(true);
    expect(
      executeAction(world, "player", "convertCash", {
        amount: world.player.cash,
      }).ok,
    ).toBe(true);
    let publicCampaignActions = 0;
    let publicFundraiseActions = 0;
    let publicDonorBaseActions = 0;
    let publicAdActions = 0;
    const publicActionFailures: Array<{
      turn: number;
      action: string;
      error: string;
    }> = [];
    const tallyInputTrace: unknown[] = [];
    const advanceObservedTurn = () =>
      advanceTurn(world, {
        observeElectionTallyInput: (snapshot) => {
          const diagnostic = snapshot as {
            election?: { _id?: string; state?: string };
          };
          if (
            diagnostic.election?._id === regular!.id &&
            diagnostic.election.state === "NIR"
          )
            tallyInputTrace.push(snapshot);
        },
      });
    const recordFailure = (action: string, error: string | undefined) => {
      if (publicActionFailures.length < 8 && error)
        publicActionFailures.push({ turn: world.meta.turn, action, error });
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
      if (
        world.player.favorability < 65 &&
        world.player.actions >= 5 &&
        (world.meta.turn === 1 || world.meta.turn % 8 === 0)
      ) {
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
    while (
      regular!.status !== "resolved" &&
      world.meta.turn <= regular!.endTurn
    ) {
      advanceObservedTurn();
      campaignIfAvailable();
    }
    expect(regular!.status).toBe("resolved");
    const diagnosticPath = process.env.AHD_ELECTION_TALLY_TRACE_PATH;
    const jsonReplacer = (_key: string, value: unknown) => {
      if (value instanceof Map)
        return { __type: "Map", entries: [...value.entries()] };
      if (value instanceof Set)
        return { __type: "Set", values: [...value.values()] };
      return value;
    };
    if (diagnosticPath) {
      writeFileSync(
        diagnosticPath,
        JSON.stringify(
          {
            provenance: {
              sourceCommit: process.env.AHD_SOURCE_COMMIT ?? null,
              nativeRuntimeCommit: process.env.AHD_NATIVE_RUNTIME_COMMIT ?? null,
              strategyOriginCommit: "6ab2a01d559a2f46b793bced5cfa36e298ab4522",
              seed: "commons-public-player-nir-sf-probe",
              regionId: "NIR",
              electionId: regular!.id,
              finalTurn: world.meta.turn,
            },
            tallyInputTrace,
            finalElection: {
              totalSeats: regular!.totalSeats,
              countryId: regular!.countryId,
              electionType: regular!.electionType,
              winners: regular!.winners,
              tally: regular!.tally,
              candidateIds: regular!.candidates.map((candidate) => ({
                id: candidate.id,
                partyId: candidate.partyId,
                isNPP: candidate.isNPP,
                name: candidate.name,
              })),
            },
          },
          jsonReplacer,
        ),
      );
    }
    // This must replay the observed legal public-action journey exactly. Every
    // observed per-turn distributor output matched pinned Game 0538, and the
    // source tally rounds each candidate increment before adding it to the
    // persisted total.
    expect({
      turn: world.meta.turn,
      playerVotes: regular!.tally.player,
    }).toEqual({ turn: 123, playerVotes: 104179 });
    const topVotes = [...Object.entries(regular!.tally)]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 12);
    const observedIds = new Set([
      "player",
      ...topVotes.slice(0, 3).map(([id]) => id),
    ]);
    const observedCandidates = regular!.candidates.filter((candidate) =>
      observedIds.has(candidate.id),
    );
    const tallyInputs = enrichCandidates(
      observedCandidates.map((candidate) => ({
        _id: candidate.id,
        electionId: regular!.id,
        characterId: candidate.id,
        nppId: candidate.isNPP ? candidate.id : null,
        characterName: candidate.name,
        party: candidate.partyId,
        isNPP: candidate.isNPP,
        support: world.candidateSupports[candidate.id]?.support ?? 50,
      })),
      {
        parties: Object.values(world.parties)
          .filter((party) => party.countryId === "UK")
          .map((party) => ({
            sequentialId: party.id,
            countryId: party.countryId,
            abbreviation: party.abbreviation,
            economicPosition: party.economicPosition,
            socialPosition: party.socialPosition,
          })),
        characters: observedCandidates.some(
          (candidate) => candidate.id === "player",
        )
          ? [
              {
                _id: "player",
                policies: world.player.policies ?? { economic: 0, social: 0 },
                favorability: world.player.favorability,
                politicalInfluence: world.player.politicalInfluence,
                ...(typeof world.player.nationalInfluence === "number"
                  ? { nationalInfluence: world.player.nationalInfluence }
                  : {}),
                ...(typeof world.player.partyInfluence === "number"
                  ? { partyInfluence: world.player.partyInfluence }
                  : {}),
                infamy: world.player.infamy,
              },
            ]
          : [],
        npps: observedCandidates.flatMap((candidate) => {
          const politician = world.politicians.find(
            (entry) => entry.id === candidate.id,
          );
          return candidate.isNPP && politician
            ? [
                {
                  _id: candidate.id,
                  policies: politician.ideology,
                  favorability: politician.favorability,
                  politicalInfluence: politician.politicalInfluence,
                },
              ]
            : [];
        }),
        includePartyPositions: true,
      },
    );
    expect(
      world.player.legislativeSeat,
      JSON.stringify({
        turn: world.meta.turn,
        electionId: regular!.id,
        winnerIds: regular!.winners?.slice(0, 5),
        playerVotes: regular!.tally.player,
        topVotes: topVotes.slice(0, 5),
        tallyInputs,
        electorate: {
          population: world.regions.NIR?.population,
          votingEligiblePopulation: world.regions.NIR?.votingEligiblePopulation,
          categoryWeights: world.stateDemographics.NIR?.categoryWeights,
          groups: Object.fromEntries(
              Object.entries(world.stateDemographics.NIR?.groups ?? {}).map(
              ([id, group]) => [
                id,
                {
                  population: group.population,
                  economicLean: group.economicLean,
                  socialLean: group.socialLean,
                  turnout: group.turnout,
                },
              ],
            ),
          ),
          regionTurnout: world.regionTurnouts.NIR,
        },
        partyOrganizations: Object.values(world.partyRegions).filter(
          (row) =>
            row.regionId === "NIR" &&
            ["UK_SF", "UK_CON", "UK_LAB"].includes(row.partyId),
        ),
        playerFavorability: world.player.favorability,
        politicalInfluence: world.player.politicalInfluence,
        donorBaseLevel: world.player.donorBaseLevel,
        finalFunds: world.player.funds,
        publicCampaignActions,
        publicFundraiseActions,
        publicDonorBaseActions,
        publicAdActions,
        publicActionFailures,
        diagnosticPath,
      }),
    ).toMatchObject({
      countryId: "UK",
      chamberKey: "commons",
      regionId: "NIR",
    });
    const heldSeats = world.player.legislativeSeat!.seatsHeld ?? 1;
    expect(heldSeats).toBe(3);
    expect(executeAction(world, "player", "resignCommonsSeat", {}).ok).toBe(
      true,
    );
    expect(world.ukCommonsVacancies).toMatchObject([
      expect.objectContaining({
        regionId: "NIR",
        formerHolderId: "player",
        seats: heldSeats,
        status: "open",
      }),
    ]);

    advanceTurn(world);
    const special = world.elections.find(
      (election) =>
        election.countryId === "UK" &&
        election.electionType === "special_commons" &&
        election.state === "NIR",
    );
    expect(special).toMatchObject({
      totalSeats: heldSeats,
      byElectionCarve: expect.any(Number),
      vacancyIds: [world.ukCommonsVacancies![0]!.id],
    });
    expect(
      executeAction(world, "player", "declareCandidacy", {
        electionId: special!.id,
      }).ok,
    ).toBe(true);
    while (
      special!.status !== "resolved" &&
      world.meta.turn <= special!.endTurn
    ) {
      advanceTurn(world);
      campaignIfAvailable();
    }
    expect(special!.status).toBe("resolved");
    expect(world.ukCommonsVacancies).toMatchObject([
      expect.objectContaining({ status: "filled", filledById: "player" }),
    ]);
    expect(world.player.legislativeSeat).toMatchObject({
      countryId: "UK",
      chamberKey: "commons",
      regionId: "NIR",
    });
    const restored = deserializeSave(
      serializeSave(world, "commons-public-player-nir-sf-probe"),
    );
    expect(restored.ukCommonsVacancies).toEqual(world.ukCommonsVacancies);
    expect(restored.player.legislativeSeat).toEqual(
      world.player.legislativeSeat,
    );
    expect(
      restored.elections.find((election) => election.id === special!.id),
    ).toEqual(JSON.parse(JSON.stringify(special)));
  });
});
