import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";

describe("source country governor election families", () => {
  it("runs and persists RU and DD First Secretary elections through the normal turn loop", () => {
    const world = createWorld({ seed: "country-governors", playerName: "Tester", countryId: "US", era: "1953" });

    // The first real turn spawns the cycle-1 races. Jump the deterministic
    // fixture clock to the source end-turn boundary instead of simulating
    // decades of unrelated country systems. Seed the preceding accumulated
    // ballots as an in-flight save would contain when reloaded on that edge.
    advanceTurn(world);
    for (const election of world.elections) {
      if ((election.countryId === "RU" || election.countryId === "DD") && election.electionType === "governor") {
        election.tally = Object.fromEntries(election.candidates.map((candidate, index) => [candidate.id, index === 0 ? 100 : 10]));
      }
    }
    world.meta.turn = 143;
    advanceTurn(world);

    for (const countryId of ["RU", "DD"] as const) {
      expect(Object.values(world.governors).some((office) => office.countryId === countryId), `${countryId} has seeded offices`).toBe(true);
      const race = world.elections.find(
        (election) => election.countryId === countryId && election.electionType === "governor" && election.status === "resolved",
      );
      expect(
        race,
        `${countryId} should resolve its first regional executive race; observed ${JSON.stringify(world.elections.filter((election) => election.countryId === countryId && election.electionType === "governor").map(({ id, state, cycle, status, startTurn, endTurn }) => ({ id, state, cycle, status, startTurn, endTurn })))}`,
      ).toBeDefined();
      expect(race!.state).toBeTruthy();
      expect(race!.winners).toHaveLength(1);
      expect(world.governors[race!.state!]!.governorId).toBe(race!.winners[0]);
    }

    const restored = deserializeSave(serializeSave(world, "country-governor-parity"));
    for (const countryId of ["RU", "DD"] as const) {
      const race = world.elections.find(
        (election) => election.countryId === countryId && election.electionType === "governor" && election.status === "resolved",
      )!;
      expect(restored.elections.find((saved) => saved.id === race.id)).toEqual(JSON.parse(JSON.stringify(race)));
      expect(restored.governors[race.state!]!.governorId).toBe(world.governors[race.state!]!.governorId);
    }
  });
});
