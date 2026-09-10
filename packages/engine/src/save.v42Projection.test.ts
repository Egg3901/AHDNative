/**
 * Public schema 42 projection. Expected hashes come from the pinned v42
 * engine at Egg3901/AHDClient@c5017542c860f5f94b7d4b4d5cfea2939b28995d
 * (deserializeSave + serializeSave of the projected bytes). This suite
 * imports this workspace's engine, not a baseline symlink.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  advanceTurn,
  createWorld,
  deserializeSave,
  executeAction,
  projectSaveToV42,
  serializeSave,
} from "./index.js";

const SAVED_AT = "2026-09-10T00:00:00.000Z";
const FIXTURE_SHA = "471352be87c8887dcc6ae02f465b898272f62843b5e0861a45138c2de7f58cdc";
const NATIVE_FRESH_KEEP_HOME_SHA = "f141e9a919d8a6626c53a1ca6c4c9856ec5ccc97410b0a4c2ba8d61ba3aaa320";
const NATIVE_FRESH_CONVERT_KEEP_HOME_SHA = "e281fc2736afa82ee26f82d90d541bd17465605d8f5e81123820efe5e7eb91da";
const FIXTURE_GZ = join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/v42-1953-US.save.json.gz");
const WORLD_OPTS = { seed: "v42-interchange-v1", playerName: "Validator", countryId: "US", era: "1953" } as const;

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function loadAuthenticV42(): string {
  return gunzipSync(readFileSync(FIXTURE_GZ)).toString("utf8");
}

function parseProjected(contents: string): {
  schemaVersion: number;
  metaSchema: number;
  homeRegionId: unknown;
  hasCountryPolitics: boolean;
  hasHomeRegionId: boolean;
} {
  const parsed = JSON.parse(contents) as {
    schemaVersion: number;
    world: { meta: { schemaVersion: number }; countryPolitics?: unknown; player: { homeRegionId?: unknown } };
  };
  return {
    schemaVersion: parsed.schemaVersion,
    metaSchema: parsed.world.meta.schemaVersion,
    homeRegionId: parsed.world.player.homeRegionId,
    hasCountryPolitics: Object.prototype.hasOwnProperty.call(parsed.world, "countryPolitics"),
    hasHomeRegionId: Object.prototype.hasOwnProperty.call(parsed.world.player, "homeRegionId"),
  };
}

describe("projectSaveToV42 public envelope", () => {
  it("returns the authentic v42 fixture unchanged", () => {
    expect(SCHEMA_VERSION).toBe(43);
    const authentic = loadAuthenticV42();
    expect(sha256(authentic)).toBe(FIXTURE_SHA);
    expect(projectSaveToV42(authentic)).toEqual({ ok: true, contents: authentic });
  });

  it("projects a Native-fresh 1953 US world with homeRegionId AL as a v42 extension the old reader preserved", () => {
    const world = createWorld(WORLD_OPTS);
    expect(world.player.homeRegionId).toBe("AL");
    const projected = projectSaveToV42(serializeSave(world, SAVED_AT));
    expect(projected.ok).toBe(true);
    if (!projected.ok) throw new Error(projected.error);
    const parsed = parseProjected(projected.contents);
    expect(parsed.schemaVersion).toBe(42);
    expect(parsed.metaSchema).toBe(42);
    expect(parsed.hasCountryPolitics).toBe(false);
    expect(parsed.hasHomeRegionId).toBe(true);
    expect(parsed.homeRegionId).toBe("AL");
    expect(sha256(projected.contents)).toBe(NATIVE_FRESH_KEEP_HOME_SHA);
    const restored = deserializeSave(projected.contents);
    expect(restored.meta.schemaVersion).toBe(43);
    expect(restored.player.homeRegionId).toBe("AL");
    expect(restored.countryPolitics).toEqual(world.countryPolitics);
  });

  it("projects convertCash on that Native-fresh world to the recorded v42-reader hash", () => {
    const world = createWorld(WORLD_OPTS);
    const result = executeAction(world, "player", "convertCash", { amount: 2000 });
    expect(result).toEqual({ ok: true, message: "Converted 2000 cash to 1000 funds." });
    const projected = projectSaveToV42(serializeSave(world, SAVED_AT));
    expect(projected.ok).toBe(true);
    if (!projected.ok) throw new Error(projected.error);
    expect(sha256(projected.contents)).toBe(NATIVE_FRESH_CONVERT_KEEP_HOME_SHA);
    expect(parseProjected(projected.contents).homeRegionId).toBe("AL");
    expect(parseProjected(projected.contents).hasCountryPolitics).toBe(false);
    const restored = deserializeSave(projected.contents);
    expect(restored.player.homeRegionId).toBe("AL");
    expect(restored.player.cash).toBe(world.player.cash);
    expect(restored.player.funds).toBe(world.player.funds);
    expect(restored.countryPolitics).toEqual(world.countryPolitics);
  });

  it("projects a Native-migrated authentic v42 world back to the fixture bytes", () => {
    const authentic = loadAuthenticV42();
    const migrated = serializeSave(deserializeSave(authentic), SAVED_AT);
    const projected = projectSaveToV42(migrated);
    expect(projected).toEqual({ ok: true, contents: authentic });
  });

  it("refuses a Native world after a turn mutates countryPolitics history", () => {
    const world = createWorld(WORLD_OPTS);
    advanceTurn(world);
    expect(world.countryPolitics["US"]!.approvalHistory.length).toBeGreaterThan(1);
    const projected = projectSaveToV42(serializeSave(world, SAVED_AT));
    expect(projected.ok).toBe(false);
    if (projected.ok) throw new Error("expected countryPolitics refusal");
    expect(projected.error).toMatch(/countryPolitics/);
    expect(projected.error).not.toMatch(/schemaVersion rewritten|relabel/i);
  });

  it("projects a Native-fresh envelope whose record keys are reversed", () => {
    const world = createWorld(WORLD_OPTS);
    const original = JSON.parse(serializeSave(world, SAVED_AT)) as Record<string, unknown>;
    const originalWorld = original["world"] as Record<string, unknown>;
    const reversedWorld: Record<string, unknown> = {};
    const worldKeys = Object.keys(originalWorld);
    for (let i = worldKeys.length - 1; i >= 0; i -= 1) {
      const key = worldKeys[i]!;
      reversedWorld[key] = originalWorld[key];
    }
    const reversed: Record<string, unknown> = {};
    const envelopeKeys = Object.keys(original);
    for (let i = envelopeKeys.length - 1; i >= 0; i -= 1) {
      const key = envelopeKeys[i]!;
      reversed[key] = key === "world" ? reversedWorld : original[key];
    }
    const projected = projectSaveToV42(JSON.stringify(reversed));
    expect(projected.ok).toBe(true);
    if (!projected.ok) throw new Error(projected.error);
    const parsed = parseProjected(projected.contents);
    expect(parsed.schemaVersion).toBe(42);
    expect(parsed.metaSchema).toBe(42);
    expect(parsed.hasCountryPolitics).toBe(false);
    expect(parsed.homeRegionId).toBe("AL");
    const restored = deserializeSave(projected.contents);
    expect(restored.player.homeRegionId).toBe("AL");
    expect(restored.countryPolitics).toEqual(world.countryPolitics);
  });

  it("refuses extra own keys including __proto__ that Native restore would drop", () => {
    const world = createWorld(WORLD_OPTS);
    const original = JSON.parse(serializeSave(world, SAVED_AT)) as {
      world: { countryPolitics: Record<string, Record<string, unknown>> };
    };
    const us = original.world.countryPolitics["US"];
    if (us === undefined) throw new Error("expected US countryPolitics");
    Object.defineProperty(us, "__proto__", {
      value: { lost: true },
      enumerable: true,
      configurable: true,
      writable: true,
    });
    us["extraGauge"] = 1;
    expect(JSON.stringify(original)).toContain('"__proto__"');
    expect(JSON.stringify(original)).toContain('"extraGauge"');
    const projected = projectSaveToV42(JSON.stringify(original));
    expect(projected.ok).toBe(false);
    if (projected.ok) throw new Error("expected extra-key refusal");
    expect(projected.error).toMatch(/countryPolitics/);
    expect(Object.prototype.hasOwnProperty("lost")).toBe(false);
    expect(Object.prototype.hasOwnProperty("extraGauge")).toBe(false);
  });

  it("refuses a schema 43 envelope that was only relabeled 42 while keeping countryPolitics", () => {
    const world = createWorld(WORLD_OPTS);
    const relabeled = JSON.parse(serializeSave(world, SAVED_AT)) as {
      schemaVersion: number;
      world: { meta: { schemaVersion: number }; countryPolitics?: unknown; player: { homeRegionId?: unknown } };
    };
    relabeled.schemaVersion = 42;
    relabeled.world.meta.schemaVersion = 42;
    const projected = projectSaveToV42(JSON.stringify(relabeled));
    expect(projected.ok).toBe(false);
    if (projected.ok) throw new Error("expected relabel refusal");
    expect(projected.error).toMatch(/countryPolitics|not an authentic schema 42/i);
  });
});

it("rejects a malformed world even when both schema labels are 42", () => {
  const result = projectSaveToV42(
    JSON.stringify({
      format: "ahdsolo-save",
      schemaVersion: 42,
      savedAt: SAVED_AT,
      world: { meta: { schemaVersion: 42 }, player: {} },
    }),
  );
  expect(result.ok).toBe(false);
});
