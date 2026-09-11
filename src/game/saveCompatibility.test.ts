import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  advanceTurn,
  createWorld,
  deserializeSave,
  executeAction,
  serializeSave,
} from "@ahdclient/engine";
import { projectSaveToV42 } from "./saveCompatibility";

const SAVED_AT = "2026-09-10T00:00:00.000Z";
const FIXTURE_SHA = "471352be87c8887dcc6ae02f465b898272f62843b5e0861a45138c2de7f58cdc";
const V42_CONVERT_SHA = "013dfdb2f3491a8638792d46826263520b31bd88cb9ac0ae2abdc4c5f7a8dbe7";
const FIXTURE_GZ = join(dirname(fileURLToPath(import.meta.url)), "../../fixtures/v42-1953-US.save.json.gz");

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function loadAuthenticV42(): string {
  return gunzipSync(readFileSync(FIXTURE_GZ)).toString("utf8");
}

describe("schema 42 projection of public save envelopes", () => {
  it("reproduces the authentic v42 fixture from a Native-migrated current-schema reload", () => {
    expect(SCHEMA_VERSION).toBe(45);
    const authentic = loadAuthenticV42();
    expect(sha256(authentic)).toBe(FIXTURE_SHA);
    const migrated = serializeSave(deserializeSave(authentic), SAVED_AT);
    const parsed = JSON.parse(migrated) as { schemaVersion: number; world: { countryPolitics?: unknown; player: { homeRegionId?: unknown } } };
    expect(parsed.schemaVersion).toBe(45);
    expect(parsed.world.countryPolitics).toBeTypeOf("object");
    expect(parsed.world.player.homeRegionId).toBeNull();
    const projected = projectSaveToV42(migrated);
    expect(projected).toEqual({ ok: true, contents: authentic });
  });

  it("projects convertCash on that migrated world to the recorded v42 oracle hash", () => {
    const world = deserializeSave(loadAuthenticV42());
    const result = executeAction(world, "player", "convertCash", { amount: 2000 });
    expect(result).toEqual({ ok: true, message: "Converted 2000 cash to 1000 funds." });
    const projected = projectSaveToV42(serializeSave(world, SAVED_AT));
    expect(projected.ok).toBe(true);
    if (!projected.ok) throw new Error(projected.error);
    expect(sha256(projected.contents)).toBe(V42_CONVERT_SHA);
    expect(serializeSave(deserializeSave(projected.contents), SAVED_AT)).toBe(serializeSave(world, SAVED_AT));
  });

  it("returns an authentic v42 envelope unchanged", () => {
    const authentic = loadAuthenticV42();
    expect(projectSaveToV42(authentic)).toEqual({ ok: true, contents: authentic });
  });

  it("projects a Native-fresh schema 43 world as a v42 extension that keeps homeRegionId AL", () => {
    const world = createWorld({ seed: "v42-interchange-v1", playerName: "Validator", countryId: "US", era: "1953" });
    expect(world.player.homeRegionId).toBe("AL");
    const projected = projectSaveToV42(serializeSave(world, SAVED_AT));
    expect(projected.ok).toBe(true);
    if (!projected.ok) throw new Error(projected.error);
    const parsed = JSON.parse(projected.contents) as {
      schemaVersion: number;
      world: { meta: { schemaVersion: number }; countryPolitics?: unknown; player: { homeRegionId?: unknown } };
    };
    expect(parsed.schemaVersion).toBe(42);
    expect(parsed.world.meta.schemaVersion).toBe(42);
    expect(parsed.world.player.homeRegionId).toBe("AL");
    expect(Object.prototype.hasOwnProperty.call(parsed.world, "countryPolitics")).toBe(false);
    expect(sha256(projected.contents)).toBe("f141e9a919d8a6626c53a1ca6c4c9856ec5ccc97410b0a4c2ba8d61ba3aaa320");
    const restored = deserializeSave(projected.contents);
    expect(restored.player.homeRegionId).toBe("AL");
    expect(restored.countryPolitics).toEqual(world.countryPolitics);
  });

  it("refuses a migrated world after a Native turn mutates countryPolitics", () => {
    const world = deserializeSave(loadAuthenticV42());
    advanceTurn(world);
    const projected = projectSaveToV42(serializeSave(world, SAVED_AT));
    expect(projected.ok).toBe(false);
    if (projected.ok) throw new Error("expected countryPolitics refusal");
    expect(projected.error).toMatch(/countryPolitics/);
  });

  it("refuses a schema 43 envelope that was only relabeled 42", () => {
    const world = createWorld({ seed: "v42-interchange-v1", playerName: "Validator", countryId: "US", era: "1953" });
    const relabeled = JSON.parse(serializeSave(world, SAVED_AT)) as {
      schemaVersion: number;
      world: { meta: { schemaVersion: number }; countryPolitics?: unknown; player: { homeRegionId?: unknown } };
    };
    relabeled.schemaVersion = 42;
    relabeled.world.meta.schemaVersion = 42;
    const projected = projectSaveToV42(JSON.stringify(relabeled));
    expect(projected.ok).toBe(false);
    if (projected.ok) throw new Error("expected relabel refusal");
    expect(projected.error).toMatch(/countryPolitics|homeRegionId|not an authentic schema 42/i);
  });
});

it("rejects a malformed world even when both schema labels are 42", () => {
  const result = projectSaveToV42(JSON.stringify({ format: "ahdsolo-save", schemaVersion: 42, savedAt: SAVED_AT,
    world: { meta: { schemaVersion: 42 }, player: {} } }));
  expect(result.ok).toBe(false);
});
