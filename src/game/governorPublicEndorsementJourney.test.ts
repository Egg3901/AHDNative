import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

const STAMP = "2026-10-03T00:00:00.000Z";
const GOVERNOR_RACE = "governor:US:WY:c1";
const PRESIDENT_RACE = "president:US:-:c1";
const FAVORABLE_GROUPS = ["evangelicals", "rural_traditionalists", "small_business", "libertarians"];
const EVIDENCE_DIR = join(tmpdir(), "ahdnative-governor-public-journey");
const PRIMARY_SAVE = join(EVIDENCE_DIR, "after-primary.json");
const GOVERNOR_SAVE = join(EVIDENCE_DIR, "after-governor.json");
const PRESIDENT_READY_SAVE = join(EVIDENCE_DIR, "president-ready.json");
const PRESIDENT_ENDORSED_SAVE = join(EVIDENCE_DIR, "president-endorsed.json");

function recordMilestone(name: string, save: string, session: GameSession, office: string) {
  const digest = createHash("sha256").update(save).digest("hex");
  const evidence = { name, sha256: digest, turn: session.view().turn, office };
  writeFileSync(join(EVIDENCE_DIR, `${name}.json`), JSON.stringify(evidence, null, 2));
  console.log(`PUBLIC_MILESTONE ${JSON.stringify(evidence)}`);
}

function loadCheckpoint(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch {
    throw new Error(`Missing preceding public journey checkpoint ${file}; run the sequential journey stages in order.`);
  }
}

/**
 * Current-Game source replay for this legal character build and public campaign
 * cadence matched all 48 general-turn distributions and elected the player.
 * These sequential stages use full serialized saves so each stage resumes the
 * actual prior public world, including history and RNG, across a reload.
 */
