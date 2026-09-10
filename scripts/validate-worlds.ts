/**
 * Bounded supported-world replay characterization.
 * Exercises the public engine contract only. Does not implement engine behavior.
 *
 *   npx tsx scripts/validate-worlds.ts
 *   npx tsx scripts/validate-worlds.ts --oracle-root <Egg3901/AHDClient@568c0c0 checkout>
 *
 * Writes artifacts/world-validation.json (gitignored). Caps one run at 120s.
 * Workers default to 1 (max 2). Does not invoke the full test suite.
 */
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const DEFAULT_OUTPUT = join(REPO_ROOT, "artifacts", "world-validation.json");
const HARD_CAP_MS = 120_000;
const FIXED_SAVED_AT = "2026-09-10T00:00:00.000Z";
const SEED = "world-validation-v1";
const PLAYER_NAME = "Validator";
const CONVERT_TARGET = 2000;
const PINNED_ORACLE_COMMIT = "568c0c039efcca2db17c52b2920747ff05fbd794";
const PINNED_ORACLE_REPO = "Egg3901/AHDClient";
const V42_ENGINE_COMMIT = "c5017542c860f5f94b7d4b4d5cfea2939b28995d";
const V42_FIXTURE_CANDIDATES = [
  join(REPO_ROOT, "fixtures", "v42-historical.save.json"),
  join(REPO_ROOT, "fixtures", "v42-historical.json"),
];

type ExecuteResult = { ok: true; message: string } | { ok: false; error: string };

type EngineContract = {
  SCHEMA_VERSION: number;
  listEras: () => Array<{ id: string; label: string; startDate: string }>;
  listPlayableCountries: (era: string) => Array<{ id: string; name: string }>;
  createWorld: (options: {
    seed: string;
    playerName: string;
    countryId: string;
    era: string;
  }) => {
    player: { cash: number };
    meta: { schemaVersion: number; turn: number; era: string };
  };
  executeAction: (
    world: object,
    actorId: string,
    actionId: string,
    params?: { amount?: number },
  ) => ExecuteResult;
  advanceTurn: (world: object) => unknown;
  serializeSave: (world: object, savedAt: string) => string;
  deserializeSave: (raw: string) => object;
};

type StepName =
  | "after_create"
  | "after_convertCash"
  | "after_turn_1"
  | "after_turn_2"
  | "after_reload"
  | "after_turn_3";

type StepRecord = {
  step: StepName;
  hash: string;
  bytes: number;
  twinMatch: boolean | null;
};

type ComboRecord = {
  era: string;
  countryId: string;
  countryName: string;
  status: "passed" | "failed" | "skipped";
  elapsedMs: number;
  initialCash: number | null;
  convertAmount: number | null;
  convertResult: ExecuteResult | null;
  steps: StepRecord[];
  errors: string[];
};

type RejectionRecord = {
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
};

function parseArgs(argv: string[]): {
  role: "main" | "hashes";
  output: string;
  oracleRoot: string | null;
  workers: number;
  v42Fixture: string | null;
} {
  let role: "main" | "hashes" = "main";
  let output = DEFAULT_OUTPUT;
  let oracleRoot: string | null = null;
  let workers = 1;
  let v42Fixture: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--role=hashes" || arg === "--role" && argv[i + 1] === "hashes") {
      role = "hashes";
      if (arg === "--role") i++;
    } else if (arg === "--output" || arg.startsWith("--output=")) {
      output = arg.includes("=") ? arg.slice("--output=".length) : argv[++i]!;
    } else if (arg === "--oracle-root" || arg.startsWith("--oracle-root=")) {
      oracleRoot = arg.includes("=") ? arg.slice("--oracle-root=".length) : argv[++i]!;
    } else if (arg === "--workers" || arg.startsWith("--workers=")) {
      const raw = arg.includes("=") ? arg.slice("--workers=".length) : argv[++i]!;
      workers = Math.min(2, Math.max(1, Number.parseInt(raw, 10) || 1));
    } else if (arg === "--v42-fixture" || arg.startsWith("--v42-fixture=")) {
      v42Fixture = arg.includes("=") ? arg.slice("--v42-fixture=".length) : argv[++i]!;
    }
  }
  return { role, output, oracleRoot, workers, v42Fixture };
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function gitCapture(cwd: string, args: string[]): string | null {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) return null;
  return (result.stdout ?? "").trim() || null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function expectThrow(label: string, run: () => unknown, match: RegExp): RejectionRecord {
  try {
    run();
    return { name: label, passed: false, expected: `throw /${match.source}/`, actual: "no throw" };
  } catch (error) {
    const actual = errorMessage(error);
    return {
      name: label,
      passed: match.test(actual),
      expected: `throw /${match.source}/`,
      actual,
    };
  }
}

