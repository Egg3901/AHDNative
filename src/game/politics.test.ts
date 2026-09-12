import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { createWorld, declareCandidacy, resolvePrimaries, advanceTurn } from "@ahdclient/engine";
import { GameSession } from "./session";
import { projectPolitics } from "./politics";

const options = { era: "1953", countryId: "US", seed: "native-politics-v1", playerName: "Alex" };
const SAVED_AT = "2026-09-10T00:00:00.000Z";
const DEM = "US_DEM";
const REP = "US_REP";

function freshPolitics() {
  const session = new GameSession(); session.create(options); return session.politics();
}

describe("projectPolitics", () => {
  it("exposes country parties with ideology, tier, org and member roster", () => {
    const politics = freshPolitics();
    expect(politics.countryId).toBe("US");
    expect(politics.countryName).toMatch(/united states/i);
    expect(politics.playerPartyId).toBeNull();
    expect(politics.parties.map((p) => p.id).sort()).toEqual([DEM, REP]);
    const dem = politics.parties.find((p) => p.id === DEM)!;
    expect(dem).toMatchObject({ name: "Democratic Party", tier: "major", isPlayerParty: false });
    expect(typeof dem.economicPosition).toBe("number");
    expect(typeof dem.socialPosition).toBe("number");
    expect(typeof dem.organization).toBe("number");
    expect(typeof dem.politicalStrength).toBe("number");
    expect(dem.memberNames.length).toBeGreaterThan(0);
    expect(dem.join).toMatchObject({ id: "joinParty", available: true });
    expect(dem.leave).toMatchObject({ id: "leaveParty", available: false, disabledReason: "You are independent." });
  });

  it("marks the player party after joining and gates per party actions", () => {
    const session = new GameSession();
    session.create(options);
    expect(session.act("joinParty", { partyId: DEM }).ok).toBe(true);
    const politics = session.politics();
    expect(politics.playerPartyId).toBe(DEM);
    const dem = politics.parties.find((p) => p.id === DEM)!;
    expect(dem.isPlayerParty).toBe(true);
    expect(dem.join).toMatchObject({ available: false, disabledReason: "You are already a member of this party." });
    expect(dem.leave).toMatchObject({ id: "leaveParty", available: true });
    const rep = politics.parties.find((p) => p.id === REP)!;
    expect(rep.isPlayerParty).toBe(false);
    expect(rep.leave).toMatchObject({ available: false, disabledReason: "You are not a member of this party." });
  });

  it("starts with no elections and mirrors the session candidacy gate once races exist", () => {
    expect(freshPolitics().elections).toEqual([]);
    const session = new GameSession();
    const raw = gunzipSync(readFileSync(new URL("../../fixtures/career-t95-1953-US.save.json.gz", import.meta.url))).toString("utf8");
    session.load(raw);
    const politics = session.politics();
    const legacy = session.view().elections;
    expect(politics.elections.length).toBeGreaterThan(0);
    expect(politics.elections.map((e) => e.id)).toEqual(legacy.map((e) => e.id));
    for (const election of politics.elections) {
      const old = legacy.find((e) => e.id === election.id)!;
      expect(election.candidacy).toEqual(old.candidacy);
      expect(election.playerCandidate).toBe(old.playerCandidate);
      expect(election.winnerNames).toEqual(old.winnerNames);
      expect(["upcoming", "primary", "general", "resolved"]).toContain(old.phase);
    }
  });

  it("reports only tally backed vote data, never campaign strength as share", () => {
    const session = new GameSession();
    const raw = gunzipSync(readFileSync(new URL("../../fixtures/career-t95-1953-US.save.json.gz", import.meta.url))).toString("utf8");
    session.load(raw);
    const politics = session.politics();
    expect(politics.elections.length).toBeGreaterThan(0);
    for (const election of politics.elections) {
      if (election.totalVotes == null) {
        expect(election.candidates.every((c) => c.votes == null && c.voteShare == null)).toBe(true);
      } else {
        expect(election.candidates.reduce((n, c) => n + (c.votes ?? 0), 0)).toBe(election.totalVotes);
      }
    }
  });

  it("derives the race phase and lifecycle stages from the persisted record", () => {
    const world = createWorld({ ...options, seed: "race-phase" });
    const base = {
      electionType: "house", countryId: "US", state: "NY", cycle: 1,
      startTurn: 5, primaryEndTurn: 10, endTurn: 20, totalSeats: 1, chamberKey: "house",
      candidates: [], tally: {},
    };
    world.elections = [{ ...base, id: "house:US:NY:c1", status: "active" }];

    world.meta.turn = 7;
    let detail = projectPolitics(world).elections.find((e) => e.id === "house:US:NY:c1")!;
    expect(detail.phase).toBe("primary");
    expect(detail.stages.map((stage) => stage.key)).toEqual(["filing", "primary", "general", "results"]);
    expect(detail.stages.find((stage) => stage.key === "filing")?.state).toBe("current");
    expect(detail.stages.find((stage) => stage.key === "primary")?.state).toBe("current");
    expect(detail.stages.find((stage) => stage.key === "general")?.state).toBe("upcoming");
    expect(detail.primary).toMatchObject({ applicable: true, open: true, resolved: false, endTurn: 10 });

    world.meta.turn = 15;
    detail = projectPolitics(world).elections[0]!;
    expect(detail.phase).toBe("general");
    expect(detail.stages.find((stage) => stage.key === "general")?.state).toBe("current");

    world.meta.turn = 21;
    detail = projectPolitics(world).elections[0]!;
    expect(detail.phase).toBe("resolved");
    expect(detail.stages.find((stage) => stage.key === "results")?.state).toBe("current");
  });

  it("surfaces persisted primary nominees and winner ids without general votes", () => {
    const world = createWorld({ ...options, seed: "race-primary-view" });
    world.meta.turn = 11;
    world.elections = [{
      id: "house:US:NY:c1", electionType: "house", countryId: "US", state: "NY", cycle: 1,
      status: "active", startTurn: 0, primaryEndTurn: 10, endTurn: 20, totalSeats: 1, chamberKey: "house",
      candidates: [{ id: "player", name: "Alex", partyId: DEM, isNPP: false, incumbent: false }],
      tally: {},
      primaryResults: {
        byParty: {
          [DEM]: [{ candidateId: "player", candidateName: "Alex", score: 60, sharePct: 100, won: true }],
        },
        recordedAt: "1953-01-01T00:00:00.000Z",
      },
      primaryVotes: { player: 1200 },
      winners: ["player"],
    }];

    const detail = projectPolitics(world).elections[0]!;
    expect(detail.primary.resolved).toBe(true);
    expect(detail.primary.totalBallots).toBe(1200);
    expect(detail.primary.parties).toEqual([{
      partyId: DEM, partyName: "Democratic Party",
      entries: [{ candidateId: "player", name: "Alex", sharePct: 100, won: true, ballots: 1200 }],
    }]);
    expect(detail.winnerIds).toEqual(["player"]);
    expect(detail.winnerNames).toEqual(["Alex"]);
    expect(detail.candidates[0]).toMatchObject({ votes: null, voteShare: null, winner: true });
  });

  it("advances a live US primary through the real turn loop into visible nominees", () => {
    const world = createWorld({ ...options, seed: "primary-lifecycle-view" });
    world.player.partyId = DEM;
    world.player.policies = { economic: 0, social: 0 };
    world.player.favorability = 80;
    world.player.politicalInfluence = 80;
    const opponent = world.politicians.find((politician) => politician.countryId === "US" && politician.partyId === DEM)!;
    opponent.favorability = 40;
    opponent.politicalInfluence = 40;

    world.elections = [{
      id: "house:US:CA:c1", electionType: "house", countryId: "US", state: "CA", cycle: 1,
      status: "active", startTurn: 0, primaryEndTurn: 12, endTurn: 20, totalSeats: 1, chamberKey: "house",
      candidates: [
        { id: "player", name: world.player.name, partyId: DEM, isNPP: false, incumbent: false },
        { id: opponent.id, name: opponent.name, partyId: DEM, isNPP: false, incumbent: false },
      ],
      tally: {},
    }];
    const registration = Object.values(world.partyRegions).find((entry) => entry.regionId === "CA" && entry.partyId === DEM);
    if (!registration) throw new Error("US_DEM registration for CA was not seeded");
    registration.registration = 60;

    for (let turn = 0; turn < 3; turn += 1) advanceTurn(world);
    let detail = projectPolitics(world).elections[0]!;
    expect(detail.phase).toBe("primary");
    expect(detail.primary.open).toBe(true);
    expect(detail.primary.parties.map((party) => party.partyId)).toEqual([DEM]);

    for (let turn = 3; turn <= 13; turn += 1) advanceTurn(world);
    detail = projectPolitics(world).elections[0]!;
    expect(detail.primary.resolved).toBe(true);
    expect(detail.primary.open).toBe(false);
    expect(detail.phase).toBe("general");
    const nominees = detail.primary.parties[0]!.entries;
    expect(nominees.length).toBeGreaterThan(0);
    expect(nominees.filter((entry) => entry.won)).toHaveLength(1);
    expect(detail.candidates.map((candidate) => candidate.name)).toEqual([nominees[0]!.name]);
  });

  it("lists country politicians with actual engine fields", () => {
    const politics = freshPolitics();
    expect(politics.politicians.length).toBeGreaterThan(0);
    expect(politics.politicians.every((p) => p.partyName.length > 0)).toBe(true);
    const sample = politics.politicians[0]!;
    expect(sample.name.length).toBeGreaterThan(0);
    expect(typeof sample.age).toBe("number");
    expect(typeof sample.economic).toBe("number");
    expect(typeof sample.social).toBe("number");
    expect(typeof sample.influence).toBe("number");
    expect(typeof sample.favorability).toBe("number");
    expect(typeof sample.infamy).toBe("number");
    expect(Array.isArray(sample.activeRaceIds)).toBe(true);
  });

  it("keeps a primary-loser campaign as archived read-only detail", () => {
    const world = createWorld({ ...options, seed: "archived-campaign-detail" });
    const opponent = world.politicians.find((politician) =>
      politician.countryId === "US" && politician.partyId === DEM);
    expect(opponent).toBeDefined();
    world.player.partyId = DEM;
    world.player.favorability = 0;
    world.player.politicalInfluence = 0;
    opponent!.favorability = 100;
    opponent!.politicalInfluence = 100;

    const election = {
      id: "house:US:NY:c1",
      electionType: "house",
      countryId: "US",
      state: "NY",
      cycle: 1,
      status: "active" as const,
      startTurn: 0,
      primaryEndTurn: 10,
      endTurn: 20,
      totalSeats: 1,
      chamberKey: "house",
      candidates: [{
        id: opponent!.id,
        name: opponent!.name,
        partyId: DEM,
        isNPP: true,
        incumbent: false,
      }],
      tally: {},
    };
    world.elections = [election];
    expect(declareCandidacy(world, election.id).ok).toBe(true);
    const campaign = world.campaigns[`${election.id}:player`]!;
    campaign.funds = 100_000;
    campaign.actions = 100;

    world.meta.turn = 11;
    resolvePrimaries(world);

    expect(campaign.status).toBe("archived");
    expect(election.candidates.some((candidate) => candidate.id === "player")).toBe(false);
    const projected = projectPolitics(world).elections.find((item) => item.id === election.id)!;
    expect(projected.playerCampaign).toMatchObject({ status: "archived", support: null });
    expect(projected.playerCampaign!.rally.action).toMatchObject({
      available: false,
      disabledReason: "Campaign is archived and read-only.",
    });
    expect(projected.playerCampaign!.rally.tour.action).toMatchObject({
      available: false,
      disabledReason: "Campaign is archived and read-only.",
    });
    expect(projected.playerCampaign!.levers.every((lever) =>
      !lever.starterUpgrade?.available && lever.branches.every((branch) => !branch.upgrade.available),
    )).toBe(true);
  });

  it("projects opposition research targets and their retarget cooldown", () => {
    const world = createWorld({ ...options, seed: "politics-opposition-target" });
    const opponent = world.politicians.find((politician) =>
      politician.countryId === "US" && politician.partyId === DEM);
    expect(opponent).toBeDefined();
    world.player.partyId = DEM;
    const election = {
      id: "house:US:NY:c1",
      electionType: "house",
      countryId: "US",
      state: "NY",
      cycle: 1,
      status: "active" as const,
      startTurn: 0,
      primaryEndTurn: 10,
      endTurn: 20,
      totalSeats: 1,
      chamberKey: "house",
      candidates: [{
        id: opponent!.id,
        name: opponent!.name,
        partyId: DEM,
        isNPP: true,
        incumbent: false,
      }],
      tally: {},
    };
    world.elections = [election];
    expect(declareCandidacy(world, election.id).ok).toBe(true);
    const campaign = world.campaigns[`${election.id}:player`]!;
    campaign.oppositionResearchTree.starter = true;
    campaign.oppositionTargetId = opponent!.id;
    campaign.oppositionTargetName = opponent!.name;
    campaign.oppositionResearchCooldownUntilTurn = world.meta.turn + 3;

    const projected = projectPolitics(world).elections.find((item) => item.id === election.id)!;
    expect(projected.playerCampaign!.oppositionResearch).toMatchObject({
      targetId: opponent!.id,
      targetName: opponent!.name,
      cooldownTurns: 3,
      action: {
        id: "campaignRetarget",
        available: false,
        disabledReason: "Available in 3 turns.",
      },
    });
    expect(projected.playerCampaign!.oppositionResearch.targets).toEqual([{
      id: opponent!.id,
      name: opponent!.name,
      partyName: "Democratic Party",
    }]);
  });

  it("projects the selected campaign manager and same-country roster", () => {
    const world = createWorld({ ...options, seed: "politics-campaign-manager" });
    const manager = world.politicians.find((politician) => politician.countryId === "US");
    expect(manager).toBeDefined();
    world.player.partyId = DEM;
    const election = {
      id: "house:US:NY:c1",
      electionType: "house",
      countryId: "US",
      state: "NY",
      cycle: 1,
      status: "active" as const,
      startTurn: 0,
      primaryEndTurn: 10,
      endTurn: 20,
      totalSeats: 1,
      chamberKey: "house",
      candidates: [],
      tally: {},
    };
    world.elections = [election];
    expect(declareCandidacy(world, election.id).ok).toBe(true);
    const campaign = world.campaigns[`${election.id}:player`]!;
    campaign.managerId = manager!.id;
    campaign.managerName = manager!.name;
    world.player.actions = 10;
    world.player.funds = 1_000;

    const projected = projectPolitics(world).elections.find((item) => item.id === election.id)!;
    expect(projected.playerCampaign!.manager).toMatchObject({
      managerId: manager!.id,
      managerName: manager!.name,
      action: { id: "campaignManager", available: true },
    });
    expect(projected.playerCampaign!.manager.managers).toContainEqual(expect.objectContaining({
      id: manager!.id,
      name: manager!.name,
    }));
    expect(projected.playerCampaign!.canvassing).toMatchObject({
      regionId: election.state,
      action: { id: "campaignCanvass", available: true, cost: 1 },
    });
    expect(projected.playerCampaign!.canvassing.targets.length).toBeGreaterThan(0);
    expect(projected.playerCampaign!.targetedAds).toMatchObject({
      regionId: election.state,
      action: { id: "campaignTargetedAd", available: true, cost: 1 },
    });
    expect(projected.playerCampaign!.targetedAds.targets.length).toBeGreaterThan(0);
  });
});

