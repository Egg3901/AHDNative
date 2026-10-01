import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { advanceTurn, createWorld, deserializeSave, executeAction, serializeSave } from "@ahdclient/engine";
import {
  advanceGame,
  gameReady,
  loadFixture,
  navigateGame,
  saveGame,
} from "./game-navigation";

let eligibleSeatSave: Buffer | undefined;
let eligibleTaoiseachSave: Buffer | undefined;

function playableIrishSeatSave(): Buffer {
  if (eligibleSeatSave) return Buffer.from(eligibleSeatSave);
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
  eligibleSeatSave = Buffer.from(serializeSave(world, "2026-10-01T00:00:00.000Z"));
  return Buffer.from(eligibleSeatSave);
}

function sourceTaoiseachWorld() {
  const world = deserializeSave(playableIrishSeatSave().toString("utf8"));
  const nomination = executeAction(world, "player", "proposePmAppointment");
  if (!nomination.ok) throw new Error(`Source PM nomination failed: ${nomination.error}`);
  const vote = world.pmAppointmentVotes.at(-1);
  if (!vote) throw new Error("The source PM nomination did not create an appointment vote");
  const cast = executeAction(world, "player", "votePmAppointment", {
    pmAppointmentVoteId: vote.id,
    pmVote: "aye",
  });
  if (!cast.ok) throw new Error(`Source PM appointment vote failed: ${cast.error}`);
  for (let turn = 0; turn < 30 && vote.status === "active"; turn++) advanceTurn(world);
  if (vote.status !== "passed" || world.governments.IE?.pmPoliticianId !== "player") {
    throw new Error(`Source PM appointment did not pass: ${vote.status} at turn ${world.meta.turn}`);
  }
  return world;
}

function playableIrishTaoiseachSave(): Buffer {
  if (eligibleTaoiseachSave) return Buffer.from(eligibleTaoiseachSave);
  eligibleTaoiseachSave = Buffer.from(serializeSave(sourceTaoiseachWorld(), "2026-10-01T00:00:00.000Z"));
  return Buffer.from(eligibleTaoiseachSave);
}

function signedIrishVatSave(): Buffer {
  const artifactPath = process.env.AHD_IE_VAT_SAVE_FIXTURE;
  if (artifactPath) {
    const save = readFileSync(artifactPath);
    const manifest = JSON.parse(readFileSync(`${artifactPath}.manifest.json`, "utf8")) as {
      schema?: string;
      nativeCommit?: string;
      gameCommit?: string;
      saveSha256?: string;
      signingState?: { rate?: number; target?: number };
      convergenceState?: { rate?: number; target?: number | null };
    };
    const saveSha256 = createHash("sha256").update(save).digest("hex");
    if (manifest.schema !== "ahdnative-ireland-vat-source-earned-fixture-v1") throw new Error("Irish VAT fixture manifest schema mismatch");
    if (manifest.nativeCommit !== "6dad514de33785776952ef291f49fe184b73570b") throw new Error("Irish VAT fixture was not generated from the frozen Native source commit");
    if (manifest.gameCommit !== "cb66acdf0129616b8a09902727e9b58715c8bacb") throw new Error("Irish VAT fixture source commit mismatch");
    if (manifest.saveSha256 !== saveSha256) throw new Error("Irish VAT fixture checksum mismatch");
    if (manifest.signingState?.rate !== 22 || manifest.signingState.target !== 23) throw new Error("Irish VAT fixture lacks the source signing-turn phase-in state");
    if (manifest.convergenceState?.rate !== 23 || manifest.convergenceState.target !== null) throw new Error("Irish VAT fixture lacks the source next-turn convergence state");
    return save;
  }
  const world = deserializeSave(playableIrishTaoiseachSave().toString("utf8"));
  const proposed = executeAction(world, "player", "sponsorBill", {
    catalogId: "ie_vat_rate",
    taxRate: 23,
  });
  if (!proposed.ok) throw new Error(`Source VAT proposal failed: ${proposed.error}`);
  const bill = world.bills.at(-1);
  if (!bill) throw new Error("The source VAT proposal did not create a bill");
  for (let turn = 0; turn < 24 && bill.status !== "signed" && bill.status !== "failed"; turn++) {
    advanceTurn(world);
    if (bill.status === "active" && !bill.votes.player) {
      const vote = executeAction(world, "player", "voteOnBill", { billId: bill.id, vote: "for" });
      if (!vote.ok) throw new Error(`Source VAT vote failed: ${vote.error}`);
    }
  }
  if (bill.status !== "signed" || world.budgets.IE?.taxRates.salesTax !== 22 || world.budgets.IE?.taxRatePhaseIn?.salesTax !== 23) {
    throw new Error(`Source VAT bill did not begin its signing-turn phase-in: ${bill.status}, rate ${world.budgets.IE?.taxRates.salesTax}, target ${world.budgets.IE?.taxRatePhaseIn?.salesTax}`);
  }
  // The source signing turn moves 21% to 22%; a following normal turn reaches
  // the authored 23% target. Save the fixture after that source turn boundary.
  advanceTurn(world);
  if (world.budgets.IE?.taxRates.salesTax !== 23 || world.budgets.IE.taxRatePhaseIn?.salesTax !== undefined) {
    throw new Error(`Source VAT phase-in did not converge after the next turn: rate ${world.budgets.IE?.taxRates.salesTax}, target ${world.budgets.IE?.taxRatePhaseIn?.salesTax}`);
  }
  return Buffer.from(serializeSave(world, "2026-10-01T00:00:00.000Z"));
}

