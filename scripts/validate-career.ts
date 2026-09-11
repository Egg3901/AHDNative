/**
 * Genuine seeded election-to-office playthrough (1953 US, first house cycle).
 *
 * Uses ONLY public engine exports (createWorld / executeAction / advanceTurn /
 * serializeSave / deserializeSave). No state cheats, no outcome injection, no
 * engine formula changes. The per-turn policy is a deterministic function of
 * visible world state; every action is recorded so the run replays exactly.
 *
 *   npx tsx scripts/validate-career.ts --mode=generate --engine-root <pinned oracle checkout>
 *   npx tsx scripts/validate-career.ts --mode=generate-current
 *   npx tsx scripts/validate-career.ts --mode=validate   # CI-safe: no oracle, no heavy run
 *
 * Generate plays one bounded run (cap 150 turns): join US_DEM at t1, file for
 * the home-region house race, campaign/fundraise/advertise through resolution.
 * If the player wins, it sponsors a bill and votes when voting opens (<=5
 * turns). Fixtures stay out of git above 3MB compressed (checked, reported).
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { gunzipSync, gzipSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const FIXTURE_DIR = join(REPO_ROOT, "fixtures");

const PINNED_ORACLE_COMMIT = "568c0c039efcca2db17c52b2920747ff05fbd794";
const CURRENT_DISTRIBUTOR_COMMIT = "c25ba40a427ae8fd85e802d7af8f755a19977997";
const SEED = "career-muse-1";
const PLAYER_NAME = "Muse";
const ERA = "1953";
const COUNTRY_ID = "US";
const PARTY_ID = "US_DEM";
const FIXED_SAVED_AT = "2026-09-10T00:00:00.000Z";
const TURN_CAP = 150;
const MAX_GZIP_BYTES = 3 * 1024 * 1024;
const PRIMARY_END_KNOWN = 48;
const HOUSE_END_KNOWN = 96;
const BILL_CATALOG_ID = "us.economy.workerSecurity.primary";

type Result = { ok: true; message: string } | { ok: false; error: string };
type Engine = {
  SCHEMA_VERSION: number;
  createWorld: (o: { seed: string; playerName: string; countryId: string; era: string }) => any;
  executeAction: (w: any, actor: string, action: string, params?: any) => Result;
  advanceTurn: (w: any) => unknown;
  serializeSave: (w: any, savedAt: string) => string;
  deserializeSave: (raw: string) => any;
};

type LoggedAction = { turn: number; actionId: string; params: Record<string, unknown> };

function parseArgs(argv: string[]): { mode: string; engineRoot: string | null } {
  let mode = "validate";
  let engineRoot: string | null = process.env.AHD_ORACLE_ENGINE_ROOT ?? null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--mode" || arg.startsWith("--mode=")) {
      mode = arg.includes("=") ? arg.slice("--mode=".length) : argv[++i]!;
    } else if (arg === "--engine-root" || arg.startsWith("--engine-root=")) {
      engineRoot = arg.includes("=") ? arg.slice("--engine-root=".length) : argv[++i]!;
    }
  }
  return { mode, engineRoot };
}

function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

function gitCapture(cwd: string, args: string[]): string | null {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) return null;
  return (result.stdout ?? "").trim() || null;
}

function gitOk(cwd: string, args: string[]): boolean {
  return spawnSync("git", args, { cwd, encoding: "utf8" }).status === 0;
}

function worldHash(engine: Engine, world: any): string {
  return sha256Hex(engine.serializeSave(world, FIXED_SAVED_AT));
}

function targetHouseRace(world: any): any {
  const home = world.player.homeRegionId as string;
  const race = world.elections.find((e: any) => e.electionType === "house" && e.state === home);
  if (!race) throw new Error(`No home-region house race (home=${home}).`);
  return race;
}

function tryAction(engine: Engine, world: any, log: LoggedAction[] | null, actionId: string, params: Record<string, unknown>): boolean {
  const result = engine.executeAction(world, "player", actionId, params);
  if (result.ok && log) log.push({ turn: world.meta.turn, actionId, params });
  return result.ok;
}

/**
 * Exact reproducible policy: deterministic function of visible state.
 * Priority: keep donor base growing early, keep funds solvent, then spend on
 * influence (campaign), favorability (advertise), turnout/org (canvass).
 */
