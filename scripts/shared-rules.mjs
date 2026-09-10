#!/usr/bin/env node
/**
 * Bounded @ahd/game-rules export and drift check (Native#120 / Game#1724).
 *
 * Generates the fundraiser action-rules package from an exact AHDGame commit
 * and checks that the checked-in package still matches. This is not a full
 * mechanics export. Full-source scan and bot update PRs remain Native#120.
 *
 *   node scripts/shared-rules.mjs --update --source <checkout> --revision <40sha>
 *   node scripts/shared-rules.mjs --check  --source <checkout> --revision <40sha>
 *   node scripts/shared-rules.mjs --verify
 *
 * Reads source only via git cat-file (no source execution). Git is invoked
 * with argument arrays, never a shell.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import posix from "node:path/posix";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, "..");
const DEFAULT_PACKAGE = join(REPO_ROOT, "packages", "game-rules");
const SOURCE_REPO = "Egg3901/AHDGame";
const ROOT_ENTRY = "src/lib/actions/rules.ts";
const SOURCE_PREFIX = "src/lib/";
const LICENSE_PATH = "LICENSE.md";
const PACKAGE_NAME = "@ahd/game-rules";
const PACKAGE_VERSION = "0.1.0";
const SPDX = "PolyForm-Noncommercial-1.0.0";
const SCOPE = "fundraiser action rules only";
const SHA_RE = /^[0-9a-f]{40}$/;
const GIT_PATH_RE = /^src\/lib\/[A-Za-z0-9][A-Za-z0-9._/-]*\.ts$/;
const PACKAGE_REL_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]*\.ts$/;
const PACKAGE_KEYS = new Set(["name", "version", "private", "license", "type", "exports"]);

const USAGE = `usage: node scripts/shared-rules.mjs --update --source <checkout> --revision <40sha> [--package <dir>]
       node scripts/shared-rules.mjs --check  --source <checkout> --revision <40sha> [--package <dir>]
       node scripts/shared-rules.mjs --verify [--package <dir>]

Generate or check the bounded @ahd/game-rules fundraiser package from an exact
AHDGame commit. Does not publish, open PRs, or claim complete mechanics coverage.

  --update     write packages/game-rules from git show of --revision
  --check      compare the package to source at --revision and fail on drift
  --verify     check checked-in files against provenance hashes (no checkout)
  --source     AHDGame git checkout (required for --update and --check)
  --revision   exact 40-character lowercase commit SHA
  --package    output package directory (default: packages/game-rules)
  --help, -h   print this usage
`;

class CliError extends Error {
  /**
   * @param {string} message
   * @param {number} code
   */
  constructor(message, code) {
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

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

function loadTypescript() {
  const require = createRequire(import.meta.url);
  try {
    return require("typescript");
  } catch {
    try {
      return require(join(REPO_ROOT, "node_modules", "typescript"));
    } catch {
      fail("typescript parser is not installed");
    }
  }
}

/**
 * @param {string[]} argv
 */
function takeValue(flag, argv, index) {
  const next = argv[index];
  if (next === undefined || next.startsWith("--") || next === "") {
    usageError(`missing value for ${flag}`);
  }
  return next;
}

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  /** @type {{ update: boolean, check: boolean, verify: boolean, help: boolean, source: string | undefined, revision: string | undefined, packageDir: string | undefined }} */
  const flags = {
    update: false,
    check: false,
    verify: false,
    help: false,
    source: undefined,
    revision: undefined,
    packageDir: undefined,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      flags.help = true;
    } else if (arg === "--update") {
      flags.update = true;
    } else if (arg === "--check") {
      flags.check = true;
    } else if (arg === "--verify") {
      flags.verify = true;
    } else if (arg === "--source" || arg.startsWith("--source=")) {
      flags.source = arg === "--source" ? takeValue("--source", argv, (i += 1)) : arg.slice("--source=".length);
      if (!flags.source) usageError("missing value for --source");
    } else if (arg === "--revision" || arg.startsWith("--revision=")) {
      flags.revision =
        arg === "--revision" ? takeValue("--revision", argv, (i += 1)) : arg.slice("--revision=".length);
      if (!flags.revision) usageError("missing value for --revision");
    } else if (arg === "--package" || arg.startsWith("--package=")) {
      flags.packageDir =
        arg === "--package" ? takeValue("--package", argv, (i += 1)) : arg.slice("--package=".length);
      if (!flags.packageDir) usageError("missing value for --package");
    } else {
      usageError(`unknown argument: ${arg}`);
    }
  }
  return flags;
}

