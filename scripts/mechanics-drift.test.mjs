/**
 * Public CLI tests for scripts/mechanics-drift.mjs.
 *
 * The tests use temporary Git repositories so the source revision and changed
 * paths are observed through the same command that CI and maintainers run.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const CLI = join(REPO_ROOT, "scripts", "mechanics-drift.mjs");

/** @type {string[]} */
let scratchDirs = [];

afterEach(() => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
  scratchDirs = [];
});

function scratch(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratchDirs.push(dir);
  return dir;
}

function gitEnv() {
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  delete env.GIT_OBJECT_DIRECTORY;
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_TERMINAL_PROMPT = "0";
  env.GIT_AUTHOR_NAME = "Drift Fixture";
  env.GIT_AUTHOR_EMAIL = "drift-fixture@example.com";
  env.GIT_COMMITTER_NAME = "Drift Fixture";
  env.GIT_COMMITTER_EMAIL = "drift-fixture@example.com";
  return env;
}

function runGit(cwd, args) {
  const run = spawnSync("git", args, { cwd, encoding: "utf8", env: gitEnv(), timeout: 15_000 });
  assert.equal(run.status, 0, `git ${args.join(" ")} failed: ${run.stderr}`);
  return run;
}

function initSourceRepo(files) {
  const dir = scratch("mechanics-drift-source-");
  runGit(dir, ["init", "-b", "main"]);
  runGit(dir, ["config", "user.name", "Drift Fixture"]);
  runGit(dir, ["config", "user.email", "drift-fixture@example.com"]);
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  runGit(dir, ["add", "-A"]);
  runGit(dir, ["commit", "-m", "baseline"]);
  const baselineRevision = runGit(dir, ["rev-parse", "HEAD"]).stdout.trim();
  return { dir, baselineRevision };
}

function commitAll(dir, message) {
  runGit(dir, ["add", "-A"]);
  runGit(dir, ["commit", "-m", message]);
  return runGit(dir, ["rev-parse", "HEAD"]).stdout.trim();
}

function writeManifest(baselineRevision, slices) {
  const path = join(scratch("mechanics-drift-manifest-"), "manifest.json");
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        repository: "Egg3901/AHDGame",
        baselineRevision,
        trackedRoots: ["src/lib", "src/simulation"],
        slices,
      },
      null,
      2,
    )}\n`,
  );
  return path;
}

function runCli(args) {
  const run = spawnSync(process.execPath, [CLI, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: 30_000,
    env: gitEnv(),
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

function combined(run) {
  return `${run.stdout}\n${run.stderr}`;
}

const ACTION_SLICE = {
  id: "actions",
  description: "action costs, eligibility and effects",
  paths: ["src/lib/actions/"],
  consumers: ["packages/engine/src/actions/", "packages/game-rules/actions/"],
};

describe("mechanics drift CLI", () => {
  it("reports a classified source change and its Native consumers", () => {
    const source = initSourceRepo({ "src/lib/actions/rules.ts": "export const cost = 3;\n" });
    writeFileSync(join(source.dir, "src/lib/actions/rules.ts"), "export const cost = 4;\n");
    const targetRevision = commitAll(source.dir, "change action cost");
    const manifest = writeManifest(source.baselineRevision, [ACTION_SLICE]);

    const report = runCli(["--source", source.dir, "--manifest", manifest, "--to", targetRevision]);

    assert.equal(report.status, 0, combined(report));
    assert.match(combined(report), /slice actions/);
    assert.match(combined(report), /src\/lib\/actions\/rules\.ts/);
    assert.match(combined(report), /packages\/engine\/src\/actions\//);
    assert.match(combined(report), /fail-on-drift/);
  });

  it("fails strict mode when a changed source path has no classification", () => {
    const source = initSourceRepo({ "src/lib/actions/rules.ts": "export const cost = 3;\n" });
    writeFileSync(join(source.dir, "src/lib/newMechanic.ts"), "export const enabled = true;\n");
    const targetRevision = commitAll(source.dir, "add new mechanic source");
    const manifest = writeManifest(source.baselineRevision, [ACTION_SLICE]);

    const report = runCli([
      "--source",
      source.dir,
      "--manifest",
      manifest,
      "--to",
      targetRevision,
      "--fail-on-drift",
    ]);

    assert.notEqual(report.status, 0, combined(report));
    assert.match(combined(report), /unclassified source changes/);
    assert.match(combined(report), /src\/lib\/newMechanic\.ts/);
  });

  it("passes strict mode when the target has no tracked source changes", () => {
    const source = initSourceRepo({ "src/lib/actions/rules.ts": "export const cost = 3;\n" });
    const manifest = writeManifest(source.baselineRevision, [ACTION_SLICE]);

    const report = runCli([
      "--source",
      source.dir,
      "--manifest",
      manifest,
      "--to",
      source.baselineRevision,
      "--fail-on-drift",
    ]);

    assert.equal(report.status, 0, combined(report));
    assert.match(combined(report), /no tracked source changes/);
  });
});
