#!/usr/bin/env node
/**
 * Deterministic Android 16 KB alignment guard (issue #126).
 *
 * Checks every packaged ARM64 shared library for 16 KB ELF LOAD alignment
 * in pure Node (no NDK/SDK required) and, when `zipalign` is available,
 * validates APK packaging with `zipalign -c -P 16 4`.
 *
 * Usage:
 *   node scripts/verify-android-alignment.mjs --lib-dir <dir> [--lib <file> ...] [--apk <file>] [--zipalign <path>]
 *
 * Exit codes:
 *   0  all requested checks passed
 *   1  misalignment, unreadable input, or missing input
 *   2  incomplete: --apk given but no zipalign binary found (ELF checks passed)
 *
 * Run exactly:
 *   node scripts/verify-android-alignment.mjs --lib-dir src-tauri/gen/android --apk <apk>
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

export const PAGE_SIZE_16K = 16384;
const PT_LOAD = 1;

function fail(label, reasons, detail) {
  reasons.push(`${label}: ${detail}`);
}

function readHeader(buffer, label, reasons) {
  if (buffer.length < 64) {
    fail(label, reasons, `too small to be an ELF object (${buffer.length} bytes)`);
    return null;
  }
  if (
    buffer[0] !== 0x7f ||
    buffer[1] !== 0x45 ||
    buffer[2] !== 0x4c ||
    buffer[3] !== 0x46
  ) {
    fail(label, reasons, "missing ELF magic");
    return null;
  }
  const elfClass = buffer[4];
  const elfData = buffer[5];
  if (elfData !== 1) {
    fail(label, reasons, `unsupported ELF data encoding ${elfData} (need little-endian)`);
    return null;
  }
  if (elfClass === 2) {
    return {
      bits: 64,
      phoff: Number(buffer.readBigUInt64LE(0x20)),
      phentsize: buffer.readUInt16LE(0x36),
      phnum: buffer.readUInt16LE(0x38),
      entrySize: 56,
    };
  }
  if (elfClass === 1) {
    return {
      bits: 32,
      phoff: buffer.readUInt32LE(0x1c),
      phentsize: buffer.readUInt16LE(0x2a),
      phnum: buffer.readUInt16LE(0x2c),
      entrySize: 32,
    };
  }
  fail(label, reasons, `unsupported ELF class ${elfClass}`);
  return null;
}

function readSegment(buffer, header, index, label, reasons) {
  const base = header.phoff + index * header.phentsize;
  const need = base + header.entrySize;
  if (base < 0 || need > buffer.length) {
    fail(label, reasons, `program header ${index} out of bounds`);
    return null;
  }
  if (header.bits === 64) {
    return {
      type: buffer.readUInt32LE(base),
      filesz: buffer.readBigUInt64LE(base + 32),
      align: buffer.readBigUInt64LE(base + 48),
    };
  }
  return {
    type: buffer.readUInt32LE(base),
    filesz: BigInt(buffer.readUInt32LE(base + 16)),
    align: BigInt(buffer.readUInt32LE(base + 28)),
  };
}

/** Parse one in-memory ELF image; returns { ok, reasons }. */
export function checkElfAlignment(buffer, label) {
  const reasons = [];
  const header = readHeader(buffer, label, reasons);
  if (header === null) return { ok: false, reasons };
  if (header.phentsize < header.entrySize) {
    fail(label, reasons, `program header entry size ${header.phentsize} too small`);
    return { ok: false, reasons };
  }
  if (header.phnum === 0 || header.phnum > 100) {
    fail(label, reasons, `implausible program header count ${header.phnum}`);
    return { ok: false, reasons };
  }
  const page = BigInt(PAGE_SIZE_16K);
  let loadCount = 0;
  for (let i = 0; i < header.phnum; i += 1) {
    const seg = readSegment(buffer, header, i, label, reasons);
    if (seg === null) return { ok: false, reasons };
    if (seg.type !== PT_LOAD || seg.filesz === 0n) continue;
    loadCount += 1;
    if (seg.align < page || seg.align % page !== 0n) {
      fail(
        label,
        reasons,
        `LOAD segment ${i} alignment 0x${seg.align.toString(16)} is not 16 KB aligned`,
      );
    }
  }
  if (loadCount === 0) {
    fail(label, reasons, "no loadable (filesz > 0) LOAD segments");
  }
  return { ok: reasons.length === 0, reasons };
}

