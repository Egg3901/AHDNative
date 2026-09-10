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
import { advanceTurn, createWorld, serializeSave } from "@ahdclient/engine";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const CLI = join(REPO_ROOT, "scripts", "export-save-v42.ts");
const FIXTURE_GZ = join(REPO_ROOT, "fixtures", "v42-1953-US.save.json.gz");
const FIXTURE_SHA = "471352be87c8887dcc6ae02f465b898272f62843b5e0861a45138c2de7f58cdc";
const NATIVE_FRESH_KEEP_HOME_SHA = "f141e9a919d8a6626c53a1ca6c4c9856ec5ccc97410b0a4c2ba8d61ba3aaa320";
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

  it("exports a Native-fresh pre-turn v43 world as the keep-home v42 extension", () => {
    const world = createWorld({ seed: "v42-interchange-v1", playerName: "Validator", countryId: "US", era: "1953" });
    expect(world.player.homeRegionId).toBe("AL");
    const dir = freshDir();
    const input = join(dir, "in.save.json");
    const output = join(dir, "out.save.json");
    writeFileSync(input, serializeSave(world, SAVED_AT));
    const run = runCli("--input", input, "--output", output);
    expect(run.status).toBe(0);
    const contents = readFileSync(output, "utf8");
    expect(sha256(contents)).toBe(NATIVE_FRESH_KEEP_HOME_SHA);
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
    const world = createWorld({ seed: "v42-interchange-v1", playerName: "Validator", countryId: "US", era: "1953" });
    advanceTurn(world);
    const dir = freshDir();
    const input = join(dir, "in.save.json");
    const output = join(dir, "out.save.json");
    writeFileSync(input, serializeSave(world, SAVED_AT));
    const run = runCli("--input", input, "--output", output);
    expect(run.status).not.toBe(0);
    expect(existsSync(output)).toBe(false);
    expect(run.stderr).toMatch(/countryPolitics/);
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