function isSafeGitPath(gitPath) {
  if (typeof gitPath !== "string") return false;
  if (gitPath.includes("\0") || gitPath.includes("\\") || gitPath.includes(":")) return false;
  if (gitPath.includes("//") || gitPath.startsWith("/") || gitPath.includes("/./")) return false;
  if (gitPath.split("/").includes("..") || gitPath.split("/").includes(".")) return false;
  return GIT_PATH_RE.test(gitPath);
}

function isSafePackageRel(rel) {
  if (typeof rel !== "string") return false;
  if (rel === LICENSE_PATH) return true;
  if (rel.includes("\0") || rel.includes("\\") || rel.includes(":")) return false;
  if (rel.includes("//") || rel.startsWith("/") || rel.split("/").includes("..") || rel.split("/").includes(".")) {
    return false;
  }
  return PACKAGE_REL_RE.test(rel);
}

function toPackageRel(sourcePath) {
  if (!sourcePath.startsWith(SOURCE_PREFIX)) fail(`invalid path ${sourcePath}`);
  const rel = sourcePath.slice(SOURCE_PREFIX.length);
  if (!isSafePackageRel(rel)) fail(`invalid path ${sourcePath}`);
  return rel;
}

function toSourcePath(packageRel) {
  if (packageRel === LICENSE_PATH) return LICENSE_PATH;
  return `${SOURCE_PREFIX}${packageRel}`;
}

function resolveImport(fromSourcePath, specifier) {
  if (typeof specifier !== "string" || specifier.includes("\0") || specifier.includes("\\")) {
    fail("invalid path");
  }
  if (!(specifier.startsWith("./") || specifier.startsWith("../"))) {
    fail(`non-relative host import: ${specifier}`);
  }
  const fromDir = posix.dirname(fromSourcePath);
  let resolved = posix.normalize(posix.join(fromDir, specifier));
  if (resolved.endsWith(".js")) resolved = `${resolved.slice(0, -3)}.ts`;
  else if (!resolved.endsWith(".ts") && !resolved.endsWith(".tsx")) resolved = `${resolved}.ts`;
  if (!resolved.startsWith(SOURCE_PREFIX) || resolved.split("/").includes("..")) {
    fail("invalid path: import escapes src/lib");
  }
  if (!isSafeGitPath(resolved)) fail(`invalid path ${resolved}`);
  return resolved;
}

/**
 * @param {import("typescript")} ts
 * @param {string} fileName
 * @param {string} text
 */
function parseDeps(ts, fileName, text) {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  /** @type {string[]} */
  const specifiers = [];
  /** @type {"import" | "require" | null} */
  let dynamicKind = null;
  /**
   * @param {import("typescript").Node} node
   */
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        specifiers.push(node.moduleSpecifier.text);
      }
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      fail(`require is unsupported in ${fileName}`);
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) dynamicKind = dynamicKind ?? "import";
      else if (ts.isIdentifier(node.expression) && node.expression.text === "require") {
        dynamicKind = dynamicKind ?? "require";
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return { specifiers, dynamicKind };
}

/**
 * @param {string} source
 * @param {string[]} args
 * @param {"utf8" | "buffer"} encoding
 */