function playTurn(engine: Engine, world: any, log: LoggedAction[] | null, regionId: string): { attempted: number; succeeded: number } {
  let attempted = 0;
  let succeeded = 0;
  for (let guard = 0; guard < 60; guard++) {
    const p = world.player;
    const funds: number = p.funds ?? 0;
    const cash: number = p.cash ?? 0;
    const donor: number = p.donorBaseLevel ?? 0;
    const steps: { id: string; params: Record<string, unknown> }[] = [];
    if (donor < 4) steps.push({ id: "buildDonorBase", params: {} });
    if (donor > 0 && funds < 120_000) steps.push({ id: "fundraise", params: {} });
    if (funds < 30_000 && cash >= 1000) steps.push({ id: "convertCash", params: { amount: Math.min(cash, 10_000) } });
    steps.push({ id: "campaign", params: {} });
    steps.push({ id: "advertise", params: {} });
    if (donor > 0 && funds < 120_000) steps.push({ id: "fundraise", params: {} });
    steps.push({ id: "canvass", params: { regionId } });
    steps.push({ id: "organize", params: { regionId } });
    let progressed = false;
    for (const step of steps) {
      attempted++;
      if (tryAction(engine, world, log, step.id, step.params)) {
        succeeded++;
        progressed = true;
        break;
      }
    }
    if (!progressed) break;
  }
  return { attempted, succeeded };
}

function electionStatus(world: any, id: string): string {
  return world.elections.find((e: any) => e.id === id)?.status ?? "missing";
}

function progressLine(engine: Engine, world: any, raceId: string, note: string): string {
  const p = world.player;
  const support = world.candidateSupports?.["player"]?.support;
  return (
    `t=${world.meta.turn} ${note} actions=${p.actions} funds=${Math.round(p.funds)} ` +
    `cash=${Math.round(p.cash)} inf=${Number(p.politicalInfluence).toFixed(1)} ` +
    `fav=${p.favorability} donor=${p.donorBaseLevel ?? 0} ` +
    `support=${support === undefined ? "n/a" : Number(support).toFixed(1)} race=${electionStatus(world, raceId)}`
  );
}

