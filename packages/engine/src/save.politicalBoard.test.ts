import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { createWorld, deserializeSave, projectSaveToV42, serializeSave } from "./index.js";

const recorded = () => deserializeSave(gunzipSync(readFileSync(new URL("../../../fixtures/native-fresh-pre-ceo-source.save.json.gz", import.meta.url))).toString("utf8"));

describe("source political boards at the public save boundary", () => {
  it("refuses exporting a saved political board to a reader that cannot advance it", () => {
    const historical = recorded();
    expect(projectSaveToV42(serializeSave(historical, "2026-10-01T00:00:00.000Z")).ok).toBe(true);
    const fresh = createWorld({ era: "1953", countryId: "US", seed: "political-save", playerName: "Alex" });
    historical.regionalPoliticalMetrics = fresh.regionalPoliticalMetrics;
    expect(projectSaveToV42(serializeSave(historical, "2026-10-01T00:00:00.000Z"))).toMatchObject({
      ok: false, error: expect.stringContaining("Political board"),
    });
  });
  it("rejects a political board attached to another country's region on reload", () => {
    const world = createWorld({ era: "2019", countryId: "UK", seed: "political-save", playerName: "Alex" });
    const saved = JSON.parse(serializeSave(world, "2026-10-01T00:00:00.000Z"));
    saved.world.regionalPoliticalMetrics.LON.countryId = "US";
    expect(() => deserializeSave(JSON.stringify(saved))).toThrow(/Political board.*LON.*country/);
  });

});
