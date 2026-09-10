/**
 * Public CLI tests for scripts/shared-rules.mjs.
 *
 * Exercises generate/check/verify through the CLI against temporary git
 * fixtures. Does not reimplement the hasher or import walker.
 *
 * Run exactly:
 *   node --test scripts/shared-rules.test.mjs
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const CLI = join(REPO_ROOT, "scripts", "shared-rules.mjs");

const ROOT_ENTRY = "src/lib/actions/rules.ts";
const RULES_SOURCE = `import { statMultiplier } from "../stats/statMultiplier";
import { NEUTRAL_STAT } from "../stats/statsConstants";

export const FUNDRAISE_ACTION_COST = 3;

export function fundraiseYieldAnchor(fundraising = NEUTRAL_STAT): number {
  return Math.round(50_000 * statMultiplier(fundraising));
}
`;
const MULTIPLIER_SOURCE = `import { SLOPE } from "./statsConstants";

export function statMultiplier(stat: number): number {
  return 1 + stat * SLOPE;
}
`;
const CONSTANTS_SOURCE = `export const SLOPE = 0.04;
export const NEUTRAL_STAT = 5.5;
`;

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
  env.GIT_AUTHOR_NAME = "Rules Fixture";
  env.GIT_AUTHOR_EMAIL = "rules-fixture@example.com";
  env.GIT_COMMITTER_NAME = "Rules Fixture";
  env.GIT_COMMITTER_EMAIL = "rules-fixture@example.com";
  return env;
}

function runGit(cwd, args) {
  const run = spawnSync("git", args, { cwd, encoding: "utf8", env: gitEnv(), timeout: 15_000 });
  assert.equal(run.status, 0, `git ${args.join(" ")} failed: ${run.stderr}`);
  return run;
}

function writeTree(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
}

function initSourceRepo(files) {
  const dir = scratch("shared-rules-src-");
  runGit(dir, ["init", "-b", "main"]);
  runGit(dir, ["config", "user.name", "Rules Fixture"]);
  runGit(dir, ["config", "user.email", "rules-fixture@example.com"]);
  runGit(dir, ["config", "commit.gpgsign", "false"]);
  writeTree(dir, files);
  runGit(dir, ["add", "-A"]);
  runGit(dir, ["commit", "-m", "fixture"]);
  const sha = runGit(dir, ["rev-parse", "HEAD"]).stdout.trim();
  assert.match(sha, /^[0-9a-f]{40}$/);
  return { dir, sha };
}

function commitAll(dir, message) {
  runGit(dir, ["add", "-A"]);
  runGit(dir, ["commit", "-m", message]);
  return runGit(dir, ["rev-parse", "HEAD"]).stdout.trim();
}

function fundraiserFiles(overrides = {}) {
  return {
    "LICENSE.md": "Fixture license retained exactly.\n",
    [ROOT_ENTRY]: RULES_SOURCE,
    "src/lib/stats/statMultiplier.ts": MULTIPLIER_SOURCE,
    "src/lib/stats/statsConstants.ts": CONSTANTS_SOURCE,
    ...overrides,
  };
}

function runCli(args, cwd = REPO_ROOT) {
  const run = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 30_000,
    env: gitEnv(),
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

function combined(run) {
  return `${run.stdout}\n${run.stderr}`;
}

function assertNoPrivatePaths(text) {
  assert.doesNotMatch(text, /\/root\//);
  assert.doesNotMatch(text, /\/home\//);
  assert.doesNotMatch(text, /\/tmp\//);
}

describe("shared-rules CLI", () => {
  it("round-trips --update then --check for synthetic fundraiser rules", () => {
    const source = initSourceRepo(fundraiserFiles());
    const pkg = scratch("shared-rules-pkg-");
    const update = runCli([
      "--update",
      "--source",
      source.dir,
      "--revision",
      source.sha,
      "--package",
      pkg,
    ]);
    assert.equal(update.status, 0, combined(update));
    assertNoPrivatePaths(combined(update));

    const pkgJson = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"));
    assert.equal(pkgJson.name, "@ahd/game-rules");
    assert.equal(pkgJson.version, "0.1.0");
    assert.equal(pkgJson.exports["./actions"], "./actions/rules.ts");
    assert.equal(pkgJson.license, "PolyForm-Noncommercial-1.0.0");

    assert.equal(readFileSync(join(pkg, "actions/rules.ts"), "utf8"), RULES_SOURCE);
    assert.equal(readFileSync(join(pkg, "stats/statMultiplier.ts"), "utf8"), MULTIPLIER_SOURCE);
    assert.equal(readFileSync(join(pkg, "stats/statsConstants.ts"), "utf8"), CONSTANTS_SOURCE);

    const provenance = JSON.parse(readFileSync(join(pkg, "provenance.json"), "utf8"));
    assert.equal(provenance.repo, "Egg3901/AHDGame");
    assert.equal(provenance.revision, source.sha);
    assert.equal(provenance.rootEntry, ROOT_ENTRY);
    assert.match(String(provenance.scope), /fundraiser/i);
    assert.doesNotMatch(String(provenance.scope), /full mechanics coverage/i);
    assert.match(provenance.files["actions/rules.ts"], /^[0-9a-f]{64}$/);
    assert.match(provenance.files["stats/statMultiplier.ts"], /^[0-9a-f]{64}$/);
    assert.match(provenance.files["stats/statsConstants.ts"], /^[0-9a-f]{64}$/);
    assert.match(provenance.packageIdentityHash, /^[0-9a-f]{64}$/);
    assertNoPrivatePaths(JSON.stringify(provenance));

    const readme = readFileSync(join(pkg, "README.md"), "utf8");
    const license = readFileSync(join(pkg, "LICENSE.md"), "utf8");
    assert.match(readme, /PolyForm-Noncommercial-1\.0\.0/);
    assert.equal(license, "Fixture license retained exactly.\n");

    const check = runCli([
      "--check",
      "--source",
      source.dir,
      "--revision",
      source.sha,
      "--package",
      pkg,
    ]);
    assert.equal(check.status, 0, combined(check));
    assertNoPrivatePaths(combined(check));
  });

  it("rejects a tampered package on --check and --verify", () => {
    const source = initSourceRepo(fundraiserFiles());
    const pkg = scratch("shared-rules-pkg-");
    const update = runCli([
      "--update",
      "--source",
      source.dir,
      "--revision",
      source.sha,
      "--package",
      pkg,
    ]);
    assert.equal(update.status, 0, combined(update));

    writeFileSync(
      join(pkg, "actions/rules.ts"),
      RULES_SOURCE.replace("FUNDRAISE_ACTION_COST = 3", "FUNDRAISE_ACTION_COST = 99"),
    );

    const check = runCli([
      "--check",
      "--source",
      source.dir,
      "--revision",
      source.sha,
      "--package",
      pkg,
    ]);
    assert.notEqual(check.status, 0);
    assert.match(combined(check), /src\/lib\/actions\/rules\.ts/);
    assertNoPrivatePaths(combined(check));

    const verify = runCli(["--verify", "--package", pkg]);
    assert.notEqual(verify.status, 0);
    assertNoPrivatePaths(combined(verify));
  });

  it("fails --check when upstream fundraiser cost changes and names the source path", () => {
    const source = initSourceRepo(fundraiserFiles());
    const pkg = scratch("shared-rules-pkg-");
    const update = runCli([
      "--update",
      "--source",
      source.dir,
      "--revision",
      source.sha,
      "--package",
      pkg,
    ]);
    assert.equal(update.status, 0, combined(update));

    writeFileSync(
      join(source.dir, ROOT_ENTRY),
      RULES_SOURCE.replace("FUNDRAISE_ACTION_COST = 3", "FUNDRAISE_ACTION_COST = 4"),
    );
    const newSha = commitAll(source.dir, "change cost");

    const check = runCli([
      "--check",
      "--source",
      source.dir,
      "--revision",
      newSha,
      "--package",
      pkg,
    ]);
    assert.notEqual(check.status, 0);
    assert.match(combined(check), /src\/lib\/actions\/rules\.ts/);
    assertNoPrivatePaths(combined(check));
  });

  it("rejects a new relative import of a missing file", () => {
    const source = initSourceRepo(
      fundraiserFiles({
        [ROOT_ENTRY]: `import { missing } from "../stats/doesNotExist";\nexport const FUNDRAISE_ACTION_COST = 3;\n`,
      }),
    );
    const pkg = scratch("shared-rules-pkg-");
    const update = runCli([
      "--update",
      "--source",
      source.dir,
      "--revision",
      source.sha,
      "--package",
      pkg,
    ]);
    assert.notEqual(update.status, 0);
    assert.match(combined(update), /src\/lib\/stats\/doesNotExist/);
    assertNoPrivatePaths(combined(update));
  });

  it("fails --check when a new relative dependency appears and reports the new source path", () => {
    const source = initSourceRepo(fundraiserFiles());
    const pkg = scratch("shared-rules-pkg-");
    const update = runCli([
      "--update",
      "--source",
      source.dir,
      "--revision",
      source.sha,
      "--package",
      pkg,
    ]);
    assert.equal(update.status, 0, combined(update));

    writeFileSync(join(source.dir, "src/lib/stats/extra.ts"), "export const EXTRA = 1;\n");
    writeFileSync(
      join(source.dir, ROOT_ENTRY),
      `import { EXTRA } from "../stats/extra";\n${RULES_SOURCE}`,
    );
    const newSha = commitAll(source.dir, "add extra");

    const check = runCli([
      "--check",
      "--source",
      source.dir,
      "--revision",
      newSha,
      "--package",
      pkg,
    ]);
    assert.notEqual(check.status, 0);
    assert.match(combined(check), /src\/lib\/stats\/extra\.ts/);
    assertNoPrivatePaths(combined(check));
  });

  it("rejects an invalid revision", () => {
    const source = initSourceRepo(fundraiserFiles());
    const pkg = scratch("shared-rules-pkg-");
    const missing = "0".repeat(40);
    const update = runCli([
      "--update",
      "--source",
      source.dir,
      "--revision",
      missing,
      "--package",
      pkg,
    ]);
    assert.notEqual(update.status, 0);
    assert.match(combined(update), /revision/i);
    assertNoPrivatePaths(combined(update));
  });

  it("rejects a short or non-hex revision instead of sending it to a shell", () => {
    const source = initSourceRepo(fundraiserFiles());
    const pkg = scratch("shared-rules-pkg-");
    const shortRev = runCli([
      "--update",
      "--source",
      source.dir,
      "--revision",
      "abc123",
      "--package",
      pkg,
    ]);
    assert.notEqual(shortRev.status, 0);
    assert.match(combined(shortRev), /revision/i);

    const injected = runCli([
      "--update",
      "--source",
      source.dir,
      "--revision",
      "$(touch pwned);aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "--package",
      pkg,
    ]);
    assert.notEqual(injected.status, 0);
    assert.match(combined(injected), /revision/i);
  });

  it("rejects an escaping relative import path", () => {
    const source = initSourceRepo(
      fundraiserFiles({
        [ROOT_ENTRY]: `import { x } from "../../../../etc/passwd";\nexport const FUNDRAISE_ACTION_COST = 3;\n`,
      }),
    );
    const pkg = scratch("shared-rules-pkg-");
    const update = runCli([
      "--update",
      "--source",
      source.dir,
      "--revision",
      source.sha,
      "--package",
      pkg,
    ]);
    assert.notEqual(update.status, 0);
    assert.match(combined(update), /escape|outside|invalid path/i);
    assertNoPrivatePaths(combined(update));
  });

  it("rejects non-relative and runtime host imports", () => {
    const source = initSourceRepo(
      fundraiserFiles({
        [ROOT_ENTRY]: `import fs from "node:fs";\nexport const FUNDRAISE_ACTION_COST = 3;\n`,
      }),
    );
    const pkg = scratch("shared-rules-pkg-");
    const update = runCli([
      "--update",
      "--source",
      source.dir,
      "--revision",
      source.sha,
      "--package",
      pkg,
    ]);
    assert.notEqual(update.status, 0);
    assert.match(combined(update), /non-relative|host|node:fs/i);
    assertNoPrivatePaths(combined(update));
  });

  it("rejects dynamic import and require", () => {
    const dynamicSource = initSourceRepo(
      fundraiserFiles({
        [ROOT_ENTRY]: `export const FUNDRAISE_ACTION_COST = 3;\nexport async function load() { return import("../stats/statMultiplier"); }\n`,
      }),
    );
    const pkg = scratch("shared-rules-pkg-");
    const dynamic = runCli([
      "--update",
      "--source",
      dynamicSource.dir,
      "--revision",
      dynamicSource.sha,
      "--package",
      pkg,
    ]);
    assert.notEqual(dynamic.status, 0);
    assert.match(combined(dynamic), /dynamic import/i);

    const requireSource = initSourceRepo(
      fundraiserFiles({
        [ROOT_ENTRY]: `export const FUNDRAISE_ACTION_COST = 3;\nconst x = require("../stats/statMultiplier");\n`,
      }),
    );
    const required = runCli([
      "--update",
      "--source",
      requireSource.dir,
      "--revision",
      requireSource.sha,
      "--package",
      pkg,
    ]);
    assert.notEqual(required.status, 0);
    assert.match(combined(required), /require/i);
  });

  it("verifies checked-in hashes without a source checkout", () => {
    const source = initSourceRepo(fundraiserFiles());
    const pkg = scratch("shared-rules-pkg-");
    const update = runCli([
      "--update",
      "--source",
      source.dir,
      "--revision",
      source.sha,
      "--package",
      pkg,
    ]);
    assert.equal(update.status, 0, combined(update));

    const verify = runCli(["--verify", "--package", pkg]);
    assert.equal(verify.status, 0, combined(verify));
    assertNoPrivatePaths(combined(verify));
  });

  it("reports new transitive files on --update instead of silently refreshing", () => {
    const source = initSourceRepo(fundraiserFiles());
    const pkg = scratch("shared-rules-pkg-");
    const first = runCli([
      "--update",
      "--source",
      source.dir,
      "--revision",
      source.sha,
      "--package",
      pkg,
    ]);
    assert.equal(first.status, 0, combined(first));

    writeFileSync(join(source.dir, "src/lib/stats/extra.ts"), "export const EXTRA = 1;\n");
    writeFileSync(
      join(source.dir, ROOT_ENTRY),
      `import { EXTRA } from "../stats/extra";\n${RULES_SOURCE}`,
    );
    const newSha = commitAll(source.dir, "add extra");
    const second = runCli([
      "--update",
      "--source",
      source.dir,
      "--revision",
      newSha,
      "--package",
      pkg,
    ]);
    assert.equal(second.status, 0, combined(second));
    assert.match(combined(second), /src\/lib\/stats\/extra\.ts/);
    assert.equal(readFileSync(join(pkg, "stats/extra.ts"), "utf8"), "export const EXTRA = 1;\n");
    assertNoPrivatePaths(combined(second));
  });

  it("rejects unknown arguments and mixed modes", () => {
    const usage = runCli(["--help"]);
    assert.equal(usage.status, 0, combined(usage));
    assert.match(usage.stdout, /--update/);
    assert.match(usage.stdout, /--check/);
    assert.match(usage.stdout, /--verify/);

    const unknown = runCli(["--explode"]);
    assert.notEqual(unknown.status, 0);

    const mixed = runCli(["--update", "--verify"]);
    assert.notEqual(mixed.status, 0);
  });

  it("rejects an extra source file, executable package metadata and a forged file inventory", () => {
    const source = initSourceRepo(fundraiserFiles());
    const pkg = scratch("shared-rules-pkg-");
    const sourceArgs = ["--source", source.dir, "--revision", source.sha, "--package", pkg];
    for (const mutate of [
      () => writeFileSync(join(pkg, "actions/extra.ts"), "export const extra = 1;\n"),
      () => {
        const file = join(pkg, "package.json");
        const metadata = JSON.parse(readFileSync(file, "utf8"));
        metadata.scripts = { postinstall: "echo unexpected" };
        writeFileSync(file, JSON.stringify(metadata));
      },
      () => {
        const file = join(pkg, "provenance.json");
        const metadata = JSON.parse(readFileSync(file, "utf8"));
        delete metadata.files["actions/rules.ts"];
        writeFileSync(file, JSON.stringify(metadata));
      },
    ]) {
      assert.equal(runCli(["--update", ...sourceArgs]).status, 0);
      mutate();
      assert.notEqual(runCli(["--verify", "--package", pkg]).status, 0);
      assert.notEqual(runCli(["--check", ...sourceArgs]).status, 0);
    }
  });

  it("rejects import-equals host requires before writing an artifact", () => {
    const source = initSourceRepo(fundraiserFiles({
      [ROOT_ENTRY]: 'import db = require("mongodb");\nexport const cost = 3;\n',
    }));
    const pkg = scratch("shared-rules-pkg-");
    const result = runCli(["--update", "--source", source.dir, "--revision", source.sha, "--package", pkg]);
    assert.notEqual(result.status, 0);
    assert.match(combined(result), /require is unsupported/);
  });


  it("refuses to overwrite an unrelated destination", () => {
    const source = initSourceRepo(fundraiserFiles());
    const pkg = scratch("shared-rules-pkg-");
    writeFileSync(join(pkg, "unrelated.ts"), "keep this file");
    const result = runCli(["--update", "--source", source.dir, "--revision", source.sha, "--package", pkg]);
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(join(pkg, "unrelated.ts"), "utf8"), "keep this file");
  });

});
