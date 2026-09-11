#!/usr/bin/env node
/**
 * Bounded upstream mechanics drift scanner (Native#120 / Game#1724).
 *
 * The manifest declares the source roots Native watches and assigns the
 * important mechanics paths to Native consumers. The scanner compares two
 * immutable Git revisions, reports affected slices, and can fail a consumer
 * update gate when source drift is present or a changed path is unclassified.
 * It never executes source code and never contacts GitHub itself.
 *
 *   node scripts/mechanics-drift.mjs \
 *     --source <AHDGame-checkout> \
 *     --manifest docs/mechanics-drift-manifest.json \
 *     [--to <revision-or-ref>] [--fail-on-drift]
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SHA_RE = /^[0-9a-f]{40}$/;

const USAGE = `usage: node scripts/mechanics-drift.mjs --source <checkout> --manifest <path> [--to <ref>] [--fail-on-drift]

Compare the manifest's pinned AHDGame revision with a target Git revision.
The default target is HEAD. Without --fail-on-drift the command reports
affected slices for review; --fail-on-drift makes source changes gateable.
`;

class CliError extends Error {
  /**
   * @param {string} message
   * @param {number} code
   */
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

function fail(message, code = 1) {
  throw new CliError(message, code);
}

function usageError(message) {
  throw new CliError(`${message}\n${USAGE}`, 2);
}

function takeValue(flag, argv, index) {
  const value = argv[index];
  if (value === undefined || value === "" || value.startsWith("--")) {
    usageError(`missing value for ${flag}`);
  }
  return value;
}

function parseArgs(argv) {
  /** @type {{ source: string | undefined, manifest: string | undefined, target: string, failOnDrift: boolean, help: boolean }} */
  const flags = { source: undefined, manifest: undefined, target: "HEAD", failOnDrift: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") flags.help = true;
    else if (arg === "--source") flags.source = takeValue("--source", argv, ++i);
    else if (arg.startsWith("--source=")) flags.source = arg.slice("--source=".length);
    else if (arg === "--manifest") flags.manifest = takeValue("--manifest", argv, ++i);
    else if (arg.startsWith("--manifest=")) flags.manifest = arg.slice("--manifest=".length);
    else if (arg === "--to") flags.target = takeValue("--to", argv, ++i);
    else if (arg.startsWith("--to=")) flags.target = arg.slice("--to=".length);
    else if (arg === "--fail-on-drift") flags.failOnDrift = true;
    else usageError(`unknown argument: ${arg}`);
  }
  return flags;
}

function git(source, args) {
  return spawnSync("git", ["-C", source, ...args], {
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

function resolveSourceDir(input) {
  if (!input || input.includes("\0")) usageError("invalid --source");
  const source = resolve(input);
  if (!existsSync(source)) fail("--source is not a directory");
  const check = git(source, ["rev-parse", "--show-toplevel"]);
  if (check.status !== 0) fail("--source is not a Git checkout");
  return source;
}

function readManifest(input) {
  if (!input || input.includes("\0")) usageError("invalid --manifest");
  const path = isAbsolute(input) ? input : resolve(REPO_ROOT, input);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    fail("could not read --manifest as JSON");
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) fail("manifest must be an object");
  if (manifest.schemaVersion !== 1) fail("manifest schemaVersion must be 1");
  if (typeof manifest.repository !== "string" || manifest.repository.length === 0) {
    fail("manifest repository is required");
  }
  if (typeof manifest.baselineRevision !== "string" || !SHA_RE.test(manifest.baselineRevision)) {
    fail("manifest baselineRevision must be a full lowercase Git SHA");
  }
  if (!Array.isArray(manifest.trackedRoots) || manifest.trackedRoots.length === 0) {
    fail("manifest trackedRoots must be a non-empty array");
  }
  const trackedRoots = manifest.trackedRoots.map((root) => normalizeSourcePath(root, "tracked root"));
  if (!Array.isArray(manifest.slices) || manifest.slices.length === 0) fail("manifest slices must be a non-empty array");
  const ids = new Set();
  const slices = manifest.slices.map((slice) => {
    if (!slice || typeof slice !== "object" || Array.isArray(slice)) fail("manifest slice must be an object");
    if (typeof slice.id !== "string" || slice.id.length === 0 || ids.has(slice.id)) {
      fail("manifest slice ids must be unique non-empty strings");
    }
    ids.add(slice.id);
    if (typeof slice.description !== "string" || slice.description.length === 0) {
      fail(`manifest slice ${slice.id} description is required`);
    }
    if (!Array.isArray(slice.paths) || slice.paths.length === 0) fail(`manifest slice ${slice.id} paths are required`);
    const paths = slice.paths.map((path) => normalizeSourcePath(path, `slice ${slice.id} path`, true));
    if (!Array.isArray(slice.consumers) || slice.consumers.length === 0) {
      fail(`manifest slice ${slice.id} consumers are required`);
    }
    for (const path of paths) {
      const exactPath = path.endsWith("/") ? path.slice(0, -1) : path;
      if (!trackedRoots.some((root) => exactPath === root || exactPath.startsWith(`${root}/`))) {
        fail(`slice ${slice.id} path ${path} is outside trackedRoots`);
      }
    }
    return { id: slice.id, description: slice.description, paths, consumers: slice.consumers };
  });
  return { repository: manifest.repository, baselineRevision: manifest.baselineRevision, trackedRoots, slices };
}

function normalizeSourcePath(value, label, allowPrefix = false) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0") || value.includes("\\")) {
    fail(`${label} must be a relative POSIX path`);
  }
  const normalized = allowPrefix && value.endsWith("/") ? value.slice(0, -1) : value;
  if (
    isAbsolute(normalized) ||
    normalized.split("/").includes("..") ||
    normalized.split("/").includes(".") ||
    normalized.includes("//")
  ) {
    fail(`${label} must be a relative POSIX path`);
  }
  return allowPrefix && value.endsWith("/") ? `${normalized}/` : normalized;
}

