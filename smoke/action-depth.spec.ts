import { openGameMenu, gameReady, advanceGame } from './game-navigation';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

test('domestic shares can be bought, partly sold and retained across relaunch', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill('Market Player');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await gameReady(page);
  const openMarket = async () => {
    await openGameMenu(page);
    await page.getByRole('dialog', { name: 'Game menu' }).getByRole('button', { name: 'Stock market', exact: true }).click();
    await page.getByRole('region', { name: 'Stock market', exact: true }).getByLabel('Country', { exact: true }).selectOption('US');
  };
  await openMarket();
  const listing = page.getByRole('region', { name: 'Stock market', exact: true }).getByRole('list', { name: 'Companies' }).getByRole('button').first();
  const company = await listing.getAttribute('aria-label');
  await listing.click();
  await page.getByLabel('Shares', { exact: true }).fill('2');
  await page.getByRole('button', { name: /^Buy shares:/ }).click();
  // The selected company must remain open when fresh balances arrive.
  await expect(page.getByText('2 shares', { exact: true })).toBeVisible();
  await page.getByLabel('Shares', { exact: true }).fill('1');
  await page.getByRole('button', { name: /^Sell shares:/ }).click();
  await expect(page.getByText('1 share', { exact: true })).toBeVisible();
  await gameReady(page);
  await page.reload();
  await page.getByRole('button', { name: 'Continue Market Player', exact: true }).click();
  await gameReady(page);
  await openMarket();
  await page.getByRole('button', { name: company!, exact: true }).click();
  await expect(page.getByText('1 share', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/smoke/mobile-company-trade.png', fullPage: true });
});

test('an elected player proposes a tax rate and reopens the actual bill after relaunch', async ({ page }) => {
  const fixture = gunzipSync(readFileSync(new URL('../fixtures/career-elected-1953-US.save.json.gz', import.meta.url)));
  await page.goto('/');
  await page.getByLabel('Import saved game', { exact: true }).setInputFiles({ name: 'elected.json', mimeType: 'application/json', buffer: fixture });
  await gameReady(page);
  await advanceGame(page); // The real saved sponsorship cooldown ends at turn 99.
  await gameReady(page);
  const openBills = async () => {
    await openGameMenu(page);
    await page.getByRole('dialog', { name: 'Game menu' }).getByRole('button', { name: 'Bills and proposals', exact: true }).click();
    await expect(page.getByLabel('Available legislation', { exact: true })).toBeEnabled();
  };
  await openBills();
  await page.getByLabel('Available legislation', { exact: true }).selectOption('us.tax.incomeTax');
  await page.getByLabel('Tax rate', { exact: true }).fill('38');
  await page.getByRole('button', { name: 'Sponsor bill', exact: true }).click();
  await gameReady(page);
  const bill = page.getByRole('article').filter({ hasText: 'Federal Income Tax Structure' }).filter({ hasText: 'Muse' });
  await bill.getByRole('button', { name: /^Show details for/ }).click();
  await expect(page.getByText('Selected rate: 38%', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Continue Muse', exact: true }).click();
  await gameReady(page);
  await openBills();
  await bill.getByRole('button', { name: /^Show details for/ }).click();
  await expect(page.getByText('Selected rate: 38%', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/smoke/mobile-tax-proposal.png', fullPage: true });
});
