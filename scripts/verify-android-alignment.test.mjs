/**
 * Focused regression tests for the Android 16 KB alignment guard (issue #126).
 *
 * Builds synthetic ELF images in memory (no NDK/SDK/APK required) and proves
 * the guard accepts 16 KB-aligned LOAD segments, rejects 4 KB-aligned ones,
 * and that the repo persists the 16 KB linker flags plus the gate wiring.
 *
 * Run exactly:
 *   node --test scripts/verify-android-alignment.test.mjs
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  checkElfAlignment,
  checkLibraryFile,
  collectSoFiles,
} from "./verify-android-alignment.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PT_GNU_RELRO = 0x6474e552;

function buildElf64(segments) {
  const headerSize = 64;
  const entrySize = 56;
  const buffer = Buffer.alloc(headerSize + segments.length * entrySize);
  buffer[0] = 0x7f;
  buffer.write("ELF", 1);
  buffer[4] = 2; // 64-bit
  buffer[5] = 1; // little-endian
  buffer[6] = 1; // version
  buffer.writeUInt16LE(3, 16); // ET_DYN
  buffer.writeUInt16LE(183, 18); // AARCH64
  buffer.writeBigUInt64LE(BigInt(headerSize), 0x20); // e_phoff
  buffer.writeUInt16LE(entrySize, 0x36); // e_phentsize
  buffer.writeUInt16LE(segments.length, 0x38); // e_phnum
  segments.forEach((seg, i) => {
    const base = headerSize + i * entrySize;
    buffer.writeUInt32LE(seg.type ?? 1, base);
    buffer.writeUInt32LE(5, base + 4);
    buffer.writeBigUInt64LE(BigInt(seg.offset ?? 0x1000 * (i + 1)), base + 8);
    buffer.writeBigUInt64LE(BigInt(seg.offset ?? 0x1000 * (i + 1)), base + 16);
    buffer.writeBigUInt64LE(BigInt(seg.filesz ?? 0x1000), base + 32);
    buffer.writeBigUInt64LE(BigInt(seg.filesz ?? 0x1000), base + 40);
    buffer.writeBigUInt64LE(BigInt(seg.align ?? 0x4000), base + 48);
  });
  return buffer;
}

function buildElf32(segments) {
  const headerSize = 52;
  const entrySize = 32;
  const buffer = Buffer.alloc(headerSize + segments.length * entrySize);
  buffer[0] = 0x7f;
  buffer.write("ELF", 1);
  buffer[4] = 1; // 32-bit
  buffer[5] = 1; // little-endian
  buffer[6] = 1;
  buffer.writeUInt16LE(3, 16);
  buffer.writeUInt16LE(40, 18); // ARM
  buffer.writeUInt32LE(headerSize, 0x1c); // e_phoff
  buffer.writeUInt16LE(entrySize, 0x2a);
  buffer.writeUInt16LE(segments.length, 0x2c);
  segments.forEach((seg, i) => {
    const base = headerSize + i * entrySize;
    buffer.writeUInt32LE(seg.type ?? 1, base);
    buffer.writeUInt32LE(seg.offset ?? 0x1000 * (i + 1), base + 4);
    buffer.writeUInt32LE(seg.offset ?? 0x1000 * (i + 1), base + 8);
    buffer.writeUInt32LE(seg.filesz ?? 0x1000, base + 16);
    buffer.writeUInt32LE(seg.filesz ?? 0x1000, base + 20);
    buffer.writeUInt32LE(5, base + 24);
    buffer.writeUInt32LE(seg.align ?? 0x4000, base + 28);
  });
  return buffer;
}

describe("elf 16 KB alignment check", () => {
  it("accepts 64-bit LOAD segments aligned to 16 KB", () => {
    const result = checkElfAlignment(
      buildElf64([{ align: 0x4000 }, { align: 0x10000 }]),
      "aligned.so",
    );
    assert.equal(result.ok, true);
    assert.deepEqual(result.reasons, []);
  });

  it("rejects 64-bit LOAD segments aligned to 4 KB", () => {
    const result = checkElfAlignment(buildElf64([{ align: 0x1000 }]), "legacy.so");
    assert.equal(result.ok, false);
    assert.match(result.reasons.join("\n"), /LOAD segment 0 alignment 0x1000/);
  });

  it("ignores non-LOAD segments and zero-length LOAD segments", () => {
    const result = checkElfAlignment(
      buildElf64([
        { type: PT_GNU_RELRO, align: 8 },
        { align: 0x1000, filesz: 0 },
        { align: 0x4000 },
      ]),
      "mixed.so",
    );
    assert.equal(result.ok, true);
  });

  it("accepts 32-bit 16 KB alignment and rejects 4 KB alignment", () => {
    assert.equal(checkElfAlignment(buildElf32([{ align: 0x4000 }]), "a.so").ok, true);
    const bad = checkElfAlignment(buildElf32([{ align: 0x1000 }]), "b.so");
    assert.equal(bad.ok, false);
    assert.match(bad.reasons.join("\n"), /LOAD segment 0/);
  });

  it("rejects non-ELF and truncated inputs", () => {
    const magic = checkElfAlignment(Buffer.alloc(64, 0x41), "x.so");
    assert.equal(magic.ok, false);
    assert.match(magic.reasons.join("\n"), /ELF magic/);
    const short = checkElfAlignment(Buffer.alloc(10), "short.so");
    assert.equal(short.ok, false);
    assert.match(short.reasons.join("\n"), /too small/);
  });

  it("rejects images with no loadable segments", () => {
    const result = checkElfAlignment(
      buildElf64([{ type: PT_GNU_RELRO, align: 0x4000 }]),
      "noreload.so",
    );
    assert.equal(result.ok, false);
    assert.match(result.reasons.join("\n"), /no loadable/);
  });
});

describe("library file helpers", () => {
  it("checks a real file and reports an unreadable one", () => {
    const dir = mkdtempSync(join(tmpdir(), "align-"));
    try {
      const good = join(dir, "good.so");
      writeFileSync(good, buildElf64([{ align: 0x4000 }]));
      assert.deepEqual(checkLibraryFile(good), []);
      const missing = checkLibraryFile(join(dir, "absent.so"));
      assert.match(missing.join("\n"), /unreadable/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("collects nested .so files and skips other names", () => {
    const dir = mkdtempSync(join(tmpdir(), "align-walk-"));
    try {
      writeFileSync(join(dir, "a.so"), buildElf64([{ align: 0x4000 }]));
      writeFileSync(join(dir, "notes.txt"), "x");
      const nested = join(dir, "sub");
      mkdirSync(nested);
      writeFileSync(join(nested, "b.so"), buildElf64([{ align: 0x4000 }]));
      writeFileSync(join(dir, "sub.so.txt"), "x");
      assert.deepEqual(collectSoFiles(dir), [join(dir, "a.so"), join(nested, "b.so")]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("16 KB gate wiring", () => {
  it("persists the 16 KB linker flags for aarch64-linux-android", () => {
    const config = readFileSync(resolve(REPO_ROOT, ".cargo", "config.toml"), "utf8");
    assert.match(config, /\[target\.aarch64-linux-android\]/);
    assert.match(config, /max-page-size=16384/);
    assert.match(config, /common-page-size=16384/);
  });

  it("runs the guard from the review build script", () => {
    const script = readFileSync(resolve(REPO_ROOT, "scripts", "review-android.sh"), "utf8");
    assert.match(script, /verify-android-alignment\.mjs/);
  });
});
