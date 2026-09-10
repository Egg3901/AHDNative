/**
 * Authentic v42 interchange characterization.
 * Exercises public createWorld / executeAction / advanceTurn / serializeSave /
 * deserializeSave only. Does not implement engine behavior, downgrade, or
 * schema relabel.
 *
 *   npx tsx scripts/validate-v42.ts --v42-root <Egg3901/AHDClient@c5017542 checkout>
 *
 * Writes artifacts/v42-validation.json (gitignored). Caps one run at 120s.
 * One world, three turns. Does not invoke the full test suite.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { gunzipSync, gzipSync } from "node:zlib";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const DEFAULT_OUTPUT = join(REPO_ROOT, "artifacts", "v42-validation.json");
const FIXTURE_GZ = join(REPO_ROOT, "fixtures", "v42-1953-US.save.json.gz");
const PROVENANCE = join(REPO_ROOT, "fixtures", "v42-1953-US.provenance.json");
const HARD_CAP_MS = 120_000;
const FIXED_SAVED_AT = "2026-09-10T00:00:00.000Z";
const SEED = "v42-interchange-v1";
const PLAYER_NAME = "Validator";
const ERA = "1953";
const COUNTRY_ID = "US";
const CONVERT_AMOUNT = 2000;
const PINNED_V42_REPO = "Egg3901/AHDClient";
const PINNED_V42_COMMIT = "c5017542c860f5f94b7d4b4d5cfea2939b28995d";
const NATIVE_SCHEMA = 43;
const V42_SCHEMA = 42;
const FUTURE_REJECTION = /newer version/i;

type ExecuteResult = { ok: true; message: string } | { ok: false; error: string };

type EngineContract = {
  SCHEMA_VERSION: number;
  createWorld: (options: {
    seed: string;
    playerName: string;
    countryId: string;
    era: string;
  }) => {
    player: { cash: number; homeRegionId?: string | null };
    meta: { schemaVersion: number; turn: number; era: string };
    countryPolitics?: unknown;
  };
  executeAction: (
    world: object,
    actorId: string,
    actionId: string,
    params?: { amount?: number },
  ) => ExecuteResult;
  advanceTurn: (world: object) => unknown;
  serializeSave: (world: object, savedAt: string) => string;
  deserializeSave: (raw: string) => {
    player: { homeRegionId?: string | null };
    meta: { schemaVersion: number };
    countryPolitics?: unknown;
  };
};

type Envelope = {
  format: string;
  schemaVersion: number;
  savedAt: string;
  world: {
    meta: { schemaVersion: number; turn: number; era: string; seed: string };
    player: { countryId: string; name: string; cash: number; homeRegionId?: unknown };
    countryPolitics?: unknown;
    countries?: unknown;
  };
};

type Check = { name: string; passed: boolean; expected: string; actual: string };

function parseArgs(argv: string[]): { output: string; v42Root: string | null } {
  let output = DEFAULT_OUTPUT;
  let v42Root: string | null = process.env.AHD_V42_ENGINE_ROOT ?? null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--output" || arg.startsWith("--output=")) {
      output = arg.includes("=") ? arg.slice("--output=".length) : argv[++i]!;
    } else if (arg === "--v42-root" || arg.startsWith("--v42-root=")) {
      v42Root = arg.includes("=") ? arg.slice("--v42-root=".length) : argv[++i]!;
    }
  }
  return { output, v42Root };
}

function sha256(text: string | Buffer): string {
  return createHash("sha256").update(text).digest("hex");
}

function gitCapture(cwd: string, args: string[]): string | null {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) return null;
  return (result.stdout ?? "").trim() || null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function expectThrow(name: string, run: () => unknown, match: RegExp): Check {
  try {
    run();
    return { name, passed: false, expected: `throw /${match.source}/`, actual: "no throw" };
  } catch (error) {
    const actual = errorMessage(error);
    return { name, passed: match.test(actual), expected: `throw /${match.source}/`, actual };
  }
}

type Snap = { raw: string; hash: string; bytes: number; schemaVersion: number };
type StepSnap = { step: string; hash: string; bytes: number; schemaVersion: number };

function snapshot(engine: EngineContract, world: object): Snap {
  const raw = engine.serializeSave(world, FIXED_SAVED_AT);
  const parsed = JSON.parse(raw) as Envelope;
  return { raw, hash: sha256(raw), bytes: Buffer.byteLength(raw, "utf8"), schemaVersion: parsed.schemaVersion };
}

function stepOf(step: string, snap: Snap): StepSnap {
  return { step, hash: snap.hash, bytes: snap.bytes, schemaVersion: snap.schemaVersion };
}

function inspectEnvelope(raw: string): {
  schemaVersion: number;
  metaSchemaVersion: number;
  format: string;
  hasCountryPolitics: boolean;
  hasHomeRegionId: boolean;
  homeRegionId: unknown;
  seed: string;
  era: string;
  countryId: string;
  turn: number;
} {
  const parsed = JSON.parse(raw) as Envelope;
  return {
    schemaVersion: parsed.schemaVersion,
    metaSchemaVersion: parsed.world.meta.schemaVersion,
    format: parsed.format,
    hasCountryPolitics: Object.prototype.hasOwnProperty.call(parsed.world, "countryPolitics"),
    hasHomeRegionId: Object.prototype.hasOwnProperty.call(parsed.world.player, "homeRegionId"),
    homeRegionId: parsed.world.player.homeRegionId ?? null,
    seed: parsed.world.meta.seed,
    era: parsed.world.meta.era,
    countryId: parsed.world.player.countryId,
    turn: parsed.world.meta.turn,
  };
}

function relabelAsV42(raw: string): string {
  const parsed = JSON.parse(raw) as Envelope;
  parsed.schemaVersion = V42_SCHEMA;
  parsed.world.meta.schemaVersion = V42_SCHEMA;
  return JSON.stringify(parsed);
}

async function loadEngine(entry: string | null): Promise<EngineContract> {
  if (entry) {
    return (await import(entry)) as EngineContract;
  }
  return (await import("@ahdclient/engine")) as EngineContract;
}

async function main(): Promise<void> {
  const started = Date.now();
  const args = parseArgs(process.argv.slice(2));
  const deadline = started + HARD_CAP_MS;
  const checks: Check[] = [];
  const errors: string[] = [];
  const fail = (message: string) => {
    errors.push(message);
  };
  const add = (check: Check) => {
    checks.push(check);
    if (!check.passed) fail(`${check.name}: expected ${check.expected}, got ${check.actual}`);
  };

  if (!args.v42Root) {
    fail(
      `Missing --v42-root. Pin ${PINNED_V42_REPO}@${PINNED_V42_COMMIT} in a separate AHDClient worktree and pass that path.`,
    );
    writeReport(args.output, started, deadline, null, null, checks, errors, null, null, null);
    process.exitCode = 1;
    return;
  }

  const v42Root = resolve(args.v42Root);
  const v42Commit = gitCapture(v42Root, ["rev-parse", "HEAD"]);
  const subjectCommit = gitCapture(REPO_ROOT, ["rev-parse", "HEAD"]);
  add({
    name: "v42_engine_commit",
    passed: v42Commit === PINNED_V42_COMMIT,
    expected: PINNED_V42_COMMIT,
    actual: v42Commit ?? "unreadable",
  });

  const sourceChanges = gitCapture(v42Root, ["status", "--porcelain", "--", "packages/engine", "packages/content"]);
  add({ name: "v42_engine_sources_clean", passed: !sourceChanges, expected: "no source changes", actual: sourceChanges ?? "clean" });
  if (errors.length) {
    writeReport(args.output, started, deadline, v42Commit, subjectCommit, checks, errors, null, v42Root, null);
    process.exitCode = 1;
    return;
  }

  const native = await loadEngine(null);
  const v42 = await loadEngine(pathToFileURL(join(v42Root, "packages", "engine", "src", "index.ts")).href);

  add({
    name: "native_schema_is_43",
    passed: native.SCHEMA_VERSION === NATIVE_SCHEMA,
    expected: String(NATIVE_SCHEMA),
    actual: String(native.SCHEMA_VERSION),
  });
  add({
    name: "v42_schema_is_42",
    passed: v42.SCHEMA_VERSION === V42_SCHEMA,
    expected: String(V42_SCHEMA),
    actual: String(v42.SCHEMA_VERSION),
  });
  if (native.SCHEMA_VERSION !== NATIVE_SCHEMA || v42.SCHEMA_VERSION !== V42_SCHEMA) {
    fail("Refusing to continue: this harness will not relabel v43 as v42 or pin the wrong engine.");
    writeReport(args.output, started, deadline, v42Commit, subjectCommit, checks, errors, null, null, null);
    process.exitCode = 1;
    return;
  }

  const minted = v42.createWorld({ seed: SEED, playerName: PLAYER_NAME, countryId: COUNTRY_ID, era: ERA });
  const v42Create = snapshot(v42, minted);
  const mintedInfo = inspectEnvelope(v42Create.raw);
  add({
    name: "authentic_v42_envelope",
    passed: mintedInfo.schemaVersion === V42_SCHEMA && mintedInfo.metaSchemaVersion === V42_SCHEMA,
    expected: "envelope+meta schemaVersion 42",
    actual: `envelope ${mintedInfo.schemaVersion} meta ${mintedInfo.metaSchemaVersion}`,
  });
  add({
    name: "authentic_v42_omits_countryPolitics",
    passed: mintedInfo.hasCountryPolitics === false,
    expected: "countryPolitics absent",
    actual: mintedInfo.hasCountryPolitics ? "present" : "absent",
  });
  add({
    name: "authentic_v42_omits_homeRegionId",
    passed: mintedInfo.hasHomeRegionId === false,
    expected: "player.homeRegionId absent",
    actual: mintedInfo.hasHomeRegionId ? "present" : "absent",
  });

  let fixture: { path: string; sha256: string; gzipSha256: string; bytes: number; gzipBytes: number } | null = null;
  if (existsSync(FIXTURE_GZ)) {
    const gz = readFileSync(FIXTURE_GZ);
    const raw = gunzipSync(gz).toString("utf8");
    const info = inspectEnvelope(raw);
    add({
      name: "fixture_is_authentic_v42",
      passed: info.schemaVersion === V42_SCHEMA && info.metaSchemaVersion === V42_SCHEMA && info.hasCountryPolitics === false,
      expected: "gzip fixture envelope 42 without countryPolitics",
      actual: `schema ${info.schemaVersion} countryPolitics=${info.hasCountryPolitics}`,
    });
    add({
      name: "fixture_matches_live_mint",
      passed: sha256(raw) === v42Create.hash,
      expected: v42Create.hash,
      actual: sha256(raw),
    });
    fixture = {
      path: "fixtures/v42-1953-US.save.json.gz",
      sha256: sha256(raw),
      gzipSha256: sha256(gz),
      bytes: Buffer.byteLength(raw, "utf8"),
      gzipBytes: gz.length,
    };
  } else {
    fail("Missing fixtures/v42-1953-US.save.json.gz; live mint succeeded but provenance fixture is absent.");
  }

  const loadA = native.deserializeSave(v42Create.raw);
  const loadB = native.deserializeSave(v42Create.raw);
  const nativeLoadA = snapshot(native, loadA);
  const nativeLoadB = snapshot(native, loadB);
  add({
    name: "native_loads_authentic_v42",
    passed: loadA.meta.schemaVersion === NATIVE_SCHEMA,
    expected: `migrated schema ${NATIVE_SCHEMA}`,
    actual: String(loadA.meta.schemaVersion),
  });
  add({
    name: "native_repeated_load_deterministic",
    passed: nativeLoadA.raw === nativeLoadB.raw,
    expected: nativeLoadA.hash,
    actual: nativeLoadB.hash,
  });
  add({
    name: "native_migration_homeRegionId_null",
    passed: loadA.player.homeRegionId === null,
    expected: "null",
    actual: String(loadA.player.homeRegionId),
  });
  add({
    name: "native_migration_seeds_countryPolitics",
    passed: loadA.countryPolitics != null && typeof loadA.countryPolitics === "object",
    expected: "countryPolitics record",
    actual: loadA.countryPolitics == null ? "missing" : typeof loadA.countryPolitics,
  });

  const convertA = native.executeAction(loadA, "player", "convertCash", { amount: CONVERT_AMOUNT });
  const convertB = native.executeAction(loadB, "player", "convertCash", { amount: CONVERT_AMOUNT });
  add({
    name: "native_convertCash",
    passed: convertA.ok === true && JSON.stringify(convertA) === JSON.stringify(convertB),
    expected: "ok convertCash twins match",
    actual: JSON.stringify({ convertA, convertB }),
  });

  const v42Steps: StepSnap[] = [stepOf("after_create", v42Create)];
  const v42Twin = v42.createWorld({ seed: SEED, playerName: PLAYER_NAME, countryId: COUNTRY_ID, era: ERA });
  const v42Convert = v42.executeAction(minted, "player", "convertCash", { amount: CONVERT_AMOUNT });
  v42.executeAction(v42Twin, "player", "convertCash", { amount: CONVERT_AMOUNT });
  v42Steps.push(stepOf("after_convertCash", snapshot(v42, minted)));

  const nativeAfterConvertA = snapshot(native, loadA);
  const nativeAfterConvertB = snapshot(native, loadB);
  const nativeSteps: Array<StepSnap & { twinMatch: boolean }> = [
    { ...stepOf("after_native_load", nativeLoadA), twinMatch: nativeLoadA.raw === nativeLoadB.raw },
    { ...stepOf("after_convertCash", nativeAfterConvertA), twinMatch: nativeAfterConvertA.raw === nativeAfterConvertB.raw },
  ];

  for (const step of ["after_turn_1", "after_turn_2"] as const) {
    if (Date.now() >= deadline) {
      fail("skipped remaining turns: harness 120s cap");
      break;
    }
    v42.advanceTurn(minted);
    v42.advanceTurn(v42Twin);
    const v42Snap = snapshot(v42, minted);
    const v42TwinSnap = snapshot(v42, v42Twin);
    v42Steps.push(stepOf(step, v42Snap));
    add({
      name: `v42_${step}_twin`,
      passed: v42Snap.raw === v42TwinSnap.raw,
      expected: v42Snap.hash,
      actual: v42TwinSnap.hash,
    });

    native.advanceTurn(loadA);
    native.advanceTurn(loadB);
    const nA = snapshot(native, loadA);
    const nB = snapshot(native, loadB);
    nativeSteps.push({ ...stepOf(step, nA), twinMatch: nA.raw === nB.raw });
    add({
      name: `native_${step}_twin`,
      passed: nA.raw === nB.raw,
      expected: nA.hash,
      actual: nB.hash,
    });
  }

  if (errors.every((item) => !item.includes("120s cap"))) {
    const afterTwo = snapshot(native, loadA);
    const reloaded = native.deserializeSave(afterTwo.raw);
    const live = loadB;
    native.advanceTurn(reloaded);
    native.advanceTurn(live);
    const t3a = snapshot(native, reloaded);
    const t3b = snapshot(native, live);
    nativeSteps.push({ ...stepOf("after_turn_3", t3a), twinMatch: t3a.raw === t3b.raw });
    add({
      name: "native_after_reload_turn_3",
      passed: t3a.raw === t3b.raw,
      expected: t3a.hash,
      actual: t3b.hash,
    });

    const v42AfterTwo = snapshot(v42, minted);
    const v42Reloaded = v42.deserializeSave(v42AfterTwo.raw);
    v42.advanceTurn(v42Reloaded);
    v42.advanceTurn(v42Twin);
    const v42t3a = snapshot(v42, v42Reloaded);
    const v42t3b = snapshot(v42, v42Twin);
    v42Steps.push(stepOf("after_reload", v42AfterTwo));
    v42Steps.push(stepOf("after_turn_3", v42t3a));
    add({
      name: "v42_after_reload_turn_3",
      passed: v42t3a.raw === v42t3b.raw,
      expected: v42t3a.hash,
      actual: v42t3b.hash,
    });
  }

  const v43world = native.createWorld({ seed: SEED, playerName: PLAYER_NAME, countryId: COUNTRY_ID, era: ERA });
  const v43raw = native.serializeSave(v43world, FIXED_SAVED_AT);
  const v43info = inspectEnvelope(v43raw);
  add({
    name: "native_writer_is_v43",
    passed: v43info.schemaVersion === NATIVE_SCHEMA && v43info.hasCountryPolitics === true,
    expected: "envelope 43 with countryPolitics",
    actual: `schema ${v43info.schemaVersion} countryPolitics=${v43info.hasCountryPolitics} homeRegionId=${String(v43info.homeRegionId)}`,
  });
  add(
    expectThrow("v43_writer_rejected_by_v42_reader", () => v42.deserializeSave(v43raw), FUTURE_REJECTION),
  );

  const migratedV43 = native.serializeSave(loadA, FIXED_SAVED_AT);
  add(
    expectThrow(
      "migrated_v42_reexport_rejected_by_v42_reader",
      () => v42.deserializeSave(migratedV43),
      FUTURE_REJECTION,
    ),
  );

  const relabeled = relabelAsV42(v43raw);
  const relabelInfo = inspectEnvelope(relabeled);
  let relabelV42: { accepted: boolean; message: string; hasCountryPolitics: boolean | null } = {
    accepted: false,
    message: "",
    hasCountryPolitics: null,
  };
  try {
    const loaded = v42.deserializeSave(relabeled);
    relabelV42 = {
      accepted: true,
      message: "v42 reader accepted a v43 envelope rewritten to schema 42",
      hasCountryPolitics: loaded.countryPolitics != null,
    };
  } catch (error) {
    relabelV42 = { accepted: false, message: errorMessage(error), hasCountryPolitics: null };
  }
  // This probes extension tolerance, not certified compatibility. Record the
  // observation without counting it as an always-passing behavioral assertion.

  const timedOut = Date.now() >= deadline;
  if (timedOut) fail("harness 120s cap reached");

  const exportEvidence = {
    losslessV42ExportValidated: false,
    relabelObservation: relabelV42,
    reason:
      "Native writes schema 43, which the v42 reader rejects. The old reader tolerates additional fields when the version is changed, but this does not certify their semantics across old-engine turns. A compatibility writer requires explicit field policy and continuation tests; none is implemented.",
    v43OnlyFields: ["world.countryPolitics", "player.homeRegionId"],
    nativeFreshHomeRegionId: v43info.homeRegionId,
    migratedV42HomeRegionId: loadA.player.homeRegionId ?? null,
    downgradeImplemented: false,
  };

  writeReport(
    args.output,
    started,
    deadline,
    v42Commit,
    subjectCommit,
    checks,
    errors,
    {
      fixture,
      minted: { ...mintedInfo, hash: v42Create.hash, bytes: v42Create.bytes, gzipBytes: gzipSync(Buffer.from(v42Create.raw, "utf8")).length },
      v42Convert,
      convertA,
      v42Steps,
      nativeSteps,
      v43info,
      relabelInfo,
      relabelV42,
      exportEvidence,
      provenancePath: "fixtures/v42-1953-US.provenance.json",
    },
    v42Root,
    native.SCHEMA_VERSION,
  );

  process.exitCode = errors.length === 0 ? 0 : 1;
}

function writeReport(
  output: string,
  started: number,
  deadline: number,
  v42Commit: string | null,
  subjectCommit: string | null,
  checks: Check[],
  errors: string[],
  body: Record<string, unknown> | null,
  v42Root: string | null,
  nativeSchema: number | null,
): void {
  mkdirSync(dirname(output), { recursive: true });
  const artifact = {
    generatedAt: new Date().toISOString(),
    harness: {
      script: "scripts/validate-v42.ts",
      hardCapMs: HARD_CAP_MS,
      timedOut: Date.now() >= deadline,
      invoke: "npx tsx scripts/validate-v42.ts --v42-root <Egg3901/AHDClient@c5017542 checkout>",
      fullSuiteInvoked: false,
      worlds: 1,
      turns: 3,
    },
    subject: {
      repository: "Egg3901/AHDNative",
      commit: subjectCommit,
      schemaVersion: nativeSchema,
    },
    v42Engine: {
      repository: PINNED_V42_REPO,
      expectedCommit: PINNED_V42_COMMIT,
      actualCommit: v42Commit,
      rootProvided: Boolean(v42Root),
    },
    claims: {
      authenticV42Mint: "createWorld+serializeSave on the pinned v42 engine emits envelope 42 without countryPolitics or homeRegionId.",
      nativeLoad: "Native deserializeSave migrates authentic v42 to schema 43, seeds countryPolitics, sets homeRegionId null.",
      repeatedLoad: "Two independent Native loads of the same v42 bytes, then convertCash and three turns including one reload, produce byte-identical serializeSave.",
      v43RejectedByV42: "Native v43 serializeSave is rejected by the v42 deserializeSave with the newer-version error.",
      notAClaim: [
        "AHDGame parity",
        "lossless v42 export / downgrade writer",
        "relabeled v43-as-42 is authentic",
        "full sim suite",
      ],
    },
    checks,
    errors,
    ...(body ?? {}),
    timings: { totalMs: Date.now() - started },
  };
  writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`);
  const outputRel = output.startsWith(REPO_ROOT) ? output.slice(REPO_ROOT.length + 1) : output;
  process.stdout.write(
    `${errors.length === 0 ? "PASS" : "FAIL"} v42 interchange checks=${checks.filter((c) => c.passed).length}/${checks.length} errors=${errors.length} ms=${Date.now() - started} out=${outputRel}\n`,
  );
  if (errors.length) {
    for (const error of errors) process.stderr.write(`${error}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${errorMessage(error)}\n`);
  process.exitCode = 1;
});