async function runSeason(engine: Engine, opts: { record: boolean }): Promise<{
  world: any; raceId: string; log: LoggedAction[]; lines: string[];
  preResolutionRaw: string | null; reloadVerified: boolean;
}> {
  const world = engine.createWorld({ seed: SEED, playerName: PLAYER_NAME, countryId: COUNTRY_ID, era: ERA });
  const log: LoggedAction[] = [];
  const lines: string[] = [];
  const home = world.player.homeRegionId as string;
  let raceId = "";
  let preResolutionRaw: string | null = null;
  let reloadVerified = false;

  for (let turn = 0; turn <= TURN_CAP; turn++) {
    if (world.meta.turn === 1 && !raceId) {
      const race = targetHouseRace(world);
      raceId = race.id;
      tryAction(engine, world, opts.record ? log : null, "joinParty", { partyId: PARTY_ID });
      const filed = tryAction(engine, world, opts.record ? log : null, "declareCandidacy", { electionId: raceId });
      lines.push(progressLine(engine, world, raceId, `setup filed=${filed} race=${raceId}`));
    }
    if (!raceId && world.meta.turn >= 1) {
      const race = targetHouseRace(world);
      raceId = race.id;
    }
    if (world.meta.turn > 1 || raceId) {
      playTurn(engine, world, opts.record ? log : null, home);
    }
    if (world.meta.turn % 12 === 0 || world.meta.turn === 1) {
      lines.push(progressLine(engine, world, raceId || "pending", "tick"));
    }
    if (world.meta.turn === PRIMARY_END_KNOWN) {
      const raw = engine.serializeSave(world, FIXED_SAVED_AT);
      const reloaded = engine.deserializeSave(raw);
      reloadVerified = engine.serializeSave(reloaded, FIXED_SAVED_AT) === raw;
      lines.push(`t=48 save-reload roundtrip identical=${reloadVerified}`);
      const status = electionStatus(world, raceId);
      const inRace = world.elections.find((e: any) => e.id === raceId)?.candidates.some((c: any) => c.id === "player");
      lines.push(`t=48 primary survived=${inRace} race=${status}`);
      if (!inRace) break;
    }
    if (world.meta.turn === 95) {
      preResolutionRaw = engine.serializeSave(world, FIXED_SAVED_AT);
      lines.push(`t=95 pre-resolution snapshot bytes=${Buffer.byteLength(preResolutionRaw, "utf8")}`);
    }
    const status = raceId ? electionStatus(world, raceId) : "pending";
    if (raceId && status === "resolved") {
      lines.push(progressLine(engine, world, raceId, "resolved"));
      break;
    }
    if (world.meta.turn >= TURN_CAP) break;
    engine.advanceTurn(world);
  }
  return { world, raceId, log, lines, preResolutionRaw, reloadVerified };
}

