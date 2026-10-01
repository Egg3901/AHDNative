/**
 * Plants settlement save boundary: the optional plant market book and the
 * recorded stock/book/telemetry fields round-trip verbatim when populated,
 * fail closed when malformed, and project to schema 42 without loss.
 * The authentic v42 oracle suite (save.v42Projection.test.ts) is untouched.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  advanceTurn,
  createWorld,
  deserializeSave,
  projectSaveToV42,
  serializeSave,
} from "./index.js";

const SAVED_AT = "2026-10-01T00:00:00.000Z";
const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures");

function loadHistoricalFresh() {
  return deserializeSave(
    gunzipSync(readFileSync(join(FIXTURE_DIR, "native-fresh-pre-ceo-source.save.json.gz"))).toString("utf8"),
  );
}

function validBook() {
  return {
    external: { energy: 1000, steel: 2000 },
    corporateInputs: { energy: 500 },
    externalSupply: { energy: 50_000 },
    corporateOutputSupply: {},
  };
}

function docWithBook(book: unknown) {
  const world = loadHistoricalFresh();
  const doc = JSON.parse(serializeSave(world, SAVED_AT)) as { world: Record<string, unknown> };
  doc.world["plantMarketDemand"] = book;
  return JSON.stringify(doc);
}

describe("plants settlement save boundary", () => {
  it("round-trips a populated plant book and recorded asset telemetry verbatim", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "plants-save-roundtrip", playerName: "Alex" });
    advanceTurn(world);
    expect(world.plantMarketDemand).toBeDefined();
    const assets = Object.values(world.corporateSectors ?? {});
    expect(assets.length).toBeGreaterThan(0);
    expect(assets.some((asset) => (asset.producedUnits ?? 0) > 0)).toBe(true);
    const restored = deserializeSave(serializeSave(world, SAVED_AT));
    expect(restored.plantMarketDemand).toEqual(world.plantMarketDemand);
    expect(restored.corporateSectors).toEqual(world.corporateSectors);
  });

  it("refuses malformed plant books before any turn can read them", () => {
    const bad: Array<[string, unknown]> = [
      ["non-record", "plants"],
      ["negative balance", { ...validBook(), external: { energy: -5 } }],
      ["non-finite balance", { ...validBook(), external: { energy: "lots" } }],
      ["missing leg", { external: {}, corporateInputs: {}, externalSupply: {} }],
      ["array leg", { ...validBook(), corporateOutputSupply: [] }],
    ];
    for (const [label, book] of bad) {
      expect(() => deserializeSave(docWithBook(book)), label).toThrow(/plant market/);
    }
  });

  it("projects populated plant state to schema 42 without loss", () => {
    const projected = projectSaveToV42(docWithBook(validBook()));
    expect(projected.ok).toBe(true);
    if (!projected.ok) throw new Error(projected.error);
    const restored = deserializeSave(projected.contents);
    expect(restored.plantMarketDemand).toEqual(validBook());
  });
});
