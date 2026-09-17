import { expect, test } from "@playwright/test";
import {
  gameReady,
  navigateGame,
  completeCharacterCreation,
} from "./game-navigation";

test("a player receives the quoted Fundraise yield and continues after relaunch", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await page.getByLabel("Your name").fill("Donor Player");
  await page.getByLabel("Country", { exact: true }).selectOption("US");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await completeCharacterCreation(page);
  await gameReady(page);
  await navigateGame(page, "Actions");
  await expect(
    page.getByRole("button", { name: "Take action: Fundraise", exact: true }),
  ).toBeEnabled();
  // AHDGame L1/0% Fundraise yields 52,000 at neutral stats; the creation file
  // leaves Fundraising at its floor (1), so the efficacy multiplier is 0.82 and
  // the quoted/credited yield is 42,640. Quote and grant read one source.
  await expect(
    page.getByText("Raises 42,640 campaign funds", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/smoke/mobile-shared-fundraise.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Take action: Fundraise", exact: true })
    .click();
  await gameReady(page);
  await navigateGame(page, "Profile");
  await expect(
    page.getByRole("region", { name: "Political standing" }),
  ).toContainText("22 / 200");
  await expect(
    page.getByText("Campaign funds", { exact: true }).locator(".."),
  ).toContainText("292,640");
  await page.reload();
  await page
    .getByRole("button", { name: "Continue Donor Player", exact: true })
    .click();
  await gameReady(page);
  await expect(
    page.getByText("Campaign funds", { exact: true }).locator(".."),
  ).toContainText("292,640");
  await navigateGame(page, "Actions");
  await expect(
    page.getByText("Raises 42,640 campaign funds", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Take action: Fundraise", exact: true })
    .click();
  await gameReady(page);
  await navigateGame(page, "Profile");
  await expect(
    page.getByRole("region", { name: "Political standing" }),
  ).toContainText("19 / 200");
  await expect(
    page.getByText("Campaign funds", { exact: true }).locator(".."),
  ).toContainText("335,280");
});
