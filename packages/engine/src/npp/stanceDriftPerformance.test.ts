import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { createWorld } from "../world.js";
import { rngFromSeed } from "../rng.js";
import { processNppStanceDrift } from "./stanceDrift.js";

it("scans regional registrations at most once per region, preserving the pre-cache world", () => {
  const world = createWorld({ era: "1953", countryId: "US", seed: "stance-cache-proof", playerName: "Audit" });
  world.meta.turn = 6;
  let scans = 0;
  world.partyRegions = new Proxy(world.partyRegions, { ownKeys(target) { scans++; return Reflect.ownKeys(target); } });
  expect(processNppStanceDrift(world, rngFromSeed("unused"))).toEqual({ drifted: 1498 });
  // Captured from the real unoptimized phase, before introducing any cache.
  // Re-pinned #242: one-party packs now carry the authored `regimeStatus`
  // marker (ruling/approved), which is part of every seeded party record.
  expect(createHash("sha256").update(JSON.stringify(world)).digest("hex")).toBe("64570aed54555e5bf7cc01509f14990b03699e97594db6df6219bd74053afd8d");
  // JSON hashing above performs one additional enumeration of the proxied map.
  expect(scans - 1).toBeLessThanOrEqual(Object.keys(world.regions).length);
  for (const party of Object.values(world.parties)) {
    party.economicPosition = 2;
    party.socialPosition = -2;
  }
  world.meta.turn = 12;
  expect(processNppStanceDrift(world, rngFromSeed("unused"))).toEqual({ drifted: 1500 });
  expect(createHash("sha256").update(JSON.stringify(world)).digest("hex")).toBe("1fde4d6f5c0a5231e815894afc1b5c38e61e7200bc05a3647cb12574ff46b2c8");
});