it('keeps detailed politics out of routine world updates', () => {
  const session = new GameSession();
  const view = session.create(options);
  expect(view).not.toHaveProperty('politics');
  expect(session.politics().parties.length).toBeGreaterThan(0);
});

it('shows the engine party-switch cooldown after leaving a party', () => {
  const session = new GameSession();
  session.create({ era: '1953', countryId: 'US', playerName: 'Alex', seed: 'party-gates' });
  expect(session.act('joinParty', { partyId: 'US_DEM' }).ok).toBe(true);
  expect(session.act('leaveParty').ok).toBe(true);
  const party = session.politics().parties.find(p => p.id === 'US_REP')!;
  expect(party.join.available).toBe(false);
  expect(party.join.disabledReason).toMatch(/switch cooldown/i);
});

it("includes the player's current party membership in the recorded roster across save and leave", () => {
  const session = new GameSession();
  session.create({ ...options, playerName: "Roster Player" });
  expect(session.act("joinParty", { partyId: DEM }).ok).toBe(true);
  expect(session.politics().parties.find(party => party.id === DEM)!.memberNames).toContain("Roster Player");
  const resumed = new GameSession();
  resumed.load(session.serialize(SAVED_AT));
  expect(resumed.politics().parties.find(party => party.id === DEM)!.memberNames).toContain("Roster Player");
  expect(resumed.act("leaveParty").ok).toBe(true);
  expect(resumed.politics().parties.find(party => party.id === DEM)!.memberNames).not.toContain("Roster Player");
});