function git(source, args, encoding = "utf8") {
  return spawnSync("git", ["-C", source, ...args], {
    encoding,
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

function resolveExistingDir(input, flag) {
  if (!input || input.includes("\0")) usageError(`invalid ${flag}`);
  const abs = resolve(input);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) fail(`${flag} is not a directory`);
  return abs;
}

function assertCommit(source, revision) {
  if (typeof revision !== "string" || !SHA_RE.test(revision)) {
    fail("revision must be a 40-character lowercase hex SHA");
  }
  const run = git(source, ["rev-parse", "--verify", "--end-of-options", `${revision}^{commit}`], "utf8");
  if (run.status !== 0) fail("invalid revision");
  const resolved = String(run.stdout).trim();
  if (!SHA_RE.test(resolved) || resolved !== revision) {
    fail("revision must be a 40-character lowercase hex SHA");
  }
}

function gitBlob(source, revision, gitPath) {
  if (!isSafeGitPath(gitPath)) fail(`invalid path ${gitPath}`);
  const run = git(source, ["cat-file", "-p", `${revision}:${gitPath}`], "buffer");
  if (run.status !== 0) fail(`missing dependency ${gitPath}`);
  return run.stdout;
}

function gitLicense(source, revision) {
  const run = git(source, ["cat-file", "-p", `${revision}:${LICENSE_PATH}`], "buffer");
  if (run.status !== 0) fail(`missing ${LICENSE_PATH}`);
  return run.stdout;
}

function identityHash(repo, revision, rootEntry, files) {
  const lines = [
    "v1",
    `repo=${repo}`,
    `revision=${revision}`,
    `rootEntry=${rootEntry}`,
    ...Object.keys(files)
      .sort()
      .map((path) => `${path} ${files[path]}`),
  ];
  return sha256(`${lines.join("\n")}\n`);
}

function packageJsonText() {
  return `${JSON.stringify(
    {
      name: PACKAGE_NAME,
      version: PACKAGE_VERSION,
      private: true,
      license: SPDX,
      type: "module",
      exports: {
        "./actions": "./actions/rules.ts",
      },
    },
    null,
    2,
  )}\n`;
}

function readmeText() {
  return `# @ahd/game-rules

Generated fundraiser action rules package for A House Divided.

Consumable as \`${PACKAGE_NAME}\`:

\`\`\`ts
import { FUNDRAISE_ACTION_COST } from "@ahd/game-rules/actions";
\`\`\`

This is the fundraiser slice only. It is generated from Egg3901/AHDGame at the
exact revision recorded in \`provenance.json\`. Do not edit these files by hand
and do not treat this package as a complete mechanics export.

Refresh from a local AHDGame checkout:

\`\`\`
node scripts/shared-rules.mjs --update --source <AHDGame-checkout> --revision <40-character-sha>
node scripts/shared-rules.mjs --check  --source <AHDGame-checkout> --revision <40-character-sha>
node scripts/shared-rules.mjs --verify
\`\`\`

License: ${SPDX}
`;
}

function packageShapeProblems(pkg, kind) {
  /** @type {string[]} */
  const problems = [];
  if (!pkg || typeof pkg !== "object" || Array.isArray(pkg)) {
    problems.push("missing package.json");
    return problems;
  }
  for (const key of Object.keys(pkg)) {
    if (!PACKAGE_KEYS.has(key)) problems.push(`package.json extra field ${key}`);
  }
  if (pkg.name !== PACKAGE_NAME) problems.push(`package name ${kind}`);
  if (pkg.version !== PACKAGE_VERSION) problems.push(`package version ${kind}`);
  if (pkg.private !== true) problems.push(`package private ${kind}`);
  if (pkg.type !== "module") problems.push(`package type ${kind}`);
  if (pkg.license !== SPDX) problems.push(`package license ${kind}`);
  if (!pkg.exports || typeof pkg.exports !== "object" || Array.isArray(pkg.exports)) {
    problems.push(`package exports ${kind}`);
  } else {
    const exportKeys = Object.keys(pkg.exports);
    if (exportKeys.length !== 1 || pkg.exports["./actions"] !== "./actions/rules.ts") {
      problems.push(`package exports ${kind}`);
    }
  }
  return problems;
}

/**
 * @param {import("typescript")} ts
 * @param {string} source
 * @param {string} revision
 */
function collectSourceFiles(ts, source, revision) {
  /** @type {Map<string, Buffer>} */
  const files = new Map();
  const queue = [ROOT_ENTRY];
  const seen = new Set();
  while (queue.length > 0) {
    const gitPath = queue.shift();
    if (seen.has(gitPath)) continue;
    seen.add(gitPath);
    const buf = gitBlob(source, revision, gitPath);
    files.set(gitPath, buf);
    const { specifiers, dynamicKind } = parseDeps(ts, gitPath, buf.toString("utf8"));
    if (dynamicKind === "import") fail(`dynamic import is unsupported in ${gitPath}`);
    if (dynamicKind === "require") fail(`require is unsupported in ${gitPath}`);
    for (const specifier of specifiers) {
      queue.push(resolveImport(gitPath, specifier));
    }
  }
  return files;
}

function buildProvenance(revision, sourceFiles, licenseBuf) {
  /** @type {Record<string, string>} */
  const files = {};
  for (const sourcePath of [...sourceFiles.keys()].sort()) {
    files[toPackageRel(sourcePath)] = sha256(sourceFiles.get(sourcePath));
  }
  files[LICENSE_PATH] = sha256(licenseBuf);
  const packageIdentityHash = identityHash(SOURCE_REPO, revision, ROOT_ENTRY, files);
  return {
    repo: SOURCE_REPO,
    revision,
    rootEntry: ROOT_ENTRY,
    scope: SCOPE,
    files,
    packageIdentityHash,
  };
}

function provenanceText(provenance) {
  return `${JSON.stringify(provenance, null, 2)}\n`;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function assertInside(root, target) {
  const rel = relative(root, target);
  if (rel.startsWith("..") || isAbsolute(rel)) fail("invalid path");
}

function listGeneratedTs(packageDir) {
  /** @type {string[]} */
  const out = [];
  if (!existsSync(packageDir)) return out;
  /**
   * @param {string} dir
   */
  function walk(dir) {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "node_modules") continue;
        walk(full);
      } else if (ent.isFile() && ent.name.endsWith(".ts")) {
        out.push(full);
      }
    }
  }
  walk(packageDir);
  return out;
}

