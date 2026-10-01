import { expect, test, type Page } from '@playwright/test';
import { corporateSectorAssets, deserializeSave, serializeSave } from '@ahdclient/engine';
import { GameSession } from '../src/game/session';
import { gameReady, loadFixture, navigateGame, saveGame } from './game-navigation';

const SAVED_AT = '2026-10-01T00:00:00.000Z';

function regionalTradingSave() {
  const session = new GameSession();
  session.create({ era: '1953', countryId: 'US', homeRegionId: 'DC', seed: 'region-sector-chromium', playerName: 'Regional Trader' });
  expect(session.act('buyShares', { corpId: 'US-media', shares: 1 }).ok).toBe(true);
  expect(session.act('buyShares', { corpId: 'US-financial', shares: 1 }).ok).toBe(true);
  const sellerVote = session.act('voteCeo', { corpId: 'US-media', candidateId: 'player' });
  expect(sellerVote.ok, sellerVote.error).toBe(true);
  const sellerAppointment = session.act('acceptCeoAppointment', { corpId: 'US-media' });
  expect(sellerAppointment.ok, sellerAppointment.error).toBe(true);
  const world = deserializeSave(session.serialize(SAVED_AT));
  const assets = corporateSectorAssets(world);
  world.corporations['US-financial']!.liquidCapital = 1_000_000;
  for (const corporationId of ['US-media', 'US-financial']) {
    const asset = Object.values(assets).find((row) => row.corporationId === corporationId);
    if (!asset) throw new Error(`Missing asset for ${corporationId}`);
    asset.stateId = 'CA';
  }
  world.corporateSectors = assets;
  const listings = session.markets().listings;
  const seller = listings.find((row) => row.id === 'US-media')!;
  const buyer = listings.find((row) => row.id === 'US-financial')!;
  return {
    save: serializeSave(world, SAVED_AT),
    sellerTicker: seller.ticker,
    sellerName: seller.name,
    sellerSectorLabel: seller.sectorLabel,
    buyerTicker: buyer.ticker,
    buyerName: buyer.name,
    buyerSectorLabel: buyer.sectorLabel,
  };
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
    const fixture = regionalTradingSave();
    await loadFixture(page, Buffer.from(fixture.save));
    await gameReady(page);

    let card = await openCalifornia(page);
    await expect(card).toContainText('2 regional sectors');
    await page.getByRole('button', { name: 'List media sector for sale' }).click();
    await expect(page.getByRole('button', { name: `List ${fixture.buyerSectorLabel} sector for sale` })).toBeDisabled();
    await expect(card).toContainText('1 for sale');
    const media = card.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Update media sector price' }) });
    await media.getByRole('textbox', { name: 'Asking price' }).fill('100');
    await media.getByRole('button', { name: 'Update media sector price' }).click();
    await expect(media).toContainText('$100.00');
    await page.getByRole('heading', { name: 'Corporate sectors', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `artifacts/smoke/regional-sectors-${width}-listed.png` });

    await saveGame(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Continue Regional Trader', exact: true }).click();
    await gameReady(page);
    card = await openCalifornia(page);
    await expect(card).toContainText('1 for sale');
    await expect(card.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Update media sector price' }) })).toContainText('$100.00');

    await navigateGame(page, 'Stock market');
    await page.getByRole('button', { name: `${fixture.sellerTicker} ${fixture.sellerName}`, exact: true }).click();
    await page.getByRole('button', { name: 'Resign as CEO', exact: true }).click();
    await expect(page.getByText('The CEO seat is vacant.')).toBeVisible();
    await page.getByRole('button', { name: 'Back to market list', exact: true }).click();
    await page.getByRole('button', { name: `${fixture.buyerTicker} ${fixture.buyerName}`, exact: true }).click();
    await page.getByRole('button', { name: 'Vote yourself as CEO', exact: true }).click();
    await page.getByRole('button', { name: 'Accept CEO appointment', exact: true }).click();
    await expect(page.getByText('You are the recorded CEO.')).toBeVisible();

    await navigateGame(page, 'Regions');
    card = await openCalifornia(page);
    const mediaForBuy = card.getByRole('listitem').filter({ has: page.getByRole('button', { name: `Buy ${fixture.sellerSectorLabel} sector (${fixture.sellerTicker})` }) });
    await mediaForBuy.getByLabel('Buy with corporation').selectOption('US-financial');
    await mediaForBuy.getByRole('button', { name: `Buy ${fixture.sellerSectorLabel} sector (${fixture.sellerTicker})` }).click();
    await expect(card).toContainText('Owned by First Bank');
    await page.getByRole('button', { name: `List ${fixture.buyerSectorLabel} sector for sale` }).click();
    await page.getByRole('button', { name: `Unlist ${fixture.buyerSectorLabel} sector` }).click();
    await expect(card).toContainText('0 for sale');
    await saveGame(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Continue Regional Trader', exact: true }).click();
    await gameReady(page);
    card = await openCalifornia(page);
    await expect(card).toContainText('Owned by First Bank');
    await expect(card).toContainText('0 for sale');
    await expect(page.getByRole('button', { name: `Buy ${fixture.sellerSectorLabel} sector (${fixture.sellerTicker})` })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('heading', { name: 'Corporate sectors', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `artifacts/smoke/regional-sectors-${width}-owned.png` });
  });
}
