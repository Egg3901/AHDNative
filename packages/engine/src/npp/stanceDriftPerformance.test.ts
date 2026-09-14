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
  expect(createHash("sha256").update(JSON.stringify(world)).digest("hex")).toBe("e8abc141f0f36fbc434367603b4f05ee8118fe50cd462d5d665823203a50938f");
  // JSON hashing above performs one additional enumeration of the proxied map.
  expect(scans - 1).toBeLessThanOrEqual(Object.keys(world.regions).length);
  for (const party of Object.values(world.parties)) {
    party.economicPosition = 2;
    party.socialPosition = -2;
  }
  world.meta.turn = 12;
  expect(processNppStanceDrift(world, rngFromSeed("unused"))).toEqual({ drifted: 1500 });
  expect(createHash("sha256").update(JSON.stringify(world)).digest("hex")).toBe("b06316520a563ada2033888614e17de2115aa471433cb4cdddf3300ef71db7f7");
});