function convertAmountFor(cash: number): number {
  if (cash >= CONVERT_TARGET) return CONVERT_TARGET;
  if (cash >= 2) return Math.floor(cash / 2);
  return 0;
}

async function loadEngine(): Promise<{ engine: EngineContract; origin: string }> {
  const entry = process.env.AHD_ENGINE_ENTRY;
  if (entry) {
    const mod = (await import(entry)) as EngineContract;
    return { engine: mod, origin: entry };
  }
  const mod = (await import("@ahdclient/engine")) as EngineContract;
  return { engine: mod, origin: "@ahdclient/engine" };
}

function deriveCombos(engine: EngineContract): Array<{ era: string; countryId: string; countryName: string }> {
  const combos: Array<{ era: string; countryId: string; countryName: string }> = [];
  for (const era of engine.listEras()) {
    for (const country of engine.listPlayableCountries(era.id)) {
      combos.push({ era: era.id, countryId: country.id, countryName: country.name });
    }
  }
  return combos;
}

function snapshot(engine: EngineContract, world: object): { raw: string; hash: string; bytes: number } {
  const raw = engine.serializeSave(world, FIXED_SAVED_AT);
  return { raw, hash: sha256(raw), bytes: Buffer.byteLength(raw, "utf8") };
}

function runCombo(
  engine: EngineContract,
  combo: { era: string; countryId: string; countryName: string },
  mode: "twins" | "hashes",
): ComboRecord {
  const started = Date.now();
  const record: ComboRecord = {
    era: combo.era,
    countryId: combo.countryId,
    countryName: combo.countryName,
    status: "passed",
    elapsedMs: 0,
    initialCash: null,
    convertAmount: null,
    convertResult: null,
    steps: [],
    errors: [],
  };
  const fail = (message: string) => {
    record.errors.push(message);
    record.status = "failed";
  };
  try {
    const a = engine.createWorld({
      seed: SEED,
      playerName: PLAYER_NAME,
      countryId: combo.countryId,
      era: combo.era,
    });
    const b =
      mode === "twins"
        ? engine.createWorld({
            seed: SEED,
            playerName: PLAYER_NAME,
            countryId: combo.countryId,
            era: combo.era,
          })
        : null;

    const pushStep = (step: StepName, left: object, right: object | null) => {
      const leftSnap = snapshot(engine, left);
      if (right) {
        const rightSnap = snapshot(engine, right);
        const match = leftSnap.raw === rightSnap.raw && leftSnap.hash === rightSnap.hash;
        record.steps.push({ step, hash: leftSnap.hash, bytes: leftSnap.bytes, twinMatch: match });
        if (!match) {
          fail(`${step}: twin raw save mismatch (left=${leftSnap.hash} right=${rightSnap.hash})`);
        }
      } else {
        record.steps.push({ step, hash: leftSnap.hash, bytes: leftSnap.bytes, twinMatch: null });
      }
      return leftSnap;
    };

    const cash = a.player.cash;
    record.initialCash = cash;
    pushStep("after_create", a, b);

    const amount = convertAmountFor(cash);
    record.convertAmount = amount;
    if (amount <= 0) {
      fail(`convertCash skipped: initial cash ${cash} is not affordable`);
    } else {
      const resultA = engine.executeAction(a, "player", "convertCash", { amount });
      record.convertResult = resultA;
      if (!resultA.ok) fail(`convertCash rejected: ${resultA.error}`);
      if (b) {
        const resultB = engine.executeAction(b, "player", "convertCash", { amount });
        if (JSON.stringify(resultA) !== JSON.stringify(resultB)) {
          fail(`convertCash twin result mismatch: ${JSON.stringify(resultA)} vs ${JSON.stringify(resultB)}`);
        }
      }
    }
    pushStep("after_convertCash", a, b);

    engine.advanceTurn(a);
    if (b) engine.advanceTurn(b);
    pushStep("after_turn_1", a, b);

    engine.advanceTurn(a);
    if (b) engine.advanceTurn(b);
    const afterTwo = pushStep("after_turn_2", a, b);

    if (b) {
      const reloaded = engine.deserializeSave(afterTwo.raw);
      const reloadedSnap = snapshot(engine, reloaded);
      const liveSnap = snapshot(engine, b);
      const match = reloadedSnap.raw === liveSnap.raw && reloadedSnap.hash === liveSnap.hash;
      record.steps.push({
        step: "after_reload",
        hash: reloadedSnap.hash,
        bytes: reloadedSnap.bytes,
        twinMatch: match,
      });
      if (!match) fail(`after_reload: reloaded twin !== live twin (${reloadedSnap.hash} vs ${liveSnap.hash})`);
      engine.advanceTurn(reloaded);
      engine.advanceTurn(b);
      pushStep("after_turn_3", reloaded, b);
    } else {
      const reloaded = engine.deserializeSave(afterTwo.raw);
      pushStep("after_reload", reloaded, null);
      engine.advanceTurn(reloaded);
      pushStep("after_turn_3", reloaded, null);
    }
  } catch (error) {
    fail(errorMessage(error));
  }
  record.elapsedMs = Date.now() - started;
  return record;
}

