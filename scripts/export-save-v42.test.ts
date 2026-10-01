/**
 * Filesystem CLI tests for scripts/export-save-v42.ts.
 *
 * Each test spawns the production CLI entry against temp files; nothing is
 * asserted about in-process writer internals here (those live in
 * src/game/saveCompatibility.test.ts).
 *
 * Run exactly:
 *   npm test -- scripts/export-save-v42.test.ts
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { advanceTurn, createWorld, deserializeSave, projectSaveToV42, serializeSave } from "@ahdclient/engine";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const CLI = join(REPO_ROOT, "scripts", "export-save-v42.ts");
const FIXTURE_GZ = join(REPO_ROOT, "fixtures", "v42-1953-US.save.json.gz");
const PRE_CEO_FRESH_SOURCE_GZ = join(REPO_ROOT, "fixtures", "native-fresh-pre-ceo-source.save.json.gz");
const V42_OLD_READER_IDENTITY_PROOF = join(REPO_ROOT, "fixtures", "v42-current-identity-old-reader-proof.json");
const FIXTURE_SHA = "471352be87c8887dcc6ae02f465b898272f62843b5e0861a45138c2de7f58cdc";
// Captured from af2f59b718ccb26beafa41e0c44b9bdcc1b47e7e with the exact
// createWorld arguments below, before #51 added source-backed issuer identity.
const PRE_CEO_FRESH_V42_SHA = "404370ac2e43de737ce3e664fafde05f34a8298bb51db2de9de8ae6de6c59b03";
const V42_READER_COMMIT = "c5017542c860f5f94b7d4b4d5cfea2939b28995d";
const SAVED_AT = "2026-09-10T00:00:00.000Z";

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function loadAuthenticV42(): string {
  return gunzipSync(readFileSync(FIXTURE_GZ)).toString("utf8");
}

function runCli(...args: string[]): { status: number | null; stdout: string; stderr: string } {
  const run = spawnSync(process.execPath, ["--import", "tsx", CLI, ...args], { cwd: REPO_ROOT, encoding: "utf8", timeout: 30_000 });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

let scratchDirs: string[] = [];
afterEach(() => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
  scratchDirs = [];
});

function freshDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "v42-export-"));
  scratchDirs.push(dir);
  return dir;
}

describe("export-save-v42 CLI", () => {
  it("refuses fresh TFP state without creating a historical export", () => {
    const world = createWorld({ seed: "v42-interchange-v1", playerName: "Validator", countryId: "US", era: "1953" });
    const dir = freshDir();
    const input = join(dir, "in.save.json");
    const output = join(dir, "out.save.json");
    writeFileSync(input, serializeSave(world, SAVED_AT));
    const run = runCli("--input", input, "--output", output);
    expect(run.status).not.toBe(0);
    expect(existsSync(output)).toBe(false);
    expect(run.stderr).toContain("Regional metric records");
  }, 60_000);

  it("exports the genuine v42 fixture byte-identical", () => {
    const authentic = loadAuthenticV42();
    expect(sha256(authentic)).toBe(FIXTURE_SHA);
    const dir = freshDir();
    const input = join(dir, "in.save.json");
    const output = join(dir, "out.save.json");
    writeFileSync(input, authentic);
    const run = runCli("--input", input, "--output", output);
    expect(run.status).toBe(0);
    expect(readFileSync(output, "utf8")).toBe(authentic);
  }, 60_000);

  it("projects the pinned pre-#51 source world to its historical v42 bytes", () => {
    const historicalSource = gunzipSync(readFileSync(PRE_CEO_FRESH_SOURCE_GZ)).toString("utf8");
    const sourceEnvelope = JSON.parse(historicalSource) as { schemaVersion: number; world: { meta: { schemaVersion: number } } };
    expect(sourceEnvelope.schemaVersion).toBe(48);
    expect(sourceEnvelope.world.meta.schemaVersion).toBe(48);
    const dir = freshDir();
    const input = join(dir, "in.save.json");
    const output = join(dir, "out.save.json");
    const migrated = deserializeSave(historicalSource);
    writeFileSync(input, serializeSave(migrated, SAVED_AT));
    const run = runCli("--input", input, "--output", output);
    expect(run.status).toBe(0);
    expect(sha256(readFileSync(output, "utf8"))).toBe(PRE_CEO_FRESH_V42_SHA);
  }, 60_000);

  it("refuses when the output already exists and leaves it untouched", () => {
    const dir = freshDir();
    const input = join(dir, "in.save.json");
    const output = join(dir, "out.save.json");
    writeFileSync(input, loadAuthenticV42());
    writeFileSync(output, "sentinel");
    const run = runCli("--input", input, "--output", output);
    expect(run.status).not.toBe(0);
    expect(readFileSync(output, "utf8")).toBe("sentinel");
    expect(run.stderr).toContain("output file already exists");
    expect(run.stderr).not.toContain("Validator");
  }, 60_000);

  it("fails an invalid save without creating output", () => {
    const dir = freshDir();
    const input = join(dir, "in.save.json");
    const output = join(dir, "out.save.json");
    writeFileSync(input, "{not a save");
    const run = runCli("--input", input, "--output", output);
    expect(run.status).not.toBe(0);
    expect(existsSync(output)).toBe(false);
    expect(run.stderr).toContain("unparseable JSON");
  }, 60_000);

  it("projects isolated source issuer identity without unsupported regional metric records", () => {
    const identityOnly = createWorld({ seed: "v42-interchange-v1", playerName: "Validator", countryId: "US", era: "1953" });
    // Isolate issuer identity on the genuine pre-control fixture. Fresh
    // TFP, Gosbank and SOE state have separate refusal coverage.
    const world = deserializeSave(gunzipSync(readFileSync(join(dirname(FIXTURE_GZ), "native-fresh-pre-ceo-source.save.json.gz"))).toString("utf8"));
    world.regions.DC = identityOnly.regions.DC!;
    for (const [id, corporation] of Object.entries(world.corporations)) {
      const source = identityOnly.corporations[id]!;
      corporation.name = source.name;
      corporation.brandColor = source.brandColor;
      corporation.headquartersRegionId = source.headquartersRegionId;
      delete corporation.legacyProjectionDefaults;
    }
    expect(world.player.homeRegionId).toBe("AL");
    world.regionalMetrics = {};
    const projection = projectSaveToV42(serializeSave(world, SAVED_AT));
    expect(projection.ok).toBe(true);
    if (!projection.ok) throw new Error(projection.error);
    const reloaded = deserializeSave(projection.contents);
    const oldReaderProof = JSON.parse(readFileSync(V42_OLD_READER_IDENTITY_PROOF, "utf8")) as {
      sourceCommit: string;
      readerCommit: string;
      readerSchema: number;
      before: { region: Record<string, unknown>; corporation: Record<string, unknown> };
      after: { region: Record<string, unknown>; corporation: Record<string, unknown> };
    };
    expect(oldReaderProof.readerCommit).toBe(V42_READER_COMMIT);
    expect(oldReaderProof.readerSchema).toBe(42);
    expect(oldReaderProof.sourceCommit).toBe("abb33daeb45bfe26241f047804ccac8c25781781");
    expect(oldReaderProof.after).toEqual(oldReaderProof.before);
    expect(oldReaderProof.before).toEqual({
      region: {
        id: "DC",
        countryId: "US",
        name: "District of Columbia",
        corporationHeadquartersOnly: true,
      },
      corporation: {
        name: "Daily Media",
        brandColor: "#06b6d4",
        headquartersRegionId: "DC",
      },
    });
    expect(reloaded.regions.DC).toMatchObject(oldReaderProof.after.region);
    expect(reloaded.corporations["US-media"]).toMatchObject(oldReaderProof.after.corporation);
    const dir = freshDir();
    const input = join(dir, "in.save.json");
    const output = join(dir, "out.save.json");
    writeFileSync(input, serializeSave(world, SAVED_AT));
    const run = runCli("--input", input, "--output", output);
    expect(run.status).toBe(0);
    const contents = readFileSync(output, "utf8");
    const parsed = JSON.parse(contents) as {
      schemaVersion: number;
      world: {
        meta: { schemaVersion: number };
        countryPolitics?: unknown;
        player: { homeRegionId?: unknown };
        regions?: Record<string, { id?: unknown; countryId?: unknown; corporationHeadquartersOnly?: unknown }>;
        corporations?: Record<string, { name?: unknown; brandColor?: unknown; headquartersRegionId?: unknown }>;
      };
    };
    expect(parsed.schemaVersion).toBe(42);
    expect(parsed.world.meta.schemaVersion).toBe(42);
    expect(parsed.world.player.homeRegionId).toBe("AL");
    expect(Object.prototype.hasOwnProperty.call(parsed.world, "countryPolitics")).toBe(false);
    expect(parsed.world.regions?.DC).toEqual({
      id: "DC",
      countryId: "US",
      name: "District of Columbia",
      corporationHeadquartersOnly: true,
    });
    expect(parsed.world.corporations?.["US-media"]).toMatchObject({
      name: "Daily Media",
      brandColor: "#06b6d4",
      headquartersRegionId: "DC",
    });
  }, 60_000);

  it("exports the historical pre-control pre-turn world as the keep-home v42 extension", () => {
    const world = deserializeSave(gunzipSync(readFileSync(join(REPO_ROOT, "fixtures", "native-fresh-pre-ceo-source.save.json.gz"))).toString("utf8"));
    expect(world.player.homeRegionId).toBe("AL");
    const dir = freshDir();
    const input = join(dir, "in.save.json");
    const output = join(dir, "out.save.json");
    writeFileSync(input, serializeSave(world, SAVED_AT));
    const run = runCli("--input", input, "--output", output);
    expect(run.status).toBe(0);
    const contents = readFileSync(output, "utf8");
    expect(sha256(contents)).toBe(PRE_CEO_FRESH_V42_SHA);
    const parsed = JSON.parse(contents) as {
      schemaVersion: number;
      world: { meta: { schemaVersion: number }; countryPolitics?: unknown; player: { homeRegionId?: unknown } };
    };
    expect(parsed.schemaVersion).toBe(42);
    expect(parsed.world.meta.schemaVersion).toBe(42);
    expect(parsed.world.player.homeRegionId).toBe("AL");
    expect(Object.prototype.hasOwnProperty.call(parsed.world, "countryPolitics")).toBe(false);
  }, 60_000);

  it("refuses a progressed Native world without creating output", () => {
    // Isolate progressed history from fresh TFP/SOE refusal.
    const world = deserializeSave(loadAuthenticV42());
    advanceTurn(world);
    const dir = freshDir();
    const input = join(dir, "in.save.json");
    const output = join(dir, "out.save.json");
    writeFileSync(input, serializeSave(world, SAVED_AT));
    const run = runCli("--input", input, "--output", output);
    expect(run.status).not.toBe(0);
    expect(existsSync(output)).toBe(false);
    expect(run.stderr).toMatch(/countryPolitics|market pressure|price history/);
    expect(run.stderr).not.toContain("Validator");
  }, 60_000);

  it("refuses a schema-relabeled v43 envelope without creating output", () => {
    const world = createWorld({ seed: "v42-interchange-v1", playerName: "Validator", countryId: "US", era: "1953" });
    const relabeled = JSON.parse(serializeSave(world, SAVED_AT)) as {
      schemaVersion: number;
      world: { meta: { schemaVersion: number } };
    };
    relabeled.schemaVersion = 42;
    relabeled.world.meta.schemaVersion = 42;
    const dir = freshDir();
    const input = join(dir, "in.save.json");
    const output = join(dir, "out.save.json");
    writeFileSync(input, JSON.stringify(relabeled));
    const run = runCli("--input", input, "--output", output);
    expect(run.status).not.toBe(0);
    expect(existsSync(output)).toBe(false);
    expect(run.stderr).toMatch(/countryPolitics|homeRegionId|not an authentic schema 42/i);
    expect(run.stderr).not.toContain("Validator");
  }, 60_000);

  it("prints usage for --help", () => {
    const run = runCli("--help");
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/--input/);
    expect(run.stdout).toMatch(/--output/);
  }, 60_000);
});