/** Check one .so file on disk; returns reasons (empty when aligned). */
export function checkLibraryFile(path) {
  let buffer;
  try {
    buffer = readFileSync(path);
  } catch (error) {
    return [`${path}: unreadable (${error.message})`];
  }
  return checkElfAlignment(buffer, path).reasons;
}

/** Recursively collect *.so files under dir (sorted for stable output). */
export function collectSoFiles(dir) {
  const found = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".so")) {
        found.push(full);
      }
    }
  };
  walk(dir);
  found.sort();
  return found;
}

/** Locate a zipalign binary: explicit path, ANDROID_HOME build-tools, or PATH. */
export function findZipalign(explicit) {
  const candidates = [];
  if (explicit) candidates.push(explicit);
  const androidHome = process.env.ANDROID_HOME;
  if (androidHome) {
    try {
      for (const entry of readdirSync(join(androidHome, "build-tools"))) {
        candidates.push(join(androidHome, "build-tools", entry, "zipalign"));
      }
    } catch {
      // No build-tools directory; fall through to PATH lookup.
    }
  }
  candidates.push("zipalign");
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["-h"], { stdio: "ignore" });
      return candidate;
    } catch {
      // Not usable; try the next candidate.
    }
  }
  return null;
}

function parseArgs(argv) {
  const args = { libDirs: [], libs: [], apk: null, zipalign: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--lib-dir") args.libDirs.push(argv[(i += 1)]);
    else if (arg === "--lib") args.libs.push(argv[(i += 1)]);
    else if (arg === "--apk") args.apk = argv[(i += 1)];
    else if (arg === "--zipalign") args.zipalign = argv[(i += 1)];
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!args.apk && args.libDirs.length === 0 && args.libs.length === 0) {
    throw new Error("give at least one of --lib-dir, --lib, or --apk");
  }
  return args;
}

function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(`usage: node scripts/verify-android-alignment.mjs --lib-dir <dir> [--lib <file> ...] [--apk <file>] [--zipalign <path>]\n${error.message}`);
    return 1;
  }
  const failures = [];
  const libs = [...args.libs];
  for (const dir of args.libDirs) {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      console.error(`missing library directory: ${dir}`);
      return 1;
    }
    libs.push(...collectSoFiles(dir));
  }
  for (const lib of args.libs) {
    if (!existsSync(lib) || !statSync(lib).isFile()) {
      console.error(`missing library file: ${lib}`);
      return 1;
    }
  }
  if (args.libDirs.length > 0 && libs.length === 0) {
    console.error(`no .so files found under: ${args.libDirs.join(", ")}`);
    return 1;
  }
  for (const lib of libs) {
    failures.push(...checkLibraryFile(lib));
  }
  if (failures.length > 0) {
    for (const failure of failures) console.error(failure);
    return 1;
  }
  for (const lib of libs) console.log(`aligned: ${lib}`);
  if (args.apk) {
    if (!existsSync(args.apk) || !statSync(args.apk).isFile()) {
      console.error(`missing APK file: ${args.apk}`);
      return 1;
    }
    const zipalign = findZipalign(args.zipalign);
    if (!zipalign) {
      console.error(`warning: zipalign not found; APK check skipped for ${args.apk}`);
      return 2;
    }
    try {
      execFileSync(zipalign, ["-c", "-P", "16", "4", args.apk], { stdio: "inherit" });
    } catch {
      console.error(`zipalign -c -P 16 4 failed for ${args.apk}`);
      return 1;
    }
    console.log(`zipalign: ${args.apk}`);
  }
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (invokedDirectly) {
  process.exitCode = main(process.argv.slice(2));
}