function runSaveRejections(engine: EngineContract): RejectionRecord[] {
  const world = engine.createWorld({
    seed: SEED,
    playerName: PLAYER_NAME,
    countryId: "US",
    era: "1953",
  });
  const raw = engine.serializeSave(world, FIXED_SAVED_AT);
  const parsed = JSON.parse(raw) as {
    format: string;
    schemaVersion: number;
    world: { countries?: unknown; meta: { schemaVersion: number } };
  };

  const future = structuredClone(parsed);
  future.schemaVersion = engine.SCHEMA_VERSION + 1;
  future.world.meta.schemaVersion = engine.SCHEMA_VERSION + 1;

  const missingCountries = structuredClone(parsed);
  delete missingCountries.world.countries;

  const wrongFormat = structuredClone(parsed);
  wrongFormat.format = "not-a-save";

  return [
    expectThrow("future_schema", () => engine.deserializeSave(JSON.stringify(future)), /newer version/i),
    expectThrow(
      "corrupt_missing_countries",
      () => engine.deserializeSave(JSON.stringify(missingCountries)),
      /not a valid save file/i,
    ),
    expectThrow("unparseable_json", () => engine.deserializeSave("{not-json"), /unparseable JSON/i),
    expectThrow("wrong_format_marker", () => engine.deserializeSave(JSON.stringify(wrongFormat)), /wrong format marker/i),
  ];
}

function locateV42Fixture(explicit: string | null): { path: string; source: string } | null {
  if (explicit) {
    return existsSync(explicit) ? { path: explicit, source: "cli" } : null;
  }
  for (const candidate of V42_FIXTURE_CANDIDATES) {
    if (existsSync(candidate)) return { path: candidate, source: "fixtures" };
  }
  return null;
}