function unrecordedTs(packageDir, files) {
  const intended = new Set(Object.keys(files).filter((rel) => rel.endsWith(".ts")));
  /** @type {string[]} */
  const extra = [];
  for (const full of listGeneratedTs(packageDir)) {
    const rel = relative(packageDir, full).split(sep).join("/");
    if (!intended.has(rel)) extra.push(rel);
  }
  return extra;
}

function writePackage(packageDir, revision, sourceFiles, provenance, licenseBuf) {
  if (existsSync(packageDir) && readdirSync(packageDir).length > 0 &&
      readJson(join(packageDir, "package.json"))?.name !== PACKAGE_NAME) {
    fail("refusing to overwrite an unrelated destination");
  }
  mkdirSync(packageDir, { recursive: true });
  const intended = new Set(Object.keys(provenance.files));
  for (const full of listGeneratedTs(packageDir)) {
    const rel = relative(packageDir, full).split(sep).join("/");
    if (!intended.has(rel)) rmSync(full);
  }
  writeFileSync(join(packageDir, "package.json"), packageJsonText());
  writeFileSync(join(packageDir, "README.md"), readmeText());
  writeFileSync(join(packageDir, LICENSE_PATH), licenseBuf);
  writeFileSync(join(packageDir, "provenance.json"), provenanceText(provenance));
  for (const [sourcePath, buf] of sourceFiles) {
    const rel = toPackageRel(sourcePath);
    const full = join(packageDir, rel);
    assertInside(packageDir, full);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, buf);
  }
}

/**
 * @param {Record<string, string> | null} previousFiles
 * @param {Record<string, string>} nextFiles
 */
function describeChanges(previousFiles, nextFiles) {
  /** @type {string[]} */
  const changed = [];
  /** @type {string[]} */
  const added = [];
  /** @type {string[]} */
  const removed = [];
  const prev = previousFiles ?? {};
  for (const rel of Object.keys(nextFiles).sort()) {
    const sourcePath = toSourcePath(rel);
    if (!(rel in prev)) added.push(sourcePath);
    else if (prev[rel] !== nextFiles[rel]) changed.push(sourcePath);
  }
  for (const rel of Object.keys(prev).sort()) {
    if (!(rel in nextFiles)) removed.push(toSourcePath(rel));
  }
  return { changed, added, removed };
}

function printChangeReport(changes) {
  for (const path of changes.added) process.stdout.write(`new transitive file: ${path}\n`);
  for (const path of changes.changed) process.stdout.write(`changed source path: ${path}\n`);
  for (const path of changes.removed) process.stdout.write(`removed source path: ${path}\n`);
}

