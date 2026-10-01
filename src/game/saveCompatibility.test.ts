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
  it("refuses fresh TFP state that the historical engine does not consume", () => {
    const world = createWorld({ seed: "v42-interchange-v1", playerName: "Validator", countryId: "US", era: "1953" });
    expect(projectSaveToV42(serializeSave(world, SAVED_AT))).toMatchObject({
      ok: false, error: expect.stringContaining("Regional metric records"),
    });
  });

  it("reproduces the authentic v42 fixture from a Native-migrated current-schema reload", () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(44);
    const authentic = loadAuthenticV42();
    expect(sha256(authentic)).toBe(FIXTURE_SHA);
    const migrated = serializeSave(deserializeSave(authentic), SAVED_AT);
    const parsed = JSON.parse(migrated) as { schemaVersion: number; world: { countryPolitics?: unknown; player: { homeRegionId?: unknown } } };
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.world.countryPolitics).toBeTypeOf("object");
    expect(parsed.world.player.homeRegionId).toBeNull();
    const projected = projectSaveToV42(migrated);
    expect(projected).toEqual({ ok: true, contents: authentic });
  });

  it("projects convertCash on that migrated world to the recorded v42 oracle hash", () => {
    const world = deserializeSave(loadAuthenticV42());
    const result = executeAction(world, "player", "convertCash", { amount: 2000 });
    expect(result).toEqual({ ok: true, message: "Converted 2000 cash to 1000 funds.", changes: { actions: -2, cash: -2000, funds: 1000 } });
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

  it("projects a Native-fresh world with source-backed issuer identity and reloads that identity", () => {
    const world = createWorld({ seed: "v42-interchange-v1", playerName: "Validator", countryId: "US", era: "1953" });
    expect(world.player.homeRegionId).toBe("AL");
    // Isolate the supported identity extension from the fresh TFP guard.
    world.regionalMetrics = {};
    const projected = projectSaveToV42(serializeSave(world, SAVED_AT));
    expect(projected.ok).toBe(true);
    if (!projected.ok) throw new Error(projected.error);
    const parsed = JSON.parse(projected.contents) as {
      schemaVersion: number;
      world: {
        meta: { schemaVersion: number };
        countryPolitics?: unknown;
        player: { homeRegionId?: unknown };
        regions?: Record<string, { id?: unknown; countryId?: unknown; name?: unknown; corporationHeadquartersOnly?: unknown }>;
        corporations?: Record<string, { name?: unknown; brandColor?: unknown; headquartersRegionId?: unknown }>;
      };
    };
    expect(parsed.schemaVersion).toBe(42);
    expect(parsed.world.meta.schemaVersion).toBe(42);
    expect(parsed.world.player.homeRegionId).toBe("AL");
    expect(Object.prototype.hasOwnProperty.call(parsed.world, "countryPolitics")).toBe(false);
    expect(parsed.world.regions?.DC).toEqual({
      id: "DC",
      countryId: "US",
      name: "District of Columbia",
      corporationHeadquartersOnly: true,
    });
    expect(parsed.world.corporations?.["US-media"]).toMatchObject({
      name: "Daily Media",
      brandColor: "#06b6d4",
      headquartersRegionId: "DC",
    });
    const restored = deserializeSave(projected.contents);
    expect(restored.player.homeRegionId).toBe("AL");
    expect(restored.countryPolitics).toEqual(world.countryPolitics);
    expect(restored.regions.DC).toMatchObject(parsed.world.regions!.DC!);
    expect(restored.corporations["US-media"]).toMatchObject(parsed.world.corporations!["US-media"]!);
  });

  it("refuses CEO governance and compensation state the v42 reader cannot advance", () => {
    const unsupportedStates: ReadonlyArray<readonly [string, unknown]> = [
      ["ceoType", "player"],
      ["ceoId", "player"],
      ["ceoVacant", true],
      ["pendingCeoId", "player"],
      ["ceoVotes", [{ voterId: "player", candidateId: "player", shares: 1 }]],
      ["ceoSalaryPerTurn", 1_000],
      ["dividendRate", 25],
      ["lastCeoSalaryPaid", 1_000],
      ["lastDividendPoolPaid", 500],
      ["lastPlayerDividendPaid", 5],
      ["lastUnpostedDividendPaid", 495],
    ];
    for (const [field, value] of unsupportedStates) {
      const world = createWorld({ seed: "v42-ceo-refusal", playerName: "Validator", countryId: "US", era: "1953" });
      world.regionalMetrics = {};
      Object.assign(world.corporations["US-media"]!, { [field]: value });
      const projected = projectSaveToV42(serializeSave(world, SAVED_AT));
      expect(projected.ok, field).toBe(false);
      if (projected.ok) throw new Error(`expected refusal for ${field}`);
      expect(projected.error, field).toContain("CEO governance or compensation state");
    }

    const playerWorld = createWorld({
      seed: "v42-ceo-refusal",
      playerName: "Validator",
      countryId: "US",
      era: "1953",
      homeRegionId: "DC",
    });
    playerWorld.regionalMetrics = {};
    expect(executeAction(playerWorld, "player", "buyShares", { corpId: "US-media", shares: 1 }).ok).toBe(true);
    expect(executeAction(playerWorld, "player", "voteCeo", { corpId: "US-media", candidateId: "player" }).ok).toBe(true);
    expect(projectSaveToV42(serializeSave(playerWorld, SAVED_AT))).toMatchObject({
      ok: false,
      error: expect.stringContaining("CEO governance or compensation state"),
    });
    expect(executeAction(playerWorld, "player", "acceptCeoAppointment", { corpId: "US-media" }).ok).toBe(true);
    expect(projectSaveToV42(serializeSave(playerWorld, SAVED_AT))).toMatchObject({
      ok: false,
      error: expect.stringContaining("CEO governance or compensation state"),
    });
  });

  it("refuses a migrated world after a Native turn mutates countryPolitics", () => {
    const world = deserializeSave(loadAuthenticV42());
    advanceTurn(world);
    const projected = projectSaveToV42(serializeSave(world, SAVED_AT));
    expect(projected.ok).toBe(false);
    if (projected.ok) throw new Error("expected countryPolitics refusal");
    expect(projected.error).toMatch(/countryPolitics|market pressure|price history/);
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