describe.sequential("earned governor presidential endorsement journey", () => {
  it("stage 1: files publicly, wins the Republican primary, and saves/reloads the resolved primary", () => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
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
        stats: { charisma: 8, debate: 3, energy: 3, fundraising: 3, businessAcumen: 3, statecraft: 3, intellect: 5 },
        policies: { economic: 3, social: 2 },
        demographics: { race: "white", gender: "male", education: "college", wealth: "middle" },
      },
    });
    expect(view.player.homeRegionId).toBe("WY");
    expect(session.act("joinParty", { partyId: "US_REP" }).ok).toBe(true);
    view = session.advance();
    expect(view.elections.find((race) => race.id === GOVERNOR_RACE)).toMatchObject({
      status: "active", phase: "primary", candidacy: { available: true },
    });
    expect(session.act("declareCandidacy", { electionId: GOVERNOR_RACE }).ok).toBe(true);

    const filed = session.serialize(STAMP);
    const primaryReload = new GameSession();
    view = primaryReload.load(filed);
    const filedRace = (JSON.parse(filed) as { world: { elections: Array<{ id: string; primaryEndTurn: number }> } })
      .world.elections.find((race) => race.id === GOVERNOR_RACE)!;
    while (view.turn <= filedRace.primaryEndTurn) view = primaryReload.advance();
    const primarySave = primaryReload.serialize(STAMP);
    const primaryReloaded = new GameSession();
    view = primaryReloaded.load(primarySave);
    const primary = (JSON.parse(primarySave) as {
      world: { elections: Array<{ id: string; primaryResults?: { byParty: Record<string, Array<{ candidateId: string; won: boolean }>> } }> };
    }).world.elections.find((race) => race.id === GOVERNOR_RACE)!;
    expect(primary.primaryResults?.byParty.US_REP?.find((row) => row.candidateId === "player")?.won).toBe(true);
    expect(view.turn).toBeGreaterThan(filedRace.primaryEndTurn);
    writeFileSync(PRIMARY_SAVE, primarySave);
    recordMilestone("primary-won", primarySave, primaryReloaded, "US_REP governor nominee; public primary result won");
  }, 900_000);

  it("stage 2: resumes the primary save, campaigns publicly, earns the governorship, and saves/reloads it", () => {
    const session = new GameSession();
    let view = session.load(loadCheckpoint(PRIMARY_SAVE));
    const governorSave = JSON.parse(session.serialize(STAMP)) as {
      world: { elections: Array<{ id: string; endTurn: number; primaryEndTurn: number }> };
    };
    const race = governorSave.world.elections.find((election) => election.id === GOVERNOR_RACE)!;
    let adAttempt = 0;
    let successfulAds = 0;
    let campaignActions = 0;
    let advertActions = 0;
    while (view.turn <= race.endTurn) {
      if ((view.turn - race.primaryEndTurn) % 8 === 1 && view.player.favorability < 75) {
        if (session.act("advertise").ok) advertActions++;
      }
      if ((view.turn - race.primaryEndTurn) % 3 === 0) {
        const campaign = session.politics().elections.find((entry) => entry.id === GOVERNOR_RACE)?.playerCampaign;
        const groupId = FAVORABLE_GROUPS[adAttempt % FAVORABLE_GROUPS.length]!;
        const target = campaign?.targetedAds.targets.find((entry) => entry.group === groupId && !entry.maxed);
        if (campaign?.targetedAds.action.available && target && target.bonus < 0.25) {
          const result = session.act("campaignTargetedAd", {
            electionId: GOVERNOR_RACE,
            regionId: "WY",
            demographicCategory: target.category,
            demographicGroup: target.group,
          });
          if (result.ok) successfulAds++;
          adAttempt++;
        }
      }
      while (view.actions.some((action) => action.id === "campaign" && action.available) && view.player.influence < 75) {
        const result = session.act("campaign");
        if (!result.ok) break;
        campaignActions++;
        view = session.view();
      }
      view = session.advance();
    }
    expect(successfulAds).toBeGreaterThan(0);
    expect(campaignActions).toBeGreaterThan(0);
    expect(advertActions).toBeGreaterThan(0);
    const saved = session.serialize(STAMP);
    const resolved = JSON.parse(saved) as { world: { elections: Array<{ id: string; winners?: string[] }> } };
    expect(resolved.world.elections.find((election) => election.id === GOVERNOR_RACE)?.winners).toContain("player");
    const reloaded = new GameSession();
    view = reloaded.load(saved);
    expect(view.player.homeRegionId).toBe("WY");
    writeFileSync(GOVERNOR_SAVE, saved);
    recordMilestone("governor-won", saved, reloaded, "US-WY governor; resolved winner player");
  }, 900_000);

  it("stage 3: resumes as the earned governor, endorses publicly, and saves/reloads both matched controls", () => {
    const session = new GameSession();
    let view = session.load(loadCheckpoint(GOVERNOR_SAVE));
    let president = view.elections.find((race) => race.id === PRESIDENT_RACE);
    while ((!president || president.status !== "active") && view.turn < 320) {
      view = session.advance();
      president = view.elections.find((race) => race.id === PRESIDENT_RACE);
    }
    expect(president?.status).toBe("active");
    const presidential = session.politics().elections.find((race) => race.id === president!.id)!.presidential!;
    const endorsement = presidential.governorActions?.find((action) =>
      action.actionId === "governorEndorsePresidentialCandidate" && action.stateId === "WY" && action.available,
    );
    expect(endorsement).toBeDefined();

    const readySave = session.serialize(STAMP);
    const readyReload = new GameSession();
    readyReload.load(readySave);
    writeFileSync(PRESIDENT_READY_SAVE, readySave);
    recordMilestone("president-ready", readySave, readyReload, "US-WY governor; public same-party endorsement is available");
    expect(session.act("governorEndorsePresidentialCandidate", {
      regionId: endorsement!.stateId,
      electionId: endorsement!.electionId,
      candidateId: endorsement!.candidateId,
    }).ok).toBe(true);
    const endorsedSave = session.serialize(STAMP);
    const saved = JSON.parse(endorsedSave) as {
      world: { elections: Array<{ id: string; governorEndorsements?: Array<{ stateId: string; candidateId: string; endorsedById: string; isActive: boolean }> }> };
    };
    expect(saved.world.elections.find((race) => race.id === president!.id)?.governorEndorsements)
      .toContainEqual(expect.objectContaining({ stateId: "WY", candidateId: endorsement!.candidateId, endorsedById: "player", isActive: true }));
    const treatment = new GameSession();
    view = treatment.load(endorsedSave);
    const treatmentActions = treatment.politics().elections.find((race) => race.id === president!.id)?.presidential?.governorActions;
    expect(treatmentActions).toContainEqual(expect.objectContaining({ actionId: "withdrawGovernorEndorsement", stateId: "WY", candidateId: endorsement!.candidateId, available: true }));
    writeFileSync(PRESIDENT_ENDORSED_SAVE, endorsedSave);
    recordMilestone("president-endorsed", endorsedSave, treatment, "US-WY governor; persisted endorsement for source presidential candidate");
    expect(view.turn).toBe(new GameSession().load(loadCheckpoint(PRESIDENT_READY_SAVE)).turn);
  }, 900_000);

  it("stage 4: continues ordinary turns and proves the saved endorsement changes WY presidential votes only", () => {
    const control = new GameSession();
    let controlView = control.load(loadCheckpoint(PRESIDENT_READY_SAVE));
    const treatment = new GameSession();
    let treatmentView = treatment.load(loadCheckpoint(PRESIDENT_ENDORSED_SAVE));
    const endTurn = (JSON.parse(loadCheckpoint(PRESIDENT_ENDORSED_SAVE)) as {
      world: { elections: Array<{ id: string; endTurn: number }> };
    }).world.elections.find((race) => race.id === PRESIDENT_RACE)!.endTurn;
    while (treatmentView.turn <= endTurn) {
      treatmentView = treatment.advance();
      controlView = control.advance();
    }
    const treatmentPresidential = treatment.politics().elections.find((race) => race.id === PRESIDENT_RACE)?.presidential!;
    const controlPresidential = control.politics().elections.find((race) => race.id === PRESIDENT_RACE)?.presidential!;
    const treatmentWy = treatmentPresidential.states.find((state) => state.stateId === "WY")?.votes ?? [];
    const controlWy = controlPresidential.states.find((state) => state.stateId === "WY")?.votes ?? [];
    const endorsedCandidateId = (JSON.parse(loadCheckpoint(PRESIDENT_ENDORSED_SAVE)) as {
      world: { elections: Array<{ id: string; governorEndorsements?: Array<{ stateId: string; candidateId: string; endorsedById: string; isActive: boolean }> }> };
    }).world.elections.find((race) => race.id === PRESIDENT_RACE)?.governorEndorsements
      ?.find((row) => row.stateId === "WY" && row.endorsedById === "player" && row.isActive)?.candidateId;
    expect(endorsedCandidateId).toBeDefined();
    expect(treatmentWy.find((row) => row.candidateId === endorsedCandidateId)?.votes ?? 0)
      .toBeGreaterThan(controlWy.find((row) => row.candidateId === endorsedCandidateId)?.votes ?? 0);
    expect(treatmentWy).not.toEqual(controlWy);
    expect(treatmentPresidential.states.find((state) => state.stateId === "CA")?.votes)
      .toEqual(controlPresidential.states.find((state) => state.stateId === "CA")?.votes);
    expect(controlView.turn).toBe(treatmentView.turn);
    const resolvedSave = treatment.serialize(STAMP);
    const reload = new GameSession();
    reload.load(resolvedSave);
    recordMilestone("president-resolved", resolvedSave, reload, "Presidential general resolved; matched control isolates WY endorsement effect");
  }, 900_000);
});