function summarizeOutcome(world: any, raceId: string): { won: boolean; winners: string[]; seat: unknown; detail: string } {
  const race = world.elections.find((e: any) => e.id === raceId);
  const winners: string[] = race?.winners ?? [];
  const won = winners.includes("player");
  const seat = world.player.legislativeSeat ?? null;
  const names = (race?.candidates ?? []).filter((c: any) => c.id === "player").map(() => world.player.name);
  void names;
  return { won, winners, seat, detail: `status=${race?.status} winners=${JSON.stringify(winners)} seat=${JSON.stringify(seat)}` };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === "validate") {
    await validateMode();
    return;
  }
  const currentMode = args.mode === "generate-current";
  if (args.mode !== "generate" && !currentMode) {
    console.error(`Unknown --mode=${args.mode}; expected generate, generate-current or validate.`);
    process.exitCode = 1;
    return;
  }
  if (!currentMode && !args.engineRoot) {
    console.error("Generate mode requires --engine-root <pinned oracle checkout> (no default path baked into the repo).");
    process.exitCode = 1;
    return;
  }
  const oracleRoot = currentMode ? REPO_ROOT : resolve(args.engineRoot!);
  const oracleCommit = currentMode ? null : gitCapture(oracleRoot, ["rev-parse", "HEAD"]);
  const subjectCommit = gitCapture(REPO_ROOT, ["rev-parse", "HEAD"]);
  if (!currentMode && oracleCommit !== PINNED_ORACLE_COMMIT) {
    console.error(`Oracle pin mismatch: expected ${PINNED_ORACLE_COMMIT}, got ${oracleCommit ?? "unreadable"}. Refusing to generate.`);
    process.exitCode = 1;
    return;
  }
  const dirty = gitCapture(REPO_ROOT, ["status", "--porcelain", "--", "packages/engine", "packages/content"]);
  if (dirty) {
    console.error(`Subject engine sources dirty:\n${dirty}\nRefusing to generate.`);
    process.exitCode = 1;
    return;
  }
  if (currentMode && (!subjectCommit || !gitOk(REPO_ROOT, ["merge-base", "--is-ancestor", CURRENT_DISTRIBUTOR_COMMIT, subjectCommit]))) {
    console.error(`Subject ${subjectCommit ?? "unreadable"} does not contain current distributor ${CURRENT_DISTRIBUTOR_COMMIT}. Refusing to generate.`);
    process.exitCode = 1;
    return;
  }

  const oracle = (await import(pathToFileURL(join(oracleRoot, "packages", "engine", "src", "index.ts")).href)) as Engine;
  const local = (await import("@ahdclient/engine")) as Engine;

  const primary = await runSeason(oracle, { record: true });
  for (const line of primary.lines) console.log(line);

  const outcome = summarizeOutcome(primary.world, primary.raceId);
  console.log(`RESULT won=${outcome.won} ${outcome.detail}`);

  // Deterministic replay: same inputs through the same imported engine.
  const replayWorld = oracle.createWorld({ seed: SEED, playerName: PLAYER_NAME, countryId: COUNTRY_ID, era: ERA });
  const byTurn = new Map<number, LoggedAction[]>();
  for (const entry of primary.log) {
    const list = byTurn.get(entry.turn) ?? [];
    list.push(entry);
    byTurn.set(entry.turn, list);
  }
  let replayedTurns = 0;
  for (let turn = 0; turn <= TURN_CAP; turn++) {
    for (const entry of byTurn.get(replayWorld.meta.turn) ?? []) {
      const res = oracle.executeAction(replayWorld, "player", entry.actionId, entry.params as any);
      if (!res.ok) {
        console.error(`Replay diverged at t=${replayWorld.meta.turn} ${entry.actionId}: ${res.error}`);
        process.exitCode = 1;
        return;
      }
    }
    replayedTurns++;
    if (replayWorld.meta.turn >= primary.world.meta.turn) break;
    oracle.advanceTurn(replayWorld);
  }
  // Compared before officeholder actions mutate primary.world below.
  const primaryHash = worldHash(oracle, primary.world);
  const replayHash = worldHash(oracle, replayWorld);
  const replayMatch = primaryHash === replayHash;
  console.log(`REPLAY turns=${replayedTurns} match=${replayMatch} hash=${primaryHash.slice(0, 16)}`);
  const postSeasonHash = primaryHash;

  // Local-engine parity gate against the pinned oracle.
  const localRun = currentMode ? null : await runSeason(local, { record: false });
  const localOutcome = localRun ? summarizeOutcome(localRun.world, localRun.raceId) : outcome;
  const parityMatch = localRun ? worldHash(local, localRun.world) === primaryHash : replayMatch;
  console.log(currentMode
    ? `CURRENT replayWon=${localOutcome.won} hashMatch=${parityMatch}`
    : `PARITY localWon=${localOutcome.won} hashMatch=${parityMatch}`);

  let billFlow = "not attempted (player did not win)";
  let electedRaw: string | null = null;
  if (outcome.won) {
    // Revised strategy (run 1 evidence: sponsorBill needs 4 AP, only 2 banked
    // at t96): advance until solvent on action points, then sponsor. Cap 3.
    let waited = 0;
    while (primary.world.player.actions < 4 && waited < 3) {
      oracle.advanceTurn(primary.world);
      waited++;
    }
    const attempt = oracle.executeAction(primary.world, "player", "sponsorBill", { catalogId: BILL_CATALOG_ID });
    const sponsored = attempt.ok;
    if (!sponsored) billFlow = `sponsorBill rejected after +${waited} turns: ${(attempt as { error: string }).error}`;
    void sponsored;
    let voted = false;
    let billId: string | null = null;
    if (sponsored) {
      // Engine contract (actions/execute.ts voteOnBill): votable statuses are
      // active / active_other / veto_override in the player's own chamber.
      const votable = new Set(["active", "active_other", "veto_override"]);
      const seat = (primary.world.player as { legislativeSeat: { chamberKey: string } | null }).legislativeSeat;
      for (let extra = 0; extra < 5 && !voted; extra++) {
        oracle.advanceTurn(primary.world);
        const bills: any[] = primary.world.bills ?? [];
        const mine = bills.filter((b: any) => b.sponsorId === "player" || b.sponsor === "player");
        const open = [...mine, ...bills].find((b: any) => votable.has(b.status) && b.currentChamber === seat?.chamberKey);
        if (open) {
          billId = open.id;
          const res = oracle.executeAction(primary.world, "player", "voteOnBill", { billId: open.id, vote: "for" });
          voted = res.ok;
          billFlow = `sponsored catalog=${BILL_CATALOG_ID} bill=${open.id} voted=${voted} ${res.ok ? "" : (res as { error: string }).error}`;
          break;
        }
      }
      if (!voted && !billId) billFlow = `sponsored catalog=${BILL_CATALOG_ID} but no open vote within 5 turns`;
    } else if (billFlow.startsWith("not attempted")) {
      billFlow = "sponsorBill rejected by engine (no detail captured)";
    }
    electedRaw = oracle.serializeSave(primary.world, FIXED_SAVED_AT);
  }

  mkdirSync(FIXTURE_DIR, { recursive: true });
  const written: Record<string, { sha256: string; gzipSha256: string; bytes: number; gzipBytes: number }> = {};
  const writeFixture = (name: string, raw: string | null): void => {
    if (!raw) return;
    // Current distributor worlds carry substantially more generated candidate
    // detail. Maximum gzip compression keeps genuine full-world fixtures under
    // the repository's existing 3 MiB artifact cap without trimming state.
    const gz = gzipSync(Buffer.from(raw, "utf8"), { level: 9 });
    if (gz.length > MAX_GZIP_BYTES) {
      console.log(`SKIP ${name}: ${gz.length} compressed bytes exceeds 3MB; not written.`);
      return;
    }
    writeFileSync(join(FIXTURE_DIR, name), gz);
    written[name] = { sha256: sha256Hex(raw), gzipSha256: sha256Hex(gz), bytes: Buffer.byteLength(raw, "utf8"), gzipBytes: gz.length };
    console.log(`WROTE fixtures/${name} gz=${gz.length}`);
  };

  const fixturePrefix = currentMode ? "career-current-distributor" : "career";
  writeFixture(`${fixturePrefix}-t95-1953-US.save.json.gz`, primary.preResolutionRaw);
  if (electedRaw) writeFixture(`${fixturePrefix}-elected-1953-US.save.json.gz`, electedRaw);

  const provenance = {
    seed: SEED,
    player: PLAYER_NAME,
    era: ERA,
    country: COUNTRY_ID,
    party: PARTY_ID,
    race: primary.raceId,
    kind: currentMode ? "current-distributor" : "historical-oracle",
    oracleCommit,
    subjectCommit,
    ...(currentMode ? { distributorCommit: CURRENT_DISTRIBUTOR_COMMIT } : {}),
    oracleSchema: oracle.SCHEMA_VERSION,
    policy: "deterministic per-turn priority: buildDonorBase<4, fundraise while funds<120k, convertCash<=10k while funds<30k, campaign, advertise, fundraise, canvass(home), organize(home); setup at t1 join+file; full ordered action log embedded",
    actionLog: primary.log,
    outcome: { won: outcome.won, winners: outcome.winners, seat: outcome.seat, detail: outcome.detail },
    reloadVerified: primary.reloadVerified,
    replay: { match: replayMatch, hash: primaryHash },
    ...(currentMode ? {} : { localParity: { won: localOutcome.won, hashMatch: parityMatch } }),
    billFlow,
    fixtures: written,
  };
  const provName = outcome.won
    ? `${fixturePrefix}-elected-1953-US.provenance.json`
    : `${fixturePrefix}-t95-1953-US.provenance.json`;
  writeFileSync(join(FIXTURE_DIR, provName), `${JSON.stringify(provenance, null, 2)}\n`);
  console.log(`WROTE fixtures/${provName} won=${outcome.won}`);

  const report = [
    `seed=${SEED} race=${primary.raceId} won=${outcome.won}`,
    outcome.detail,
    `reload@t48 identical=${primary.reloadVerified}`,
    `replay match=${replayMatch} hash=${primaryHash}`,
    `local parity won=${localOutcome.won} hashMatch=${parityMatch}`,
    `bill: ${billFlow}`,
    `fixtures: ${JSON.stringify(written)}`,
    `${currentMode ? `distributor=${CURRENT_DISTRIBUTOR_COMMIT}` : `oracle=${oracleCommit}`} subject=${subjectCommit}`,
  ].join("\n");
  console.log(report);
  if (!replayMatch || !parityMatch || !primary.reloadVerified) process.exitCode = 1;
}

