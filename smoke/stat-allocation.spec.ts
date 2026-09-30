import { expect, test } from "@playwright/test";
import { GameSession } from "../src/game/session";
import { advanceGame, completeCharacterCreation, gameReady, loadFixture, navigateGame } from "./game-navigation";

// AHDGame 6ed11a3: own Profile one-free-reset control, 28-point allocator,
// and grandfather gate/reminder. Uses the real App, worker, local save/resume.
for (const width of [320, 390, 1280]) {
  test(`stat reset is free, single use, saved and ruleset gated at ${width}px`, async ({ page }, info) => {
    test.setTimeout(180_000); // Creation, a turn and two complete close/resume cycles.
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "New game", exact: true }).click();
    await page.getByLabel("Your name").fill("Stat Player");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await completeCharacterCreation(page);
    await gameReady(page);
    const stats = page.getByRole("region", { name: "Character stats" });
    const finances = page.getByRole("region", { name: "Finances", exact: true });
    const cashBefore = await finances.innerText();
    await stats.getByRole("button", { name: "Reallocate (1 free)" }).click();
    let dialog = page.getByRole("dialog", { name: "Reallocate Your Stats" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Confirm Reallocation" })).toBeDisabled();
    await expect(dialog).toContainText("resets any growth");
    await page.screenshot({ path: info.outputPath(`stat-reset-${width}.png`) });
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    // Escape cancels without spending the free reset.
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await stats.getByRole("button", { name: "Reallocate (1 free)" }).click();
    dialog = page.getByRole("dialog", { name: "Reallocate Your Stats" });
    await dialog.getByRole("button", { name: "Spread evenly" }).click();
    await expect(dialog.getByLabel("Energy value")).toHaveText("4");
    await dialog.getByRole("button", { name: "Confirm Reallocation" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(stats.getByRole("button", { name: "Reallocate (1 free)" })).toHaveCount(0);
    await expect(finances).toHaveText(cashBefore, { useInnerText: true });
    await expect(page.getByRole("region", { name: "Political standing" })).toContainText("25 / 217");
    const statText = await stats.innerText();
    await advanceGame(page);
    await expect(page.getByRole("contentinfo")).toContainText("Turn 1");
    await page.reload();
    await page.getByRole("button", { name: "Continue Stat Player" }).click();
    await gameReady(page);
    await expect(stats).toHaveText(statText, { useInnerText: true });
    await expect(stats.getByRole("button", { name: "Reallocate (1 free)" })).toHaveCount(0);
    await navigateGame(page, "World settings");
    const rpgToggle = page.getByRole("checkbox", { name: "Character stats", exact: true });
    // The controlled value updates after the worker confirms and saves it.
    await rpgToggle.click();
    await expect(rpgToggle).not.toBeChecked();
    await navigateGame(page, "Profile");
    await expect(stats).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Political standing" })).toContainText("/ 200");
    await page.reload();
    await page.getByRole("button", { name: "Continue Stat Player" }).click();
    await gameReady(page);
    await expect(stats).toHaveCount(0);
    await navigateGame(page, "World settings");
    await rpgToggle.click();
    await expect(rpgToggle).toBeChecked();
    await navigateGame(page, "Profile");
    await expect(stats).toHaveText(statText, { useInnerText: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("legacy stat gate can defer, resume its reminder, allocate and persist", async ({ page }) => {
  // Engine-built Native pre-allocation fixture; current Game SP interchange
  // is a separate acceptance gate. No existing stat block is edited.
  const session = new GameSession();
  session.create({ era: "1953", countryId: "US", seed: "legacy-stat-gate", playerName: "Legacy Player" });
  await page.goto("/");
  await loadFixture(page, Buffer.from(session.serialize("2026-09-30T00:00:00.000Z")));
  await gameReady(page, { keepStatAllocationGate: true });
  let dialog = page.getByRole("dialog", { name: "Allocate Your Stats" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Maybe later" }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Continue Legacy Player" }).click();
  await gameReady(page, { keepStatAllocationGate: true });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Return to stats" }).click();
  dialog = page.getByRole("dialog", { name: "Allocate Your Stats" });
  await dialog.getByRole("button", { name: "Reset" }).click();
  await dialog.getByRole("button", { name: "Spread evenly" }).click();
  await dialog.getByRole("button", { name: "Lock In Stats" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reallocate (1 free)" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Continue Legacy Player" }).click();
  await gameReady(page, { keepStatAllocationGate: true });
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reallocate (1 free)" })).toBeVisible();
});
