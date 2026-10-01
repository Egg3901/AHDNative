import { expect, test, type Page } from '@playwright/test';
import { corporateSectorAssets, deserializeSave, serializeSave } from '@ahdclient/engine';
import { GameSession } from '../src/game/session';
import { gameReady, loadFixture, navigateGame, saveGame } from './game-navigation';

const SAVED_AT = '2026-10-01T00:00:00.000Z';

function regionalTradingSave() {
  const session = new GameSession();
  session.create({ era: '1953', countryId: 'US', seed: 'region-sector-chromium', playerName: 'Regional Trader' });
  expect(session.act('buyShares', { corpId: 'US-media', shares: 1 }).ok).toBe(true);
  expect(session.act('buyShares', { corpId: 'US-energy', shares: 1 }).ok).toBe(true);
  const world = deserializeSave(session.serialize(SAVED_AT));
  const assets = corporateSectorAssets(world);
  for (const corporationId of ['US-media', 'US-energy']) {
    const asset = Object.values(assets).find((row) => row.corporationId === corporationId);
    if (!asset) throw new Error(`Missing asset for ${corporationId}`);
    asset.stateId = 'CA';
  }
  world.corporateSectors = assets;
  return serializeSave(world, SAVED_AT);
}

async function openCalifornia(page: Page) {
  await navigateGame(page, 'Regions');
  await page.getByText('Browse regions', { exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'Search regions', exact: true });
  await search.fill('California');
  await page.getByRole('button', { name: 'Search directory', exact: true }).click();
  await page.getByRole('button', { name: 'View California details', exact: true }).click();
  const card = page.getByRole('heading', { name: 'Corporate sectors', exact: true }).locator('..');
  await expect(card).toBeVisible();
  return card;
}

for (const width of [320, 390]) {
  test(`regional corporate-sector trading at ${width}px survives browser save/reload`, async ({ page }) => {
    // The real 1953 worker save is much larger than a UI-only fixture; allow
    // both browser reloads to complete on throttled/headless runners.
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await loadFixture(page, Buffer.from(regionalTradingSave()));
    await gameReady(page);

    let card = await openCalifornia(page);
    await expect(card).toContainText('2 regional sectors');
    await page.getByRole('button', { name: 'List media sector for sale' }).click();
    await page.getByRole('button', { name: 'List energy sector for sale' }).click();
    await expect(card).toContainText('2 for sale');
    const media = card.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Update media sector price' }) });
    await media.getByRole('textbox', { name: 'Asking price' }).fill('100');
    await media.getByRole('button', { name: 'Update media sector price' }).click();
    await expect(media).toContainText('$100.00');
    await card.screenshot({ path: `artifacts/smoke/regional-sectors-${width}-listed.png` });

    await saveGame(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Continue Regional Trader', exact: true }).click();
    await gameReady(page);
    card = await openCalifornia(page);
    await expect(card).toContainText('2 for sale');
    await expect(card.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Update media sector price' }) })).toContainText('$100.00');

    await page.getByRole('button', { name: 'Buy media sector (US.MEDI)' }).click();
    await expect(card.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'View Daily Media company' }) })).toContainText('Owned by you');
    await page.getByRole('button', { name: 'Unlist energy sector' }).click();
    await expect(card).toContainText('0 for sale');
    await saveGame(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Continue Regional Trader', exact: true }).click();
    await gameReady(page);
    card = await openCalifornia(page);
    await expect(card).toContainText('Owned by you');
    await expect(card).toContainText('0 for sale');
    await expect(page.getByRole('button', { name: 'Buy media sector (US.MEDI)' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await card.screenshot({ path: `artifacts/smoke/regional-sectors-${width}-owned.png` });
  });
}
