import type { WorldState } from "../types.js";
import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";

// One world per file so vitest runs the three W61 roster sims in parallel
// workers (a single 3-world test took 17 minutes serially).
const seated = (w: WorldState, cid: string, key: string) => w.politicians.filter((p) => p.countryId === cid && p.chamberKey === key).length;
const seats = (w: WorldState, cid: string, key: string) => w.legislatures[cid]!.chambers.find((c) => c.key === key)!.seats;

describe("W61 background roster: 2019 JP", () => {
  it("resolves Shugiin, Sangiin (two classes), regional councils and forms a government by t400 without JP player selection", () => {
    // Exercise the source-seeded JP institutions as a background country in a
    // supported public US world; the same source-tier pack also supports JP
    // career creation through the separate public-player flow tests.
    let world = createWorld({ seed: "w61-jp-background", playerName: "P", countryId: "US", era: "2019" });
    for (let i = 0; i < 200; i++) advanceTurn(world);
    world = deserializeSave(serializeSave(world, "2026-10-03T00:00:00.000Z"));
    for (let i = 200; i < 400; i++) advanceTurn(world);
    for (const key of ["shugiin", "sangiin", "regionalCouncil"]) expect(seated(world, "JP", key), `JP:${key}`).toBe(seats(world, "JP", key));
    // Current source 2019 maps: 465 Shugiin districts, 248 Sangiin seats,
    // and 2,679 regional council seats across the eight source regions.
    expect(seats(world, "JP", "shugiin")).toBe(465);
    expect(seats(world, "JP", "sangiin")).toBe(248);
    expect(seats(world, "JP", "regionalCouncil")).toBe(2679);
    expect(world.governments["JP"]?.status).toBe("formed");
    expect(world.countries.JP?.playable).toBe(true);
  });
});
