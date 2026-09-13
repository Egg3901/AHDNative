import { expect, it } from "vitest";
import { createWorld } from "@ahdclient/engine";
import { projectNation } from "./nation";
import { GameSession } from "./session";

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

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

it("exposes the full recorded budget breakdown with country-specific labels and links", () => {
  const session = new GameSession();
  session.create({ era: "1953", countryId: "UK", seed: "nation-budget", playerName: "Alex" });
  const world = JSON.parse(session.serialize("2026-09-10T00:00:00.000Z")).world;
  const budget = session.view().nation.budget;

  // Country vocabulary replaces the generic key labels.
  expect(budget.labels.title).toBe("HM Treasury Budget");
  expect(budget.labels.revenueTitle).toBe("Receipts");
  expect(budget.labels.spendingTitle).toBe("Expenditure by Category");
  expect(budget.labels.debtTitle).toBe("Public Debt");
  expect(budget.labels.debtServiceLabel).toBe("Debt Interest");
  expect(budget.labels.ceilingLabel).toBe("Borrowing Limit");

  // Every recorded revenue component and spending category is present, in the
  // engine's own keys, labelled with the country term.
  expect(budget.revenue.components.map((line) => line.id))
    .toEqual(Object.keys(world.budgets.UK.revenue).filter((id) => id !== "total"));
  expect(budget.revenue.components.find((line) => line.id === "payrollTax")?.label).toBe("National Insurance");
  expect(budget.spending.categories.map((line) => line.id).sort())
    .toEqual(Object.keys(world.budgets.UK.spending.byCategory).sort());
  expect(budget.spending.categories.find((line) => line.id === "health")?.label).toBe("Health / NHS");

  // Surplus, treasury, transfer, debt service and debt are the recorded values.
  expect(budget.revenue.total).toBe(world.budgets.UK.revenue.total);
  expect(budget.spending.total).toBe(world.budgets.UK.spending.total);
  expect(budget.spending.stateGrants).toBe(world.budgets.UK.spending.stateGrants);
  expect(budget.spending.debtInterest).toBe(world.budgets.UK.spending.debtInterest);
  // Transfer recipients are the recorded per-region grants, not a re-derivation.
  expect(budget.spending.transfers.length).toBeGreaterThan(0);
  for (const transfer of budget.spending.transfers) {
    expect(transfer.name).toBe(world.regions[transfer.id].name);
    expect(transfer.amount).toBe(world.regionalBudgets[transfer.id].revenue.grant);
  }
  expect(budget.surplus).toBe(world.budgets.UK.surplus);
  expect(budget.treasuryBalance).toBe(world.budgets.UK.treasuryBalance);
  expect(budget.debt.principal).toBe(world.budgets.UK.debt.principal);
  expect(budget.debt.ceiling).toBe(world.budgets.UK.debt.ceiling);

  // Linked consequence destinations.
  expect(budget.links.map((link) => link.route)).toEqual(["policy", "nations", "legislature", "elections"]);
});

