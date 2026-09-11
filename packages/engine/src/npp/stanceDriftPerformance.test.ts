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
  expect(createHash("sha256").update(JSON.stringify(world)).digest("hex")).toBe("330ecb17bd9debde8d957388336f038b1a53cf0a2327e5d8a6d8616de4a905e2");
  // JSON hashing above performs one additional enumeration of the proxied map.
  expect(scans - 1).toBeLessThanOrEqual(Object.keys(world.regions).length);
  for (const party of Object.values(world.parties)) {
    party.economicPosition = 2;
    party.socialPosition = -2;
  }
  world.meta.turn = 12;
  expect(processNppStanceDrift(world, rngFromSeed("unused"))).toEqual({ drifted: 1500 });
  expect(createHash("sha256").update(JSON.stringify(world)).digest("hex")).toBe("0c6e9e9f11b9e4fa686f323e69795591b87935fe3b16cdf6a327e2f369e540d0");
});
