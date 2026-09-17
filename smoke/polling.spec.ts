import { test, expect } from "@playwright/test";
import {
  completeCharacterCreation,
  gameReady,
  navigateGame,
} from "./game-navigation";

/**
 * Issue #38: commission a real quick poll through the shared mobile UI.
 * New players arrive with the reference creation endowment
 * (gameConfig.startingFunds 250_000), so the quick poll is commissionable
 * on arrival; the flow commissions under Intelligence and reads the stored
 * results in Latest polls.
 */
test("intelligence quick poll commissions and displays stored results", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await page.getByLabel("Your name").fill("Poll Reader");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await completeCharacterCreation(page);
  await gameReady(page);
  await navigateGame(page, "Actions");

  // Intelligence tab: the endowed quick poll is commissionable on arrival.
  await page.getByRole("tab", { name: /^Intelligence,/ }).click();
  const quickCard = page.getByRole("article", { name: "Quick Poll" });
  await expect(
    quickCard.getByRole("button", { name: "Take action: Quick Poll" }),
  ).toBeEnabled();

  // Commission the quick poll and read the stored results.
  await page.getByRole("tab", { name: /^Intelligence,/ }).click();
  await quickCard
    .getByRole("button", { name: "Take action: Quick Poll" })
    .click();
  await gameReady(page);
  const latest = page.getByRole("region", { name: "Latest polls" });
  await expect(
    latest.getByRole("article", { name: "Quick Poll" }),
  ).toBeVisible();
  await expect(latest.getByText(/likely voters/)).toBeVisible();
  await expect(latest.getByText(/Strongest groups/)).toBeVisible();
  await expect(latest.getByText(/Weakest groups/)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/smoke/polling-390.png",
    fullPage: true,
  });
});
