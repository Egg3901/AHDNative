import { test, expect } from "@playwright/test";
import { advanceTurn, createWorld, executeAction, serializeSave } from "@ahdclient/engine";
import {
  advanceGame,
  gameReady,
  loadFixture,
  navigateGame,
  saveGame,
} from "./game-navigation";

function playableIrishSeatSave(): Buffer {
  const world = createWorld({
    seed: "ie-seat-region-scan",
    playerName: "Irish VAT Player",
    countryId: "IE",
    era: "1991",
    stats: { charisma: 10, debate: 3, energy: 3, fundraising: 3, businessAcumen: 3, statecraft: 3, intellect: 3 },
  });
  world.nppAutonomyLevel = "off";
  world.player.mode = "career";
  world.player.homeRegionId = "COR";
  if (!executeAction(world, "player", "joinParty", { partyId: "IE_FF" }).ok) {
    throw new Error("Expected player to join the source-seeded Irish party through the public action");
  }
  // Eligibility is produced by the normal turn pipeline, campaign actions,
  // ballot accumulation, and election resolvers. This is a deterministic
  // starting-save bootstrap, not a browser-driven 96-turn career speedrun.
  for (let turn = 0; turn < 96; turn++) {
    advanceTurn(world);
    const dailElection = world.elections.find(
      (election) => election.countryId === "IE" && election.electionType === "dail" && election.state === "COR" && election.status === "active",
    );
    if (dailElection && !dailElection.candidates.some((candidate) => candidate.id === "player")) {
      executeAction(world, "player", "declareCandidacy", { electionId: dailElection.id });
    }
    if (dailElection?.candidates.some((candidate) => candidate.id === "player")) {
      executeAction(world, "player", "campaign", {});
      executeAction(world, "player", "advertise", {});
    }

    for (const ballot of world.nationalPartyElections) {
      if (ballot.partyId !== "IE_FF" || ballot.position !== "chair" || ballot.status !== "voting") continue;
      if (!ballot.candidateIds.includes("player")) {
        executeAction(world, "player", "contestPartyLeadership", { intrapartyElectionId: ballot.id });
      }
      if (ballot.candidateIds.includes("player") && !ballot.votes.player) {
        executeAction(world, "player", "votePartyLeadership", { intrapartyElectionId: ballot.id, candidateId: "player" });
      }
    }
  }
  if (world.player.legislativeSeat?.countryId !== "IE" || world.player.legislativeSeat.chamberKey !== "dail") {
    throw new Error("Expected normal Irish Dáil election phases to award the player a seat");
  }
  if (world.parties.IE_FF?.chairId !== "player") {
    throw new Error("Expected normal Irish party-election phases to award the player the party chair");
  }
  return Buffer.from(serializeSave(world, "2026-10-01T00:00:00.000Z"));
}

test("Irish VAT bill proposal, vote, enactment, replacement, save and resumed fiscal phase at phone widths", async ({
  page,
}, testInfo) => {
  test.setTimeout(1_800_000);
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
      await advanceGame(page, { turnTimeoutMs: 180_000 });
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
      await advanceGame(page, { turnTimeoutMs: 180_000 });
    }
    await expect(bill).toContainText("signed");
  };
  const currentSalesTaxRate = async () => {
    const term = page.locator("dt").filter({ hasText: "Sales Tax" });
    await expect(term).toHaveCount(1);
    const rate = await term.locator("xpath=.. >> dd").innerText();
    return Number.parseFloat(rate.replace("%", ""));
  };

  await navigateGame(page, "Legislature");
  await expect(page.getByRole("region", { name: "Dáil government formation" })).toContainText("Your party chair may nominate a Taoiseach candidate.");
  await page.getByRole("button", { name: "Nominate yourself as Taoiseach", exact: true }).click();
  await gameReady(page);
  await expect(page.getByRole("article", { name: "Taoiseach appointment vote for Irish VAT Player" })).toContainText("active");
  await page.getByRole("button", { name: "Aye on Taoiseach appointment for Irish VAT Player", exact: true }).click();
  await gameReady(page);
  const taoiseach = page.getByText("Taoiseach: Irish VAT Player", { exact: true });
  for (let turn = 0; turn < 30 && !(await taoiseach.isVisible().catch(() => false)); turn++) {
    await advanceGame(page, { turnTimeoutMs: 180_000 });
  }
  await expect(taoiseach).toBeVisible();
  await saveGame(page);
  await page.reload();
  await page.getByRole("button", { name: "Continue Irish VAT Player", exact: true }).click();
  await gameReady(page);
  await navigateGame(page, "Legislature");
  await expect(page.getByText("Taoiseach: Irish VAT Player", { exact: true })).toBeVisible();
  await navigateGame(page, "Profile");
  const influenceTerm = page.locator("dt").filter({ hasText: "National influence" });
  await expect(influenceTerm).toHaveCount(1);
  const currentInfluence = await influenceTerm.locator("xpath=.. >> dd").innerText();
  expect(Number.parseFloat(currentInfluence)).toBeGreaterThanOrEqual(5);

  await openLegislation();
  await page
    .getByLabel("Available legislation", { exact: true })
    .selectOption("ie_vat_rate");
  await page.getByLabel("Tax rate", { exact: true }).selectOption("23");
  const sponsorBill = page.getByRole("button", {
    name: "Sponsor bill",
    exact: true,
  });
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
    await advanceGame(page, { turnTimeoutMs: 180_000 });
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
  await advanceGame(page, { turnTimeoutMs: 180_000 });
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
