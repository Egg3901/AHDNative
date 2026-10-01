/**
 * creationChoices home-region context (#242 slice, red).
 *
 * The creation screen needs source-grounded population and electorate
 * lean per home region. This context is display-only: it must never leak
 * into the persisted CharacterCreation record or the save.
 */
import { describe, expect, it } from "vitest";
import { creationChoices, gameChoices } from "./session";

describe("creationChoices home-region context (#242)", () => {
  it("exposes pack population and a seeded electorate lean per US home region", () => {
    const choices = creationChoices("1953", "US");
    const ny = choices.homeRegions?.find((region) => region.id === "NY");
    expect(ny).toMatchObject({ id: "NY", name: "New York", population: 14830192, seeded: true });
    expect(ny?.electorateLean).toMatchObject({
      economic: expect.any(Number),
      social: expect.any(Number),
    });
  });

  it("differentiates per-region leans instead of repeating one national value", () => {
    const choices = creationChoices("1953", "US");
    const ny = choices.homeRegions?.find((region) => region.id === "NY")?.electorateLean;
    const al = choices.homeRegions?.find((region) => region.id === "AL")?.electorateLean;
    expect(ny).not.toEqual(al);
  });

  it("offers the source-authored US CEO HQ as residence-only home geography", () => {
    const home = creationChoices("1953", "US").homeRegions?.find((region) => region.id === "DC");
    expect(home).toEqual({
      id: "DC",
      name: "District of Columbia",
      population: null,
      electorateLean: null,
      seeded: false,
    });
    const worldChoices = gameChoices().find((era) => era.id === "1953")?.countries.find((country) => country.id === "US")?.regions;
    expect(worldChoices).toContainEqual({ id: "DC", name: "District of Columbia" });
    expect(worldChoices?.[0]?.id).not.toBe("DC");
  });

  it("returns no home regions for an unknown country instead of inventing them", () => {
    expect(creationChoices("1953", "XX").homeRegions).toEqual([]);
  });
});