it("projects the political metrics registry with recorded values, formats, and history", () => {
  const session = new GameSession();
  session.create({ era: "1953", countryId: "US", seed: "nation-metrics", playerName: "Ada" });
  session.advance();
  const world = JSON.parse(session.serialize("2026-09-10T00:00:00.000Z")).world;
  const metrics = session.view().nation.metrics;

  expect(metrics.total).toBeGreaterThan(0);
  const all = metrics.categories.flatMap((category) => category.metrics);
  const ids = all.map((metric) => metric.id);

  // Every recorded national metric row appears, and no empty family is shown.
  for (const key of Object.keys(world.nationalMetrics.US)) {
    expect(ids).toContain(key);
  }
  expect(metrics.categories.every((category) => category.metrics.length > 0)).toBe(true);

  // The approval gauge comes from the country's own political overview.
  const approval = all.find((metric) => metric.id === "governance.approval");
  expect(approval?.value).toBe(world.countryPolitics.US.approval);
  expect(approval?.format).toBe("percent");
  expect(approval?.history).toEqual(
    world.countryPolitics.US.approvalHistory.map((sample: { turn: number; approval: number }) => ({
      turn: sample.turn,
      value: sample.approval,
    })),
  );

  // Economic rates carry their macro history and read as percentages.
  const growth = all.find((metric) => metric.id === "economic.gdpGrowth");
  expect(growth?.format).toBe("percent");
  expect(growth?.value).toBe(round3(world.nationalMetrics.US["economic.gdpGrowth"].value));
  expect(growth?.history).toEqual(
    world.history.macro.US.map((point: { turn: number; growthRate: number }) => ({
      turn: point.turn,
      value: round3(point.growthRate * 100),
    })),
  );

  // A recorded law-targeted metric with no snapshot series has no invented history.
  const lawTargeted = all.find((metric) => metric.id === "economy.workerSecurity");
  expect(lawTargeted).toBeDefined();
  expect(lawTargeted?.history).toEqual([]);

  // Metric rows link to the destinations their consequence is realized through.
  expect(growth?.links.map((link) => link.route)).toEqual(["economy", "budget"]);
  expect(approval?.links.map((link) => link.route)).toEqual(["policy", "legislature", "elections"]);
});

it("records approval modifiers only from active crises that name the country", () => {
  const world = createWorld({ era: "1953", countryId: "US", playerName: "Ada", seed: "nation-modifiers" });
  world.crises.push({
    id: "crisis-test",
    kind: "recession",
    name: "Global Recession",
    description: "A downturn.",
    scope: "country",
    countryIds: ["US"],
    startTurn: 0,
    durationTurns: 6,
    effects: [
      { type: "approval", value: -4, effectType: "tick" },
      { type: "gdpGrowth", value: -2, effectType: "tick" },
    ],
    status: "active",
    wireMessageOnStart: "",
    wireMessageOnEnd: "",
  });

  const approvalOf = (state: typeof world) =>
    projectNation(state).metrics.categories.flatMap((category) => category.metrics)
      .find((metric) => metric.id === "governance.approval");

  expect(approvalOf(world)?.modifiers).toEqual([
    { id: "crisis-test:approval", label: "Global Recession", effect: -4, effectType: "tick", source: "crisis" },
  ]);

  world.crises[0]!.status = "resolved";
  expect(approvalOf(world)?.modifiers).toEqual([]);
});

it("keeps budget and metric histories consistent across save, reload, and a turn", () => {
  const session = new GameSession();
  session.create({ era: "1953", countryId: "US", seed: "nation-history", playerName: "Ada" });
  session.advance();

  const saved = session.serialize("2026-09-10T00:00:00.000Z");
  const savedWorld = JSON.parse(saved).world;
  const reloaded = new GameSession();
  reloaded.load(saved);
  const before = reloaded.view().nation;

  expect(before.budget.revenue.total).toBe(savedWorld.budgets.US.revenue.total);
  expect(before.budget.treasuryBalance).toBe(savedWorld.budgets.US.treasuryBalance);
  const growthBefore = before.metrics.categories.flatMap((category) => category.metrics)
    .find((metric) => metric.id === "economic.gdpGrowth");
  expect(growthBefore?.history.length).toBe(1);

  reloaded.advance();
  const after = reloaded.view().nation;
  const afterWorld = JSON.parse(reloaded.serialize("2026-09-10T00:00:00.000Z")).world;

  expect(after.budget.revenue.total).toBe(afterWorld.budgets.US.revenue.total);
  expect(after.budget.surplus).toBe(afterWorld.budgets.US.surplus);
  const growthAfter = after.metrics.categories.flatMap((category) => category.metrics)
    .find((metric) => metric.id === "economic.gdpGrowth");
  expect(growthAfter?.history.length).toBe(2);
  expect(growthAfter?.history).toEqual(
    afterWorld.history.macro.US.map((point: { turn: number; growthRate: number }) => ({
      turn: point.turn,
      value: round3(point.growthRate * 100),
    })),
  );
  expect(after.budget.links.length).toBeGreaterThan(0);
});