function runV42Probe(engine: EngineContract, explicit: string | null) {
  const located = locateV42Fixture(explicit);
  if (!located) {
    return {
      status: "unsupported" as const,
      claim: "No authentic historical v42 serialized save is in this tree, and this run did not mint one.",
      historicalEngineCommit: `${PINNED_ORACLE_REPO}@${V42_ENGINE_COMMIT}`,
      note: "Egg3901/AHDClient@c5017542c860f5f94b7d4b4d5cfea2939b28995d is SCHEMA_VERSION 42. A v43 save with schemaVersion rewritten to 42 is not an authentic v42 fixture and was not used.",
      fixturePath: null,
      loaded: false,
      migratedSchemaVersion: null,
      error: null as string | null,
    };
  }
  try {
    const raw = readFileSync(located.path, "utf8");
    const parsed = JSON.parse(raw) as { schemaVersion?: unknown };
    if (parsed.schemaVersion !== 42) {
      return {
        status: "rejected_inauthentic" as const,
        claim: `Located file schemaVersion=${String(parsed.schemaVersion)}; authentic v42 required.`,
        historicalEngineCommit: `${PINNED_ORACLE_REPO}@${V42_ENGINE_COMMIT}`,
        note: "Refusing to treat a non-v42 envelope as a v42 compatibility fixture.",
        fixturePath: located.path,
        loaded: false,
        migratedSchemaVersion: null,
        error: null as string | null,
      };
    }
    const loaded = engine.deserializeSave(raw) as { meta: { schemaVersion: number } };
    return {
      status: "loaded" as const,
      claim: "Authentic v42 envelope deserialized and migrated by the current engine.",
      historicalEngineCommit: `${PINNED_ORACLE_REPO}@${V42_ENGINE_COMMIT}`,
      note: `Fixture source=${located.source}.`,
      fixturePath: located.path,
      loaded: true,
      migratedSchemaVersion: loaded.meta.schemaVersion,
      error: null as string | null,
    };
  } catch (error) {
    return {
      status: "failed" as const,
      claim: "Authentic-looking v42 fixture failed to load.",
      historicalEngineCommit: `${PINNED_ORACLE_REPO}@${V42_ENGINE_COMMIT}`,
      note: `Fixture source=${located.source}.`,
      fixturePath: located.path,
      loaded: false,
      migratedSchemaVersion: null,
      error: errorMessage(error),
    };
  }
}

function tsxCli(): string {
  return join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
}

type OracleRun = {
  status: "compared" | "failed";
  repository: string;
  expectedCommit: string;
  actualCommit: string | null;
  elapsedMs: number;
  error: string | null;
  combos: ComboRecord[];
};

function startOracleWorker(oracleRoot: string, timeoutMs: number): Promise<OracleRun> {
  const root = resolve(oracleRoot);
  const engineEntry = pathToFileURL(join(root, "packages", "engine", "src", "index.ts")).href;
  const commit = gitCapture(root, ["rev-parse", "HEAD"]);
  const started = Date.now();
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [tsxCli(), fileURLToPath(import.meta.url), "--role=hashes"], {
      env: { ...process.env, NODE_NO_WARNINGS: "1", AHD_ENGINE_ENTRY: engineEntry },
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, Math.max(1_000, timeoutMs));
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      const elapsedMs = Date.now() - started;
      const jsonStart = stdout.indexOf("{");
      if (jsonStart >= 0) {
        try {
          const parsed = JSON.parse(stdout.slice(jsonStart)) as { combos: ComboRecord[] };
          resolvePromise({
            status: "compared",
            repository: PINNED_ORACLE_REPO,
            expectedCommit: PINNED_ORACLE_COMMIT,
            actualCommit: commit,
            elapsedMs,
            error: null,
            combos: parsed.combos,
          });
          return;
        } catch (error) {
          resolvePromise({
            status: "failed",
            repository: PINNED_ORACLE_REPO,
            expectedCommit: PINNED_ORACLE_COMMIT,
            actualCommit: commit,
            elapsedMs,
            error: `oracle stdout was not JSON: ${errorMessage(error)}`,
            combos: [],
          });
          return;
        }
      }
      resolvePromise({
        status: "failed",
        repository: PINNED_ORACLE_REPO,
        expectedCommit: PINNED_ORACLE_COMMIT,
        actualCommit: commit,
        elapsedMs,
        error: (stderr.trim() || stdout.trim() || `oracle worker exit ${status} signal ${signal}`).slice(0, 4000),
        combos: [],
      });
    });
  });
}

