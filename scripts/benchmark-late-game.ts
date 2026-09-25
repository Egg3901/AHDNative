/** Reproducible Linux engine replay probe for device gates #43 and #44.
 *
 * This measures the public engine boundaries on a committed turn-95 save.
 * It does not measure a Tauri bridge, native storage, touch-to-render time,
 * thermal behavior, or physical iOS/Android performance.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { gunzipSync } from "node:zlib";
import { advanceTurn, deserializeSave, serializeSave } from "../packages/engine/src/index.js";

const FIXTURE = "career-current-distributor-t95-1953-US.save.json.gz";
const SAVED_AT = "2026-09-25T00:00:00.000Z";

function sha256(contents: string): string {
  return createHash("sha256").update(contents).digest("hex");
}

function option(name: string, fallback: number, min: number, max: number): number {
  const value = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (!value) return fallback;
  const parsed = Number(value.slice(name.length + 3));
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`--${name} must be an integer from ${min} to ${max}`);
  }
  return parsed;
}

function summary(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)]!;
  return { p50: percentile(0.5), p95: percentile(0.95), samples };
}

const samples = option("samples", 10, 1, 100);
const warmup = option("warmup", 2, 0, 20);
const raw = gunzipSync(readFileSync(new URL(`../fixtures/${FIXTURE}`, import.meta.url))).toString("utf8");
const deserializeMs: number[] = [];
const turnMs: number[] = [];
const serializeMs: number[] = [];
const outputHashes: string[] = [];
let saveBytes = 0;

for (let i = -warmup; i < samples; i += 1) {
  const loadStart = performance.now();
  const world = deserializeSave(raw);
  const loadElapsed = performance.now() - loadStart;
  const turnStart = performance.now();
  advanceTurn(world);
  const turnElapsed = performance.now() - turnStart;
  const saveStart = performance.now();
  const saved = serializeSave(world, SAVED_AT);
  const saveElapsed = performance.now() - saveStart;
  if (i >= 0) {
    deserializeMs.push(loadElapsed);
    turnMs.push(turnElapsed);
    serializeMs.push(saveElapsed);
    outputHashes.push(sha256(saved));
    saveBytes = Buffer.byteLength(saved);
  }
}

const source = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
const dirty = spawnSync("git", ["status", "--porcelain", "--untracked-files=no"], { encoding: "utf8" });
const deterministic = new Set(outputHashes).size === 1;
const report = {
  fixture: FIXTURE,
  fixtureSha256: sha256(raw),
  sourceCommit: source.status === 0 ? source.stdout.trim() : null,
  sourceDirty: dirty.status !== 0 || dirty.stdout.trim() !== "",
  samples,
  warmup,
  deserializeMs: summary(deserializeMs),
  turnMs: summary(turnMs),
  serializeMs: summary(serializeMs),
  saveBytes,
  turnOutputSha256: outputHashes[0],
  deterministic,
  boundary: "Linux public engine only; no native bridge, storage, device, or thermal measurement",
};
process.stdout.write(`${JSON.stringify(report)}\n`);
if (!deterministic) process.exitCode = 1;
