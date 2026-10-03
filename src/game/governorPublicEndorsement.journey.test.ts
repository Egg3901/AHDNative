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
const PRESIDENTIAL_CHECKPOINT_TURNS = 16;
const PRESIDENTIAL_BATCH_COUNT = 6;
const SOURCE_GOVERNOR_ENDORSEMENT_MULTIPLIER = 1.015;

function recordMilestone(name: string, save: string, session: GameSession, office: string) {
  const digest = createHash("sha256").update(save).digest("hex");
  const evidence = { name, sha256: digest, turn: session.view().turn, office };
  const milestoneDir = join(EVIDENCE_DIR, "milestones");
  mkdirSync(milestoneDir, { recursive: true });
  writeFileSync(join(milestoneDir, `${name}.json`), JSON.stringify(evidence, null, 2));
  console.log(`PUBLIC_MILESTONE ${JSON.stringify(evidence)}`);
}

function loadCheckpoint(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch {
    throw new Error(`Missing preceding public journey checkpoint ${file}; run the sequential journey stages in order.`);
  }
}

function savedWorldMeta(save: string): { turn: number; rng: unknown } {
  const match = save.match(/"meta":(\{[^{}]*\})/);
  if (!match) throw new Error("Save is missing its bounded world.meta record.");
  return JSON.parse(match[1]!) as { turn: number; rng: unknown };
}

function presidentialEndTurn(save: string): number {
  const match = save.match(/"id":"president:US:-:c1"[^{}]*"endTurn":(\d+)/);
  if (!match) throw new Error("Save is missing the source presidential race end turn.");
  return Number(match[1]);
}

