import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { advanceTurn, deserializeSave, projectSaveToV42, SCHEMA_VERSION, serializeSave } from "./index.js";

const SAVED_AT = "2026-10-01T00:00:00.000Z";
const historicalDocument = () => gunzipSync(readFileSync(new URL("../../../fixtures/v42-1953-US.save.json.gz", import.meta.url))).toString("utf8");
const recordedEntry = {
  id: "taking-source-vector", countryId: "US", nationalCorporationId: "NAT-US-media",
  kind: "nationalize_whole", method: "executive", triggers: ["distress"], tier: "seizure",
  formerCorpName: "Media Company", sectorTypes: ["media"], compensationAnchor: 0,
  debtAnchor: 12500, shareholdersSettled: 2, turn: 0,
};

describe("state ownership at the public save boundary (#75)", () => {
  it("migrates and advances authentic historical absence without inventing an action history", () => {
    const world = deserializeSave(historicalDocument());
    expect(world.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(world.stateOwnershipLedger).toBeUndefined();
    advanceTurn(world);
    const resumed = deserializeSave(serializeSave(world, SAVED_AT));
    expect(resumed.stateOwnershipLedger).toBeUndefined();
  });

  it("persists the independently executed source register vector at the current boundary", () => {
    const saved = JSON.parse(serializeSave(deserializeSave(historicalDocument()), SAVED_AT));
    saved.world.stateOwnershipLedger = [recordedEntry];
    const world = deserializeSave(JSON.stringify(saved));
    expect(world.stateOwnershipLedger).toEqual([recordedEntry]);
    expect(deserializeSave(serializeSave(world, SAVED_AT)).stateOwnershipLedger).toEqual([recordedEntry]);
  });

  it("refuses malformed, duplicate, foreign-identity and unsupported taking records before continuation", () => {
    const saved = JSON.parse(serializeSave(deserializeSave(historicalDocument()), SAVED_AT));
    for (const ledger of [null, {}, [null], [recordedEntry, recordedEntry],
      [{ ...recordedEntry, countryId: "UNKNOWN" }], [{ ...recordedEntry, debtAnchor: -1 }],
      [{ ...recordedEntry, shareholdersSettled: 1.5 }], [{ ...recordedEntry, turn: saved.world.meta.turn + 1 }],
      [{ ...recordedEntry, tier: "fair" }], [{ ...recordedEntry, compensationAnchor: 1 }],
      [{ ...recordedEntry, triggers: [] }], [{ ...recordedEntry, sectorTypes: [] }],
    ]) {
      saved.world.stateOwnershipLedger = ledger;
      expect(() => deserializeSave(JSON.stringify(saved))).toThrow(/Invalid state ownership/);
    }
  });

  it("refuses a recorded or explicitly empty ledger in current and authentic-label v42 export", () => {
    for (const document of [historicalDocument(), serializeSave(deserializeSave(historicalDocument()), SAVED_AT)]) {
      for (const ledger of [[], [recordedEntry]]) {
        const saved = JSON.parse(document);
        saved.world.stateOwnershipLedger = ledger;
        expect(projectSaveToV42(JSON.stringify(saved))).toMatchObject({ ok: false, error: expect.stringContaining("State ownership history") });
      }
    }
  });
});