async function advanceUntilVote(page: import("@playwright/test").Page, title: string) {
  const vote = page.getByRole("button", { name: `For on ${title}`, exact: true });
  for (let turn = 0; turn < 12 && !(await vote.isVisible()); turn++) {
    await advanceGame(page, { turnTimeoutMs: 180_000 });
  }
  await expect(vote).toBeVisible();
  await vote.click();
  await gameReady(page);
}

async function advanceUntilLatestBillSigned(page: import("@playwright/test").Page, title: string) {
  // Completed bills are projected newest-first, so replacement checks must
  // follow the first matching article rather than the superseded older bill.
  const latestBill = page.getByRole("article", { name: title, exact: true }).first();
  const statusLine = latestBill.locator("div.ahd-muted").first();
  for (
    let turn = 0;
    turn < 12 && !(await statusLine.innerText().catch(() => "")).startsWith("signed ·");
    turn++
  ) {
    await advanceGame(page, { turnTimeoutMs: 180_000 });
  }
  await expect(statusLine).toContainText(/^signed · Sponsored by /);
}

async function openLegislation(page: import("@playwright/test").Page) {
  await navigateGame(page, "Bills and proposals");
  await expect(page.getByLabel("Available legislation", { exact: true })).toBeEnabled();
}

test("Irish party chair nominates a Taoiseach through the Dáil and resumes the passed appointment", async ({ page }, testInfo) => {
  test.setTimeout(1_800_000);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");
  await loadFixture(page, playableIrishSeatSave());
  await gameReady(page);
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
  const appointment = page.getByRole("article", { name: "Taoiseach appointment vote for Irish VAT Player", exact: true });
  await expect(taoiseach).toBeVisible();
  await expect(appointment).toContainText("passed");
  await expect(appointment).toContainText("153 ayes");
  await saveGame(page);
  await page.reload();
  await page.getByRole("button", { name: "Continue Irish VAT Player", exact: true }).click();
  await gameReady(page);
  await navigateGame(page, "Legislature");
  await expect(page.getByText("Taoiseach: Irish VAT Player", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("ireland-taoiseach-320.png"), fullPage: true });
});