function runUpdate(source, revision, packageDir, ts) {
  const previous = readJson(join(packageDir, "provenance.json"));
  const sourceFiles = collectSourceFiles(ts, source, revision);
  const licenseBuf = gitLicense(source, revision);
  const provenance = buildProvenance(revision, sourceFiles, licenseBuf);
  writePackage(packageDir, revision, sourceFiles, provenance, licenseBuf);
  const previousFiles = previous && previous.files && typeof previous.files === "object" ? previous.files : null;
  const changes = describeChanges(previousFiles, provenance.files);
  process.stdout.write(
    `shared-rules: wrote ${PACKAGE_NAME} (${sourceFiles.size} source files, revision ${revision})\n`,
  );
  printChangeReport(changes);
}

function runCheck(source, revision, packageDir, ts) {
  const sourceFiles = collectSourceFiles(ts, source, revision);
  const licenseBuf = gitLicense(source, revision);
  const expected = buildProvenance(revision, sourceFiles, licenseBuf);
  /** @type {string[]} */
  const problems = [];
  const diskProv = readJson(join(packageDir, "provenance.json"));
  const diskFiles = diskProv && diskProv.files && typeof diskProv.files === "object" ? diskProv.files : {};

  const rootRel = toPackageRel(ROOT_ENTRY);
  const rootFull = join(packageDir, rootRel);
  assertInside(packageDir, rootFull);
  if (!existsSync(rootFull)) problems.push("missing root entry");

  for (const [sourcePath, buf] of sourceFiles) {
    const rel = toPackageRel(sourcePath);
    const full = join(packageDir, rel);
    if (!existsSync(full)) {
      if (!(rel in diskFiles)) problems.push(`new transitive file ${sourcePath}`);
      else problems.push(`changed source path ${sourcePath}`);
      continue;
    }
    const onDisk = readFileSync(full);
    if (Buffer.compare(onDisk, buf) !== 0) problems.push(`changed source path ${sourcePath}`);
  }

  const licenseFull = join(packageDir, LICENSE_PATH);
  if (!existsSync(licenseFull) || Buffer.compare(readFileSync(licenseFull), licenseBuf) !== 0) {
    problems.push(`changed source path ${LICENSE_PATH}`);
  }

  for (const rel of Object.keys(diskFiles).sort()) {
    if (!isSafePackageRel(rel)) {
      problems.push("invalid path in provenance");
      continue;
    }
    if (rel === LICENSE_PATH) {
      if (diskFiles[rel] !== expected.files[rel]) problems.push(`changed source path ${LICENSE_PATH}`);
      continue;
    }
    const sourcePath = toSourcePath(rel);
    if (!sourceFiles.has(sourcePath)) problems.push(`removed source path ${sourcePath}`);
    else if (diskFiles[rel] !== expected.files[rel]) problems.push(`changed source path ${sourcePath}`);
  }

  for (const rel of Object.keys(expected.files).sort()) {
    if (rel in diskFiles) continue;
    if (rel === LICENSE_PATH) problems.push(`changed source path ${LICENSE_PATH}`);
    else problems.push(`new transitive file ${toSourcePath(rel)}`);
  }

  for (const rel of unrecordedTs(packageDir, expected.files)) {
    problems.push(`unrecorded package file ${rel}`);
  }

  if (!diskProv) problems.push("missing provenance.json");
  else {
    if (diskProv.repo !== SOURCE_REPO) problems.push("repo drift");
    if (diskProv.revision !== revision) problems.push(`revision drift ${diskProv.revision} -> ${revision}`);
    if (diskProv.rootEntry !== expected.rootEntry) problems.push("rootEntry drift");
    if (diskProv.scope !== expected.scope) problems.push("scope drift");
    if (diskProv.packageIdentityHash !== expected.packageIdentityHash) {
      problems.push("package identity hash drift");
    }
  }

  problems.push(...packageShapeProblems(readJson(join(packageDir, "package.json")), "drift"));

  if (problems.length > 0) fail(problems.join("\n"));
  process.stdout.write(`shared-rules: check ok (${sourceFiles.size} source files, revision ${revision})\n`);
}

