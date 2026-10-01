import { test, expect } from "@playwright/test";
import { createWorld, recomputeComposition, serializeSave } from "@ahdclient/engine";
import {
  advanceGame,
  gameReady,
  loadFixture,
  navigateGame,
  saveGame,
} from "./game-navigation";

function playableIrishSeatSave(): Buffer {
  const world = createWorld({
    seed: "ireland-vat-public-lifecycle",
    playerName: "Irish VAT Player",
    countryId: "IE",
    era: "1991",
  });
  world.nppAutonomyLevel = "off";
  world.player.legislativeSeat = { countryId: "IE", chamberKey: "dail" };
  world.player.actions = 200;
  world.player.nationalInfluence = 0;
  world.player.mode = "career";
  world.player.politicalInfluence = 100;
  world.player.partyId = Object.entries(
    world.legislatures.IE!.chambers[0]!.composition.seatsByParty,
  ).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
  recomputeComposition(world, "IE", "dail");
  // This controlled projection starts after the source formation vote so the
  // browser path can focus on the public bill lifecycle. The unmodified source
  // seed's pending formation freeze is asserted in engine + DTO/UI tests.
  const gov = world.governments.IE!;
  const chamber = world.legislatures.IE!.chambers.find((entry) => entry.key === "dail")!;
  const [partyId, seats] = Object.entries(chamber.composition.seatsByParty)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]!;
  const pm = world.politicians.find((person) => person.countryId === "IE" && person.chamberKey === "dail" && person.partyId === partyId)!;
  Object.assign(gov, {
    status: "formed",
    formationType: "minority",
    governingPartyId: partyId,
    coalitionPartyIds: null,
    pmPoliticianId: pm.id,
    totalSeatsSupporting: seats,
    totalSeats: chamber.seats,
    majorityThreshold: Math.floor(chamber.seats / 2) + 1,
    seatsByParty: { ...chamber.composition.seatsByParty },
    lostMajority: false,
    formedTurn: world.meta.turn,
    pmVacancyDeadlineTurn: null,
    confidence: 75,
  });
  return Buffer.from(serializeSave(world, "2026-10-01T00:00:00.000Z"));
}

test("Irish VAT bill proposal, vote, enactment, replacement, save and resumed fiscal phase at phone widths", async ({
  page,
}, testInfo) => {
  test.setTimeout(900_000);
  const save = playableIrishSeatSave();
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");
  await loadFixture(page, save);
  await gameReady(page);
  const openLegislation = async () => {
    await navigateGame(page, "Bills and proposals");
    await expect(
      page.getByLabel("Available legislation", { exact: true }),
    ).toBeEnabled();
  };
  const advanceUntilVote = async (title: string) => {
    const vote = page.getByRole("button", {
      name: `For on ${title}`,
      exact: true,
    });
    for (let turn = 0; turn < 12 && !(await vote.isVisible()); turn++)
      await advanceGame(page);
    await expect(vote).toBeVisible();
    await vote.click();
    await gameReady(page);
  };
  const advanceUntilSigned = async (title: string) => {
    const bill = page
      .getByRole("article", { name: title, exact: true })
      .first();
    for (
      let turn = 0;
      turn < 12 &&
      !(await bill
        .getByText("signed", { exact: true })
        .isVisible()
        .catch(() => false));
      turn++
    ) {
      await advanceGame(page);
    }
    await expect(bill).toContainText("signed");
  };
  const currentSalesTaxRate = async () => {
    const term = page.locator("dt").filter({ hasText: "Sales Tax" });
    await expect(term).toHaveCount(1);
    const rate = await term.locator("xpath=.. >> dd").innerText();
    return Number.parseFloat(rate.replace("%", ""));
  };

  await openLegislation();
  await page
    .getByLabel("Available legislation", { exact: true })
    .selectOption("ie_vat_rate");
  await page.getByLabel("Tax rate", { exact: true }).selectOption("23");
  const sponsorBill = page.getByRole("button", {
    name: "Sponsor bill",
    exact: true,
  });
  await expect(
    page.getByText("Not enough national influence (need 5).", { exact: true }),
  ).toBeVisible();
  for (let turn = 0; turn < 8 && !(await sponsorBill.isEnabled()); turn++)
    await advanceGame(page);
  await expect(sponsorBill).toBeEnabled();
  // Turn updates remount the details form, which resets the selector to the
  // enacted baseline. Choose the source witness again after office accrual.
  await page.getByLabel("Tax rate", { exact: true }).selectOption("23");
  await expect(
    page.getByText("Cost 10 actions + 5 national influence", { exact: true }),
  ).toBeVisible();
  await sponsorBill.click();
  const vatTitle = "Statutory Value-Added Tax Act";
  await advanceUntilVote(vatTitle);
  await advanceUntilSigned(vatTitle);
  const signedVat = page
    .getByRole("article", { name: vatTitle, exact: true })
    .first();
  await signedVat
    .getByRole("button", {
      name: `Show details for ${vatTitle}`,
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Selected rate: 23%", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("ireland-vat-320-bill.png"),
    fullPage: true,
  });
  await saveGame(page);
  await page.reload();
  await page
    .getByRole("button", { name: "Continue Irish VAT Player", exact: true })
    .click();
  await gameReady(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openLegislation();
  const resumedVat = page
    .getByRole("article", { name: vatTitle, exact: true })
    .first();
  await resumedVat
    .getByRole("button", {
      name: `Show details for ${vatTitle}`,
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Selected rate: 23%", { exact: true }),
  ).toBeVisible();

  const rateSelector = page.getByLabel("Tax rate", { exact: true });
  await rateSelector.selectOption("25");
  const replacementAction = page.getByRole("button", {
    name: "Sponsor bill",
    exact: true,
  });
  for (let turn = 0; turn < 8 && !(await replacementAction.isEnabled()); turn++)
    await advanceGame(page);
  await expect(replacementAction).toBeEnabled();
  await expect(
    page.getByText("Cost 10 actions + 5 national influence", { exact: true }),
  ).toBeVisible();
  await replacementAction.click();
  await advanceUntilVote(vatTitle);
  await advanceUntilSigned(vatTitle);
  await saveGame(page);
  await page.reload();
  await page
    .getByRole("button", { name: "Continue Irish VAT Player", exact: true })
    .click();
  await gameReady(page);
  await openLegislation();
  const resumedReplacement = page
    .getByRole("article", { name: vatTitle, exact: true })
    .first();
  await resumedReplacement
    .getByRole("button", {
      name: `Show details for ${vatTitle}`,
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Selected rate: 25%", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("ireland-vat-390-replacement.png"),
    fullPage: true,
  });
  await navigateGame(page, "Policy");
  const beforeContinuedTurn = await currentSalesTaxRate();
  expect(beforeContinuedTurn).toBeGreaterThanOrEqual(23);
  expect(beforeContinuedTurn).toBeLessThanOrEqual(25);
  await advanceGame(page);
  await navigateGame(page, "Policy");
  await expect(
    page.getByRole("heading", { name: "Current tax settings", exact: true }),
  ).toBeVisible();
  // AHDGame taxRatePhaseIn steps the active rate by at most one percentage
  // point per turn toward the persisted selected 25% target.
  expect(await currentSalesTaxRate()).toBe(Math.min(25, beforeContinuedTurn + 1));
  await page.screenshot({
    path: testInfo.outputPath("ireland-vat-390-policy.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("ireland-vat-320-policy.png"),
    fullPage: true,
  });
});
