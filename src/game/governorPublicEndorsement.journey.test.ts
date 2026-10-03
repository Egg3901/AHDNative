import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

const STAMP = "2026-10-03T00:00:00.000Z";
const GOVERNOR_RACE = "governor:US:WY:c1";
const PRESIDENT_RACE = "president:US:-:c1";
const FAVORABLE_GROUPS = ["evangelicals", "rural_traditionalists", "small_business", "libertarians"];
const EVIDENCE_DIR = process.env.AHD_PUBLIC_ELECTION_JOURNEY_DIR ?? join(tmpdir(), "ahdnative-governor-public-journey");
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

function savedWorldMeta(save: string): { turn: number; rng: unknown; startingYear?: number } {
  const match = save.match(/"meta":(\{[^{}]*\})/);
  if (!match) throw new Error("Save is missing its bounded world.meta record.");
  return JSON.parse(match[1]!) as { turn: number; rng: unknown; startingYear?: number };
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

type SavedLayer1 = Record<string, Record<string, { economicLean?: number }>>;

// Inspect a bounded member of the complete canonical JSON save. Scanning
// respects strings and escaped quotes; only the selected WY row is parsed.
// The full checkpoint still passes GameSession.load and byte-for-byte save.
function savedValueEnd(save: string, start: number): number {
  const first = save[start];
  let depth = 0;
  let inString = false;
  for (let cursor = start; cursor < save.length; cursor++) {
    const char = save[cursor];
    if (inString) {
      if (char === "\\") cursor++;
      else if (char === '"') {
        inString = false;
        if (first === '"' && depth === 0) return cursor + 1;
      }
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{" || char === "[") depth++;
    else if (char === "}" || char === "]") {
      if (depth === 0) return cursor;
      if (--depth === 0) return cursor + 1;
    } else if (depth === 0 && /[,\s]/.test(char!)) return cursor;
  }
  if (depth || inString) throw new Error("Incomplete checkpoint JSON value.");
  return save.length;
}

function savedMember(save: string, objectStart: number, member: string): { start: number; end: number } {
  if (save[objectStart] !== "{") throw new Error(`Checkpoint ${member} parent is not an object.`);
  let cursor = objectStart + 1;
  while (cursor < save.length) {
    while (/[\s,]/.test(save[cursor] ?? "")) cursor++;
    if (save[cursor] === "}") break;
    if (save[cursor] !== '"') throw new Error(`Invalid checkpoint key before ${member}.`);
    const keyEnd = savedValueEnd(save, cursor);
    const key = JSON.parse(save.slice(cursor, keyEnd)) as string;
    cursor = keyEnd;
    while (/\s/.test(save[cursor] ?? "")) cursor++;
    if (save[cursor++] !== ":") throw new Error(`Invalid checkpoint member ${key}.`);
    while (/\s/.test(save[cursor] ?? "")) cursor++;
    const start = cursor;
    const end = savedValueEnd(save, start);
    if (key === member) return { start, end };
    cursor = end;
  }
  throw new Error(`Checkpoint is missing ${member}.`);
}

function savedWyLayer1(save: string): SavedLayer1 | undefined {
  const world = savedMember(save, 0, "world");
  const demographics = savedMember(save, world.start, "baselineDemographics");
  const wy = savedMember(save, demographics.start, "WY");
  return (JSON.parse(save.slice(wy.start, wy.end)) as { layer1PositionOverrides?: SavedLayer1 }).layer1PositionOverrides;
}

function advancePresidentialCheckpoint(inputPath: string, outputPath: string, targetTurn: number, resolved: boolean) {
  let raw = loadCheckpoint(inputPath);
  const session = new GameSession();
  let view = session.load(raw);
  expect(session.serialize(STAMP)).toBe(raw);
  raw = "";
  while (view.turn < targetTurn) view = session.advance();
  expect(view.turn).toBe(targetTurn);
  raw = session.serialize(STAMP);
  const meta = savedWorldMeta(raw);
  const wyLayer1 = resolved ? savedWyLayer1(raw) : undefined;
  const sha256 = createHash("sha256").update(raw).digest("hex");
  const bytes = Buffer.byteLength(raw);
  writeFileSync(outputPath, raw);
  raw = "";
  const presidential = resolved ? session.politics().elections.find((race) => race.id === PRESIDENT_RACE)?.presidential : undefined;
  const memory = process.memoryUsage();
  console.log(`PUBLIC_CHECKPOINT ${JSON.stringify({ turn: meta.turn, sha256, bytes, heapUsedMiB: Math.round(memory.heapUsed / 2 ** 20), rssMiB: Math.round(memory.rss / 2 ** 20) })}`);
  return { meta, wyLayer1, sha256, presidential };
}

function reloadPresidentialCheckpoint(path: string, expectedTurn: number) {
  let raw = loadCheckpoint(path);
  const session = new GameSession();
  const view = session.load(raw);
  expect(view.turn).toBe(expectedTurn);
  expect(session.serialize(STAMP)).toBe(raw);
  raw = "";
  return view.turn;
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
    const filedMeta = (JSON.parse(filed) as { world: { meta: { schemaVersion: number; startingYear?: number } } }).world.meta;
    expect(filedMeta.startingYear).toBe(1953);
    expect(filedMeta.schemaVersion).toBeGreaterThanOrEqual(69);
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
        const adProjection = campaign?.targetedAds;
        const target = adProjection?.targets.find((entry) => entry.group === groupId && !entry.maxed);
        if (adProjection?.action.available && target && target.bonus < 0.25 &&
          adProjection.quoteTurn !== undefined && adProjection.quoteUnitCost !== undefined) {
          const result = session.act("campaignTargetedAd", {
            electionId: GOVERNOR_RACE,
            regionId: "WY",
            demographicCategory: target.category,
            demographicGroup: target.group,
            expectedRevision: adProjection.revision,
            expectedTurn: adProjection.quoteTurn,
            expectedCost: adProjection.quoteUnitCost,
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
      const controlMeta = savedWorldMeta(loadCheckpoint(controlPath));
      let treatmentInput = loadCheckpoint(treatmentPath);
      const treatmentMeta = savedWorldMeta(treatmentInput);
      const sourceEndTurn = presidentialEndTurn(treatmentInput);
      const endorsedCandidateId = activeWyGovernorEndorsementCandidate(treatmentInput);
      treatmentInput = "";
      expect(controlMeta.turn).toBe(treatmentMeta.turn);
      expect(controlMeta.rng).toEqual(treatmentMeta.rng);
      const nextTurn = Math.min(treatmentMeta.turn + PRESIDENTIAL_CHECKPOINT_TURNS, sourceEndTurn + 1);
      const finalBatch = batchNumber === PRESIDENTIAL_BATCH_COUNT;
      if (finalBatch) expect(nextTurn).toBe(sourceEndTurn + 1);

      // Each branch resumes its complete disk checkpoint independently. Only
      // one world is retained at a time; all 96 ordinary turns, historical
      // records, saved RNG and six full checkpoint pairs remain unchanged.
      const control = advancePresidentialCheckpoint(controlPath, nextControlPath, nextTurn, finalBatch);
      const treatment = advancePresidentialCheckpoint(treatmentPath, nextTreatmentPath, nextTurn, finalBatch);
      expect(control.meta.turn).toBe(nextTurn);
      expect(treatment.meta.turn).toBe(nextTurn);
      expect(control.meta.rng).toEqual(treatment.meta.rng);
      if (!finalBatch) return;

      const treatmentPresidential = treatment.presidential!;
      const controlPresidential = control.presidential!;
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
      // Source applies 1.015 only to the endorsed candidate's state. Tally
      // rounding may reduce aggregate odds; retain the original allowance.
      expect(oddsMultiplier).toBeGreaterThan(1);
      expect(oddsMultiplier).toBeLessThanOrEqual(SOURCE_GOVERNOR_ENDORSEMENT_MULTIPLIER + 0.005);
      expect(treatmentPresidential.resolved).toBe(true);
      expect(treatment.meta.startingYear).toBe(1953);
      expect(control.meta.startingYear).toBe(1953);
      // Public turns 192/193 tally source calendar 193/194, then write two
      // durable road-to-1960 steps after the corresponding tallies.
      expect(treatment.wyLayer1?.education?.no_college?.economicLean).toBeCloseTo(2 * (-0.75 / 192), 12);
      expect(treatment.wyLayer1?.wealth?.middle?.economicLean).toBeCloseTo(2 * (0.6 / 192), 12);
      expect(control.wyLayer1?.education?.no_college?.economicLean).toBeCloseTo(2 * (-0.75 / 192), 12);
      const proof = {
        name: "president-resolved", sha256: treatment.sha256, turn: treatment.meta.turn,
        office: "Presidential general resolved by ordinary turns; matched control isolates the WY endorsement effect",
        endorsedCandidateId, sourceMultiplier: SOURCE_GOVERNOR_ENDORSEMENT_MULTIPLIER,
        aggregateOddsMultiplier: oddsMultiplier, sourceStartingYear: treatment.meta.startingYear,
        wyEducationNoCollegeEconomicOverlay: treatment.wyLayer1?.education?.no_college?.economicLean,
        wyMiddleWealthEconomicOverlay: treatment.wyLayer1?.wealth?.middle?.economicLean,
      };
      // Copy the complete checkpoint without retaining another raw string.
      copyFileSync(nextTreatmentPath, join(EVIDENCE_DIR, "president-resolved.json"));
      writeFileSync(join(EVIDENCE_DIR, "milestones", "president-resolved.json"), JSON.stringify(proof, null, 2));
      console.log(`PUBLIC_MILESTONE ${JSON.stringify(proof)}`);

      const continuedControlPath = join(EVIDENCE_DIR, "source-checkpoint-ordinary-control.json");
      const continuedTreatmentPath = join(EVIDENCE_DIR, "source-checkpoint-ordinary-continuation.json");
      const continuedControl = advancePresidentialCheckpoint(nextControlPath, continuedControlPath, nextTurn + 1, true);
      const continuedTreatment = advancePresidentialCheckpoint(nextTreatmentPath, continuedTreatmentPath, nextTurn + 1, true);
      expect(continuedControl.meta.turn).toBe(treatment.meta.turn + 1);
      expect(continuedTreatment.meta.turn).toBe(treatment.meta.turn + 1);
      const continuedControlTurn = reloadPresidentialCheckpoint(continuedControlPath, nextTurn + 1);
      const continuedTreatmentTurn = reloadPresidentialCheckpoint(continuedTreatmentPath, nextTurn + 1);
      expect(continuedControlTurn).toBe(continuedTreatmentTurn);
      expect(continuedTreatment.meta.startingYear).toBe(1953);
      expect(continuedTreatment.meta.rng).toEqual(continuedControl.meta.rng);
      expect(continuedTreatment.wyLayer1?.education?.no_college?.economicLean).toBeCloseTo(3 * (-0.75 / 192), 12);
      expect(continuedTreatment.wyLayer1?.wealth?.middle?.economicLean).toBeCloseTo(3 * (0.6 / 192), 12);
      const continuationProof = {
        name: "source-checkpoint-ordinary-continuation", sha256: continuedTreatment.sha256,
        turn: continuedTreatmentTurn, sourceStartingYear: continuedTreatment.meta.startingYear,
        wyEducationNoCollegeEconomicOverlay: continuedTreatment.wyLayer1?.education?.no_college?.economicLean,
        wyMiddleWealthEconomicOverlay: continuedTreatment.wyLayer1?.wealth?.middle?.economicLean,
      };
      writeFileSync(join(EVIDENCE_DIR, "milestones", "source-checkpoint-ordinary-continuation.json"), JSON.stringify(continuationProof, null, 2));
      console.log(`PUBLIC_MILESTONE ${JSON.stringify(continuationProof)}`);
    }, 900_000);
  }
});
