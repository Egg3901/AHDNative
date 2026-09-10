import { expect, it } from "vitest";
import { GameSession } from "./session";

it("exposes the selected country's real national data without changing its saved world", () => {
  const session = new GameSession();
  session.create({ era: "1953", countryId: "UK", seed: "nation-detail", playerName: "Alex" });
  const before = session.serialize("2026-09-10T00:00:00.000Z");
  const world = JSON.parse(before).world;
  const nation = session.view().nation;
  expect(nation.countryId).toBe("UK");
  expect(nation.budget.currency).toBe("GBP");
  expect(nation.budget.gdpAbsolute).toBe(world.budgets.UK.gdp);
  expect(nation.economy.gdpMillions).toBe(world.countries.UK.economy.gdp);
  expect(nation.economy.primeRate).toBe(world.centralBanks.UK.primeRate);
  nation.budget.taxRates.length = 0;
  expect(session.serialize("2026-09-10T00:00:00.000Z")).toBe(before);
});