async function validateMode(): Promise<void> {
  const { existsSync, readFileSync, readdirSync } = await import("node:fs");
  const failures: string[] = [];
  const provFiles = existsSync(FIXTURE_DIR)
    ? readdirSync(FIXTURE_DIR).filter((f) => f.startsWith("career-") && f.endsWith(".provenance.json"))
    : [];
  if (provFiles.length === 0) {
    throw new Error("No career provenance fixtures present.");
  }
  const local = (await import("@ahdclient/engine")) as Engine;
  for (const provFile of provFiles) {
    const prov = JSON.parse(readFileSync(join(FIXTURE_DIR, provFile), "utf8")) as {
      fixtures: Record<string, { sha256: string; gzipSha256: string; bytes: number; gzipBytes: number }>;
      kind?: "current-distributor" | "historical-oracle"; oracleCommit: string | null;
      subjectCommit?: string; distributorCommit?: string; seed: string;
      outcome?: { won?: boolean }; replay?: { hash: string; match: boolean };
      localParity?: { hashMatch: boolean }; reloadVerified?: boolean;
    };
    for (const [name, meta] of Object.entries(prov.fixtures ?? {})) {
      const path = join(FIXTURE_DIR, name);
      if (!existsSync(path)) {
        failures.push(`${name}: missing`);
        continue;
      }
      const gz = readFileSync(path);
      if (gz.length > MAX_GZIP_BYTES) failures.push(`${name}: ${gz.length} exceeds 3MB`);
      const raw = gunzipSync(gz).toString("utf8");
      if (gz.length !== meta.gzipBytes || sha256Hex(gz) !== meta.gzipSha256) failures.push(`${name}: gzip integrity mismatch`);
      if (Buffer.byteLength(raw) !== meta.bytes || sha256Hex(raw) !== meta.sha256) failures.push(`${name}: raw integrity mismatch`);
      try {
        const world = local.deserializeSave(raw);
        if (world.meta.seed !== prov.seed) failures.push(`${name}: seed ${world.meta.seed} != ${prov.seed}`);
      } catch (error) {
        failures.push(`${name}: deserialize failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (!prov.replay?.match || !prov.reloadVerified) failures.push(`${provFile}: replay evidence failed`);
    if (prov.kind === "current-distributor") {
      if (!prov.outcome?.won) failures.push(`${provFile}: current-distributor fixture is not a player win`);
      if (prov.distributorCommit !== CURRENT_DISTRIBUTOR_COMMIT) failures.push(`${provFile}: distributor commit is not pinned`);
      if (!prov.subjectCommit || !/^[0-9a-f]{40}$/.test(prov.subjectCommit)) failures.push(`${provFile}: subject commit is missing or malformed`);
      if (Object.keys(prov.fixtures ?? {}).some((name) => !name.startsWith("career-current-distributor-"))) failures.push(`${provFile}: current fixture reused a historical filename`);
    } else {
      if (!prov.localParity?.hashMatch) failures.push(`${provFile}: historical local parity failed`);
      if (prov.oracleCommit !== PINNED_ORACLE_COMMIT) failures.push(`${provFile}: oracle ${prov.oracleCommit} != pinned`);
    }
  }
  if (failures.length) {
    for (const failure of failures) console.error(`validate FAIL: ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log(`validate: ok (${provFiles.join(", ")})`);
}

await main();
