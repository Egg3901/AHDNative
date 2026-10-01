import { expect, test } from '@playwright/test';
import { deserializeSave, serializeSave } from '@ahdclient/engine';
import { GameSession } from '../src/game/session';
import { gameReady, loadFixture, navigateGame, saveGame, openGameMenu } from './game-navigation';

const SAVED_AT = '2026-10-01T00:00:00.000Z';

async function advanceExtractionTurn(page: import('@playwright/test').Page) {
  await openGameMenu(page);
  const endTurn = page.getByRole('button', { name: 'End turn', exact: true });
  await expect(endTurn).toBeEnabled();
  await endTurn.click();
  // The source-sized worker processes the full seeded world; a real end-turn
  // action can take tens of seconds in headless Chromium. This keeps the test
  // on the actual button path while allowing a bounded 90s worker settle.
  await expect(endTurn).toBeEnabled({ timeout: 90_000 });
  await gameReady(page);
}

function eligibleExtractionSave() {
  const session = new GameSession();
  // US corporate CEO candidacy is source-gated to the recorded HQ region (DC).
  // The player exercises the separate Texas state-issuer path below.
  session.create({ era: '1953', countryId: 'US', homeRegionId: 'DC', seed: 'regional-extraction-browser', playerName: 'Extraction Operator' });
  expect(session.act('buyShares', { corpId: 'US-extraction', shares: 1 }).ok).toBe(true);
  const vote = session.act('voteCeo', { corpId: 'US-extraction', candidateId: 'player' });
  expect(vote.ok, vote.error).toBe(true);
  const appointment = session.act('acceptCeoAppointment', { corpId: 'US-extraction' });
  expect(appointment.ok, appointment.error).toBe(true);

  const world = deserializeSave(session.serialize(SAVED_AT));
  world.player.actions = 100;
  world.enactedLaws.push({ id: 'resource_extraction_authority', countryId: 'US', billId: 'smoke-state-only', enactedAtTurn: world.meta.turn, level: 2, scope: 'national', expiresAtTurn: null });
  world.governors.TX = {
    stateId: 'TX', countryId: 'US', governorId: 'player', governorParty: null,
    governorName: 'Extraction Operator', termStartTurn: world.meta.turn,
    gubernatorialActions: 100, lastActionGrantedTurn: world.meta.turn, lastAddressTurn: null,
  };
  return serializeSave(world, SAVED_AT);
}

test('player builds, contracts, produces and saves a real regional extraction operation in Chromium', async ({ page }) => {
  test.setTimeout(900_000);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/');
  await loadFixture(page, Buffer.from(eligibleExtractionSave()));
  await gameReady(page);

  await navigateGame(page, 'Regions');
  await page.getByText('Browse regions', { exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search regions', exact: true }).fill('Texas');
  await page.getByRole('button', { name: 'Search directory', exact: true }).click();
  await page.getByRole('button', { name: 'View Texas details', exact: true }).click();
  const extraction = page.getByRole('region', { name: 'Texas extraction contracts', exact: true });
  await expect(extraction).toBeVisible();
  await expect(extraction).toContainText('Authority: state');
  await extraction.getByLabel('Extraction resource for Texas').selectOption('oil');

  await extraction.getByRole('button', { name: 'Commission regional survey', exact: true }).click();
  await expect(extraction).toContainText('oil: active');
  await extraction.getByRole('button', { name: 'Expand extraction operations', exact: true }).click();
  await expect(extraction).toContainText('Offer to US extraction corporation');
  // The operation card is projected from the saved regional corporate asset.
  await expect(page.getByRole('heading', { name: 'Corporate sectors', exact: true })).toBeVisible();

  await extraction.getByLabel('Term (turns)', { exact: true }).fill('120');
  await extraction.getByRole('button', { name: 'Offer extraction contract', exact: true }).click();
  await expect(extraction.getByText('offered', { exact: false })).toBeVisible();
  await extraction.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(extraction).toContainText('active');

  await page.screenshot({ path: 'artifacts/smoke/regional-extraction-390-before-production.png', fullPage: true });
  for (let turn = 0; turn < 48; turn += 1) await advanceExtractionTurn(page);

  await navigateGame(page, 'Regions');
  await page.getByText('Browse regions', { exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search regions', exact: true }).fill('Texas');
  await page.getByRole('button', { name: 'Search directory', exact: true }).click();
  await page.getByRole('button', { name: 'View Texas details', exact: true }).click();
  const settled = page.getByRole('region', { name: 'Texas extraction contracts', exact: true });
  await expect(settled).toContainText('active');
  await expect(settled.locator('dd').nth(1)).not.toHaveText('0');
  await saveGame(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Continue Extraction Operator', exact: true }).click();
  await gameReady(page);
  await navigateGame(page, 'Regions');
  await page.getByText('Browse regions', { exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search regions', exact: true }).fill('Texas');
  await page.getByRole('button', { name: 'Search directory', exact: true }).click();
  await page.getByRole('button', { name: 'View Texas details', exact: true }).click();
  const reloaded = page.getByRole('region', { name: 'Texas extraction contracts', exact: true });
  await expect(reloaded).toContainText('active');
  await expect(reloaded.locator('dd').nth(1)).not.toHaveText('0');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/smoke/regional-extraction-390-reloaded.png', fullPage: true });

  // Inspect the identical normal save/resume state at the narrower phone
  // width; the active contract's issuer controls remain real, reachable UI.
  await page.setViewportSize({ width: 320, height: 900 });
  await expect(reloaded.getByLabel('Extraction resource for Texas')).toBeVisible();
  await expect(reloaded.getByRole('button', { name: 'Revoke', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/smoke/regional-extraction-320-reloaded.png', fullPage: true });
});
