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
  // Re-pinned #326 (schema 48): createWorld now stamps schemaVersion 48 and
  // seeds the empty interbankLoans book; drift counts below are unchanged.
  // Re-pinned #328: seeded bank charters now carry the explicit retail
  // prop-book shape (charterType "retail", empty propBook, zero
  // propBookMarkValue on all 4 seeded charters). Proven source-backed, not
  // behavioral drift: deleting exactly those default keys reproduces the
  // pre-#328 goldens byte-exact, and drift counts are unchanged (1498/1500).
  expect(createHash("sha256").update(JSON.stringify(world)).digest("hex")).toBe("b836320139e6af7f668d2ce81957e588bc489ce75483b1259201e28b00f2e632");
  // JSON hashing above performs one additional enumeration of the proxied map.
  expect(scans - 1).toBeLessThanOrEqual(Object.keys(world.regions).length);
  for (const party of Object.values(world.parties)) {
    party.economicPosition = 2;
    party.socialPosition = -2;
  }
  world.meta.turn = 12;
  expect(processNppStanceDrift(world, rngFromSeed("unused"))).toEqual({ drifted: 1500 });
  expect(createHash("sha256").update(JSON.stringify(world)).digest("hex")).toBe("6a137dcba4868dc63b555fa243b88eb4df0b961faf59a89c05ac245e268029bd");
});