test("Irish PM proposes, passes and resumes the authored 23% VAT bill", async ({ page }, testInfo) => {
  test.setTimeout(1_800_000);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");
  await loadFixture(page, playableIrishTaoiseachSave());
  await gameReady(page);
  await navigateGame(page, "Legislature");
  await expect(page.getByText("Taoiseach: Irish VAT Player", { exact: true })).toBeVisible();
  await openLegislation(page);
  await page.getByLabel("Available legislation", { exact: true }).selectOption("ie_vat_rate");
  await page.getByLabel("Tax rate", { exact: true }).selectOption("23");
  await expect(page.getByText("Cost 10 actions + 5 national influence", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sponsor bill", exact: true }).click();
  const vatTitle = "Statutory Value-Added Tax Act";
  await advanceUntilVote(page, vatTitle);
  await advanceUntilLatestBillSigned(page, vatTitle);
  const signedBill = page.getByRole("article", { name: vatTitle, exact: true }).last();
  await signedBill.getByRole("button", { name: `Show details for ${vatTitle}`, exact: true }).click();
  await expect(page.getByText("Selected rate: 23%", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("ireland-vat-320-bill.png"), fullPage: true });
  await saveGame(page);
  await page.reload();
  await page.getByRole("button", { name: "Continue Irish VAT Player", exact: true }).click();
  await gameReady(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openLegislation(page);
  const resumedBill = page.getByRole("article", { name: vatTitle, exact: true }).last();
  await resumedBill.getByRole("button", { name: `Show details for ${vatTitle}`, exact: true }).click();
  await expect(page.getByText("Selected rate: 23%", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("ireland-vat-390-resumed.png"), fullPage: true });
});

test("Irish PM replaces VAT through a source bill and resumes its saved fiscal phase", async ({ context }, testInfo) => {
  test.setTimeout(1_800_000);
  // Load the full-history source-earned save before opening a page so its
  // synchronous deserialization does not consume the browser journey budget.
  let fixture = signedIrishVatSave();
  const page = await context.newPage();
  page.on("crash", () => {
    const memory = process.memoryUsage();
    process.stderr.write(`[IE VAT smoke] page crashed at ${new Date().toISOString()}; test-worker rss=${memory.rss} heap=${memory.heapUsed} external=${memory.external}\n`);
  });
  page.on("pageerror", (error) => {
    process.stderr.write(`[IE VAT smoke] page error at ${new Date().toISOString()}: ${error.stack ?? error.message}\n`);
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await loadFixture(page, fixture);
  fixture = Buffer.alloc(0);
  await gameReady(page);
  await openLegislation(page);
  const vatTitle = "Statutory Value-Added Tax Act";
  const priorBillCount = await page.getByRole("article", { name: vatTitle, exact: true }).count();
  const rateSelector = page.getByLabel("Tax rate", { exact: true });
  await rateSelector.selectOption("25");
  await expect(page.getByRole("button", { name: "Sponsor bill", exact: true })).toBeEnabled();
  await expect(page.getByText("Cost 10 actions + 5 national influence", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sponsor bill", exact: true }).click();
  await expect(page.getByRole("article", { name: vatTitle, exact: true })).toHaveCount(priorBillCount + 1);
  await advanceUntilVote(page, vatTitle);
  await advanceUntilLatestBillSigned(page, vatTitle);
  // Completed bills are newest-first; the first card is the newly signed
  // replacement, while the last card is the older 23% enactment.
  const replacement = page.getByRole("article", { name: vatTitle, exact: true }).first();
  await replacement.getByRole("button", { name: `Show details for ${vatTitle}`, exact: true }).click();
  await expect(page.getByText("Selected rate: 25%", { exact: true })).toBeVisible();
  await saveGame(page);
  await page.reload();
  await page.getByRole("button", { name: "Continue Irish VAT Player", exact: true }).click();
  await gameReady(page);
  await openLegislation(page);
  const resumedReplacement = page.getByRole("article", { name: vatTitle, exact: true }).first();
  await resumedReplacement.getByRole("button", { name: `Show details for ${vatTitle}`, exact: true }).click();
  await expect(page.getByText("Selected rate: 25%", { exact: true })).toBeVisible();
  await navigateGame(page, "Policy");
  const currentTax = page.locator("dt").filter({ hasText: "Sales Tax" });
  await expect(currentTax).toHaveCount(1);
  const beforeTurn = Number.parseFloat((await currentTax.locator("xpath=.. >> dd").innerText()).replace("%", ""));
  // The source signing turn moves 23% to 24%; the next ordinary turn reaches
  // the authored 25% target, matching the engine lifecycle vectors.
  expect(beforeTurn).toBe(24);
  await advanceGame(page, { turnTimeoutMs: 180_000 });
  await navigateGame(page, "Policy");
  await expect(page.getByRole("heading", { name: "Current tax settings", exact: true })).toBeVisible();
  await expect(currentTax.locator("xpath=.. >> dd")).toHaveText("25.0%");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("ireland-vat-390-policy.png"), fullPage: true });
  await page.setViewportSize({ width: 320, height: 844 });
  await expect(currentTax.locator("xpath=.. >> dd")).toHaveText("25.0%");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("ireland-vat-320-policy.png"), fullPage: true });
});