function compareOracle(local: ComboRecord[], oracle: ComboRecord[]) {
  const byKey = new Map(oracle.map((combo) => [`${combo.era}:${combo.countryId}`, combo]));
  const mismatches: Array<{ era: string; countryId: string; step: string; local: string; oracle: string }> = [];
  let compared = 0;
  for (const combo of local) {
    const other = byKey.get(`${combo.era}:${combo.countryId}`);
    if (!other) continue;
    const oracleSteps = new Map(other.steps.map((step) => [step.step, step.hash]));
    for (const step of combo.steps) {
      const oracleHash = oracleSteps.get(step.step);
      if (!oracleHash) continue;
      compared += 1;
      if (oracleHash !== step.hash) {
        mismatches.push({
          era: combo.era,
          countryId: combo.countryId,
          step: step.step,
          local: step.hash,
          oracle: oracleHash,
        });
      }
    }
  }
  return { comparedSteps: compared, mismatchCount: mismatches.length, mismatches };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const deadline = Date.now() + HARD_CAP_MS;
  const { engine, origin } = await loadEngine();
  const combos = deriveCombos(engine);
  const subjectCommit = gitCapture(REPO_ROOT, ["rev-parse", "HEAD"]);
  const mode = args.role === "hashes" ? "hashes" : "twins";
  const oracleJob =
    args.role === "main" && args.oracleRoot
      ? startOracleWorker(args.oracleRoot, deadline - Date.now())
      : null;
  const workersUsed = oracleJob ? 2 : 1;
  const comboRecords: ComboRecord[] = [];
  let timedOut = false;

  for (const combo of combos) {
    if (Date.now() >= deadline) {
      timedOut = true;
      comboRecords.push({
        era: combo.era,
        countryId: combo.countryId,
        countryName: combo.countryName,
        status: "skipped",
        elapsedMs: 0,
        initialCash: null,
        convertAmount: null,
        convertResult: null,
        steps: [],
        errors: ["skipped: harness 120s cap"],
      });
      continue;
    }
    comboRecords.push(runCombo(engine, combo, mode));
  }

  if (args.role === "hashes") {
    process.stdout.write(JSON.stringify({ origin, schemaVersion: engine.SCHEMA_VERSION, combos: comboRecords }));
    return;
  }

  const remainingAfterCombos = deadline - Date.now();
  const saveRejection = remainingAfterCombos > 0 ? runSaveRejections(engine) : [];
  const v42 = runV42Probe(engine, args.v42Fixture);

  let oracle: OracleRun | { status: "skipped"; reason: string } = {
    status: "skipped",
    reason: "Pass --oracle-root <Egg3901/AHDClient@568c0c0 checkout> to compare against the pinned original engine.",
  };
  let oracleCompare: ReturnType<typeof compareOracle> | null = null;
  if (oracleJob) {
    const result = await oracleJob;
    oracle = result;
    if (result.status === "compared") oracleCompare = compareOracle(comboRecords, result.combos);
  }
  const oracleMismatches = oracleCompare?.mismatches ?? [];
  const oracleStatus =
    oracle.status === "skipped"
      ? "skipped"
      : oracle.status === "failed"
        ? "failed"
        : oracleMismatches.length > 0
          ? "mismatch"
          : "passed";

  const failed = comboRecords.filter((combo) => combo.status === "failed");
  const skipped = comboRecords.filter((combo) => combo.status === "skipped");
  const passed = comboRecords.filter((combo) => combo.status === "passed");
  const rejectionFailed = saveRejection.filter((item) => !item.passed);
  const totalMs = Date.now() - (deadline - HARD_CAP_MS);

  const artifact = {
    generatedAt: new Date().toISOString(),
    harness: {
      script: "scripts/validate-worlds.ts",
      hardCapMs: HARD_CAP_MS,
      workersRequested: args.workers,
      workersUsed,
      timedOut,
      invoke: "npx tsx scripts/validate-worlds.ts",
      fullSuiteInvoked: false,
    },
    subject: {
      repository: "Egg3901/AHDNative",
      commit: subjectCommit,
      engineOrigin: origin,
      schemaVersion: engine.SCHEMA_VERSION,
      pinnedSource: {
        repository: PINNED_ORACLE_REPO,
        commit: PINNED_ORACLE_COMMIT,
      },
    },
    derivedCombos: {
      count: combos.length,
      expectedNote: "Caller expected 21; this run derives from listEras + listPlayableCountries.",
      combos: combos.map((combo) => `${combo.era}/${combo.countryId}`),
    },
    sameEngineDeterminism: {
      status: failed.length === 0 && skipped.length === 0 ? "passed" : failed.length > 0 ? "failed" : "incomplete",
      passed: passed.length,
      failed: failed.length,
      skipped: skipped.length,
      claim: "Independent createWorld twins, convertCash, two turns, reload one, one more turn: exact raw serializeSave match per step.",
      notAClaim: "This is not AHDGame parity.",
    },
    oracleParity: {
      ...oracle,
      status: oracleStatus,
      compare: oracleCompare,
      claim:
        oracleStatus === "passed"
          ? "Exact serializeSave hashes matched the pinned original engine at the supplied checkout."
          : oracleStatus === "mismatch"
            ? "Pinned original engine ran, but at least one step hash differed."
            : "Pinned original engine comparison was not completed.",
      notAClaim: "Oracle match is AHDClient engine self-consistency after import, not AHDGame parity.",
    },
    ahdgameParity: {
      status: "not_measured",
      claim: "This harness does not load, invoke, or compare against AHDGame.",
    },
    saveRejection,
    v42Compatibility: v42,
    combos: comboRecords,
    timings: {
      totalMs,
      comboMs: comboRecords.map((combo) => ({
        era: combo.era,
        countryId: combo.countryId,
        elapsedMs: combo.elapsedMs,
      })),
    },
    errors: [
      ...failed.flatMap((combo) => combo.errors.map((error) => `${combo.era}/${combo.countryId}: ${error}`)),
      ...skipped.flatMap((combo) => combo.errors.map((error) => `${combo.era}/${combo.countryId}: ${error}`)),
      ...rejectionFailed.map((item) => `${item.name}: expected ${item.expected}, got ${item.actual}`),
      ...(oracle.status === "failed" && "error" in oracle && oracle.error ? [`oracle: ${oracle.error}`] : []),
      ...oracleMismatches.map(
        (item) => `oracle ${item.era}/${item.countryId} ${item.step}: local=${item.local} oracle=${item.oracle}`,
      ),
      ...(v42.status === "failed" && v42.error ? [`v42: ${v42.error}`] : []),
    ],
  };

  mkdirSync(dirname(args.output), { recursive: true });
  writeFileSync(args.output, `${JSON.stringify(artifact, null, 2)}\n`);

  const summary = {
    combos: `${passed.length}/${combos.length} passed`,
    failed: failed.length,
    skipped: skipped.length,
    timedOut,
    totalMs,
    schemaVersion: engine.SCHEMA_VERSION,
    sameEngine: artifact.sameEngineDeterminism.status,
    oracle: oracleStatus,
    ahdgame: "not_measured",
    v42: v42.status,
    output: args.output,
    errors: artifact.errors,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  const failedRun =
    failed.length > 0 ||
    skipped.length > 0 ||
    timedOut ||
    rejectionFailed.length > 0 ||
    oracleStatus === "failed" ||
    oracleStatus === "mismatch" ||
    v42.status === "failed";
  if (failedRun) process.exitCode = 1;
}

await main();
