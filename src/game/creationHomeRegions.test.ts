/**
 * creationChoices home-region context (#242 slice, red).
 *
 * The creation screen needs source-grounded population and electorate
 * lean per home region. This context is display-only: it must never leak
 * into the persisted CharacterCreation record or the save.
 */
import { describe, expect, it } from "vitest";
import { creationChoices } from "./session";

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

  it("returns no home regions for an unknown country instead of inventing them", () => {
    expect(creationChoices("1953", "XX").homeRegions).toEqual([]);
  });
});
