import { expect, it } from "vitest";
import { GameSession } from "./session";

it("browses a different region without moving home, changing country or modifying the save", () => {
  const session = new GameSession();
  expect(() => session.regions()).toThrow("Start or load");
  session.create({ era: "1953", countryId: "US", seed: "region-session", playerName: "Ada" });
  const before = session.serialize("2026-09-10T00:00:00Z");
  const initial = session.regions();
  const other = initial.directory.find(region => !region.isHome)!;
  const selected = session.regions({ regionId: other.id });
  expect(selected.selected?.id).toBe(other.id);
  expect(selected.playerHomeRegionId).toBe(initial.playerHomeRegionId);
  expect(selected.playerCountryId).toBe("US");
  selected.selected!.name = "Detached display";
  expect(session.regions({ regionId: other.id }).selected?.name).toBe(other.name);
  expect(session.serialize("2026-09-10T00:00:00Z")).toBe(before);
  const resumed = new GameSession();
  resumed.load(before);
  expect(resumed.regions()).toEqual(initial);
});