function resolveRevision(source, revision, label) {
  const result = git(source, ["rev-parse", "--verify", "--end-of-options", `${revision}^{commit}`]);
  if (result.status !== 0) fail(`invalid ${label} revision ${revision}`);
  const resolved = String(result.stdout).trim();
  if (!SHA_RE.test(resolved)) fail(`invalid ${label} revision ${revision}`);
  return resolved;
}

function changedPaths(source, from, to, trackedRoots) {
  const result = git(source, [
    "diff",
    "--name-only",
    "-z",
    "--diff-filter=ACDMRTUXB",
    `${from}..${to}`,
    "--",
    ...trackedRoots,
  ]);
  if (result.status !== 0) fail(`could not compare ${from}..${to}: ${String(result.stderr).trim()}`);
  return String(result.stdout)
    .split("\0")
    .filter(Boolean)
    .sort();
}

function matches(path, pattern) {
  if (pattern.endsWith("/")) return path === pattern.slice(0, -1) || path.startsWith(pattern);
  return path === pattern;
}

function classify(paths, slices) {
  const classified = new Map(slices.map((slice) => [slice.id, []]));
  const unclassified = [];
  for (const path of paths) {
    const owners = slices.filter((slice) => slice.paths.some((pattern) => matches(path, pattern)));
    if (owners.length === 0) unclassified.push(path);
    else if (owners.length > 1) fail(`source path ${path} is assigned to multiple slices: ${owners.map((slice) => slice.id).join(", ")}`);
    else classified.get(owners[0].id).push(path);
  }
  return { classified, unclassified };
}

function printReport(manifest, from, to, paths, classified, unclassified) {
  process.stdout.write(`mechanics-drift: ${manifest.repository} ${from} -> ${to}\n`);
  if (paths.length === 0) {
    process.stdout.write("mechanics-drift: no tracked source changes\n");
    return;
  }
  for (const slice of manifest.slices) {
    const slicePaths = classified.get(slice.id);
    if (!slicePaths || slicePaths.length === 0) continue;
    process.stdout.write(`slice ${slice.id}: ${slice.description}\n`);
    for (const path of slicePaths) process.stdout.write(`  changed: ${path}\n`);
    process.stdout.write(`  consumers: ${slice.consumers.join(", ")}\n`);
  }
  if (unclassified.length > 0) {
    process.stdout.write("unclassified source changes:\n");
    for (const path of unclassified) process.stdout.write(`  changed: ${path}\n`);
  }
  process.stdout.write("mechanics-drift: report complete; use --fail-on-drift to gate consumer updates\n");
}

function main(argv) {
  const flags = parseArgs(argv);
  if (flags.help) {
    process.stdout.write(USAGE);
    return;
  }
  if (!flags.source) usageError("--source is required");
  if (!flags.manifest) usageError("--manifest is required");
  const source = resolveSourceDir(flags.source);
  const manifest = readManifest(flags.manifest);
  const from = resolveRevision(source, manifest.baselineRevision, "baseline");
  const to = resolveRevision(source, flags.target, "target");
  const paths = changedPaths(source, from, to, manifest.trackedRoots);
  const { classified, unclassified } = classify(paths, manifest.slices);
  printReport(manifest, from, to, paths, classified, unclassified);
  if (flags.failOnDrift && paths.length > 0) {
    const detail = unclassified.length > 0 ? "; unclassified paths require manifest ownership" : "";
    fail(`source drift detected${detail}`);
  }
}

try {
  main(process.argv.slice(2));
} catch (error) {
  const code = error instanceof CliError ? error.code : 1;
  process.stderr.write(`mechanics-drift: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = code;
}