function activeWyGovernorEndorsementCandidate(save: string): string {
  // The race's candidate array contains nested objects before its endorsement
  // ledger, so find the ledger key directly and inspect only its small row.
  const ledgerStart = save.indexOf('"governorEndorsements":[');
  const ledger = ledgerStart >= 0 ? save.slice(ledgerStart, ledgerStart + 2_000) : "";
  const candidate = ledger.match(/"stateId":"WY","candidateId":"([^"]+)","endorsedById":"player"[^{}]*?"isActive":true/)?.[1];
  if (!candidate) throw new Error("Saved presidential race is missing the player's active WY governor endorsement.");
  return candidate;
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
            expectedRevision: campaign.targetedAds.revision,
            expectedTurn: campaign.targetedAds.quoteTurn,
            expectedCost: campaign.targetedAds.quoteUnitCost,
            count: 1,
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
    expect(view.turn).toBe((JSON.parse(readySave) as { world: { meta: { turn: number } } }).world.meta.turn);
  }, 900_000);

  for (let batch = 0; batch < PRESIDENTIAL_BATCH_COUNT; batch++) {
    const batchNumber = batch + 1;
    const controlPath = batch === 0 ? PRESIDENT_READY_SAVE : join(EVIDENCE_DIR, `president-control-batch-${batch}.json`);
    const treatmentPath = batch === 0 ? PRESIDENT_ENDORSED_SAVE : join(EVIDENCE_DIR, `president-treatment-batch-${batch}.json`);
    const nextControlPath = join(EVIDENCE_DIR, `president-control-batch-${batchNumber}.json`);
    const nextTreatmentPath = join(EVIDENCE_DIR, `president-treatment-batch-${batchNumber}.json`);
    it(`stage 4 batch ${batchNumber}: advances the matched saved worlds by ordinary turns`, () => {
      let controlSave = loadCheckpoint(controlPath);
      let treatmentSave = loadCheckpoint(treatmentPath);
      const controlMeta = savedWorldMeta(controlSave);
      const treatmentMeta = savedWorldMeta(treatmentSave);
      const sourceEndTurn = presidentialEndTurn(treatmentSave);
      const endorsedCandidateId = activeWyGovernorEndorsementCandidate(treatmentSave);
      const control = new GameSession();
      let controlView = control.load(controlSave);
      const treatment = new GameSession();
      let treatmentView = treatment.load(treatmentSave);
      // A no-op load/save round trip must preserve the complete checkpoint,
      // including historical events, actions, RNG and the endorsement ledger.
      expect(control.serialize(STAMP)).toBe(controlSave);
      controlSave = "";
      expect(treatment.serialize(STAMP)).toBe(treatmentSave);
      treatmentSave = "";
      expect(controlMeta.turn).toBe(treatmentMeta.turn);
      expect(controlMeta.rng).toEqual(treatmentMeta.rng);
      const nextTurn = Math.min(treatmentMeta.turn + PRESIDENTIAL_CHECKPOINT_TURNS, sourceEndTurn + 1);
      while (treatmentView.turn < nextTurn) {
        treatmentView = treatment.advance();
        controlView = control.advance();
      }
      expect(controlView.turn).toBe(nextTurn);
      expect(treatmentView.turn).toBe(nextTurn);
      if (batchNumber === PRESIDENTIAL_BATCH_COUNT) expect(nextTurn).toBe(sourceEndTurn + 1);
      let nextControlSave = control.serialize(STAMP);
      const controlAfterMeta = savedWorldMeta(nextControlSave);
      writeFileSync(nextControlPath, nextControlSave);
      nextControlSave = "";
      let nextTreatmentSave = treatment.serialize(STAMP);
      const treatmentAfterMeta = savedWorldMeta(nextTreatmentSave);
      expect(controlAfterMeta.rng).toEqual(treatmentAfterMeta.rng);
      writeFileSync(nextTreatmentPath, nextTreatmentSave);
      if (batchNumber !== PRESIDENTIAL_BATCH_COUNT) return;

      const treatmentPresidential = treatment.politics().elections.find((race) => race.id === PRESIDENT_RACE)?.presidential!;
      const controlPresidential = control.politics().elections.find((race) => race.id === PRESIDENT_RACE)?.presidential!;
      const treatmentWy = treatmentPresidential.states.find((state) => state.stateId === "WY")?.votes ?? [];
      const controlWy = controlPresidential.states.find((state) => state.stateId === "WY")?.votes ?? [];
      const treatmentCandidateVotes = treatmentWy.find((row) => row.candidateId === endorsedCandidateId)?.votes ?? 0;
      const controlCandidateVotes = controlWy.find((row) => row.candidateId === endorsedCandidateId)?.votes ?? 0;
      expect(treatmentCandidateVotes).toBeGreaterThan(controlCandidateVotes);
      expect(treatmentWy).not.toEqual(controlWy);
      expect(treatmentPresidential.states.find((state) => state.stateId === "CA")?.votes)
        .toEqual(controlPresidential.states.find((state) => state.stateId === "CA")?.votes);
      const treatmentOtherVotes = treatmentWy.reduce((sum, row) => sum + row.votes, 0) - treatmentCandidateVotes;
      const controlOtherVotes = controlWy.reduce((sum, row) => sum + row.votes, 0) - controlCandidateVotes;
      const oddsMultiplier = (treatmentCandidateVotes / treatmentOtherVotes) / (controlCandidateVotes / controlOtherVotes);
      // Current AHDGame presidentialElectionEngine applies 1.015 only to the
      // endorsed candidate's state. Turn-level integer rounding and aggregation
      // can reduce the aggregate odds ratio, but it cannot exceed that source
      // multiplier beyond a small rounding allowance.
      expect(oddsMultiplier).toBeGreaterThan(1);
      expect(oddsMultiplier).toBeLessThanOrEqual(SOURCE_GOVERNOR_ENDORSEMENT_MULTIPLIER + 0.005);
      expect(treatmentPresidential.resolved).toBe(true);
      const proof = {
        name: "president-resolved",
        sha256: createHash("sha256").update(nextTreatmentSave).digest("hex"),
        turn: treatmentAfterMeta.turn,
        office: "Presidential general resolved by ordinary turns; matched control isolates the WY endorsement effect",
        endorsedCandidateId,
        sourceMultiplier: SOURCE_GOVERNOR_ENDORSEMENT_MULTIPLIER,
        aggregateOddsMultiplier: oddsMultiplier,
      };
      writeFileSync(join(EVIDENCE_DIR, "president-resolved.json"), nextTreatmentSave);
      writeFileSync(join(EVIDENCE_DIR, "milestones", "president-resolved.json"), JSON.stringify(proof, null, 2));
      console.log(`PUBLIC_MILESTONE ${JSON.stringify(proof)}`);
      nextTreatmentSave = "";
    }, 900_000);
  }
});
