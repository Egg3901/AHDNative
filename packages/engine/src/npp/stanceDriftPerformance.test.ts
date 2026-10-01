import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { expect, it } from "vitest";
import { createWorld } from "../world.js";
import { rngFromSeed } from "../rng.js";
import { processNppStanceDrift } from "./stanceDrift.js";

// Frozen full-world evidence from the pre-TFP source tree. Keep its original
// hashes, rather than repinning them whenever an unrelated seed field changes.
function historicalWorld(turn: 6 | 12, sha256: string) {
  const document = gunzipSync(readFileSync(new URL(`./fixtures/stance-pre-tfp-turn${turn}.json.gz`, import.meta.url))).toString("utf8");
  expect(createHash("sha256").update(document).digest("hex")).toBe(sha256);
  return JSON.parse(document) as ReturnType<typeof createWorld>;
}

it("scans regional registrations at most once per region, preserving pre-cache politician outcomes and all other current state", () => {
  const world = createWorld({ era: "1953", countryId: "US", seed: "stance-cache-proof", playerName: "Audit" });
  let scans = 0;
  world.partyRegions = new Proxy(world.partyRegions, { ownKeys(target) { scans++; return Reflect.ownKeys(target); } });
  const otherState = () => JSON.stringify({ ...world, politicians: [] });
  expect(world.featureFlags.rpgStats).toBe(true);
  for (const [turn, drifted, hash] of [
    [6, 1498, "b836320139e6af7f668d2ce81957e588bc489ce75483b1259201e28b00f2e632"],
    [12, 1500, "6a137dcba4868dc63b555fa243b88eb4df0b961faf59a89c05ac245e268029bd"],
  ] as const) {
    if (turn === 12) {
      for (const party of Object.values(world.parties)) {
        party.economicPosition = 2;
        party.socialPosition = -2;
      }
    }
    world.meta.turn = turn;
    const before = otherState();
    const previousScans = scans;
    expect(processNppStanceDrift(world, rngFromSeed("unused"))).toEqual({ drifted });
    // Compare exactly the save bytes the historical golden represented;
    // JSON canonicalizes signed zero on this persisted boundary.
    expect(JSON.stringify(world.politicians)).toBe(JSON.stringify(historicalWorld(turn, hash).politicians));
    expect(otherState()).toBe(before);
    // The after-state serialization performs one extra registration scan.
    expect(scans - previousScans - 1).toBeLessThanOrEqual(Object.keys(world.regions).length);
  }
});