function runVerify(packageDir) {
  const provenancePath = join(packageDir, "provenance.json");
  if (!existsSync(provenancePath)) fail("missing provenance.json");
  const provenance = readJson(provenancePath);
  if (!provenance || typeof provenance !== "object") fail("invalid provenance.json");
  if (provenance.repo !== SOURCE_REPO) fail("repo mismatch");
  if (typeof provenance.revision !== "string" || !SHA_RE.test(provenance.revision)) fail("invalid revision");
  if (provenance.rootEntry !== ROOT_ENTRY) fail("rootEntry mismatch");
  if (provenance.scope !== SCOPE) fail("scope mismatch");
  if (!provenance.files || typeof provenance.files !== "object") fail("missing provenance files");
  if (typeof provenance.packageIdentityHash !== "string" || !/^[0-9a-f]{64}$/.test(provenance.packageIdentityHash)) {
    fail("invalid package identity hash");
  }

  const rootRel = toPackageRel(ROOT_ENTRY);
  if (!(rootRel in provenance.files)) fail("rootEntry missing from provenance files");
  const rootFull = join(packageDir, rootRel);
  assertInside(packageDir, rootFull);
  if (!existsSync(rootFull)) fail("missing root entry");
  if (!(LICENSE_PATH in provenance.files)) fail(`missing ${LICENSE_PATH} provenance`);

  for (const [rel, expectedHash] of Object.entries(provenance.files)) {
    if (!isSafePackageRel(rel)) fail("invalid path in provenance");
    if (typeof expectedHash !== "string" || !/^[0-9a-f]{64}$/.test(expectedHash)) {
      fail(`invalid file hash for ${rel}`);
    }
    const full = join(packageDir, rel);
    assertInside(packageDir, full);
    if (!existsSync(full)) fail(`missing package file ${rel}`);
    const actual = sha256(readFileSync(full));
    if (actual !== expectedHash) fail(`hash mismatch for ${rel} (${toSourcePath(rel)})`);
  }

  for (const rel of unrecordedTs(packageDir, provenance.files)) {
    fail(`unrecorded package file ${rel}`);
  }

  const generatedIdentity = identityHash(SOURCE_REPO, provenance.revision, ROOT_ENTRY, provenance.files);
  if (generatedIdentity !== provenance.packageIdentityHash) fail("package identity hash mismatch");

  const shape = packageShapeProblems(readJson(join(packageDir, "package.json")), "mismatch");
  if (shape.length > 0) fail(shape.join("\n"));

  process.stdout.write(`shared-rules: verify ok (${Object.keys(provenance.files).length} files)\n`);
}

function main(argv) {
  const flags = parseArgs(argv);
  if (flags.help) {
    process.stdout.write(USAGE);
    return;
  }
  const modeCount = Number(flags.update) + Number(flags.check) + Number(flags.verify);
  if (modeCount !== 1) usageError("exactly one of --update, --check, or --verify is required");

  const packageDir = flags.packageDir ? resolve(flags.packageDir) : DEFAULT_PACKAGE;

  if (flags.verify) {
    if (flags.source !== undefined || flags.revision !== undefined) {
      usageError("--verify does not take --source or --revision");
    }
    runVerify(packageDir);
    return;
  }

  if (flags.source === undefined || flags.revision === undefined) {
    usageError(`${flags.update ? "--update" : "--check"} requires --source and --revision`);
  }
  if (!SHA_RE.test(flags.revision)) fail("revision must be a 40-character lowercase hex SHA");
  const source = resolveExistingDir(flags.source, "--source");
  assertCommit(source, flags.revision);
  const ts = loadTypescript();
  if (flags.update) runUpdate(source, flags.revision, packageDir, ts);
  else runCheck(source, flags.revision, packageDir, ts);
}

try {
  main(process.argv.slice(2));
} catch (err) {
  if (err instanceof CliError) {
    process.stderr.write(`shared-rules: ${err.message}\n`);
    process.exit(err.code);
  }
  process.stderr.write(`shared-rules: ${err instanceof Error ? err.message : "unknown error"}\n`);
  process.exit(1);
}
