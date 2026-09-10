import { openGameMenu, gameReady } from './game-navigation';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

async function search(page: Page, query: string) {
  await openGameMenu(page);
  await page.getByRole('dialog', { name: 'Game menu' }).getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByLabel('Search your world').fill(query);
  await page.getByLabel('Search your world').press('Enter');
  return page.getByRole('region', { name: 'Search results', exact: true });
}

test('offline search opens the matching party, foreign nation and company without changing the player country', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill('Search Player');
  await page.getByLabel('Country', { exact: true }).selectOption('UK');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await gameReady(page);
  await page.context().setOffline(true);
  await (await search(page, 'Labour')).getByRole('button', { name: /Labour/ }).click();
  await expect(page.getByRole('region', { name: 'Party details', exact: true })).toBeFocused();
  await expect(page.getByRole('article', { name: 'Labour Party', exact: true })).toBeVisible();
  await (await search(page, 'United States')).getByRole('button', { name: 'United States Nation', exact: true }).click();
  await expect(page.getByRole('article', { name: 'United States', exact: true })).toBeVisible();
  await openGameMenu(page);
  await expect(page.getByRole('dialog', { name: 'Game menu' })).toContainText('United Kingdom');
  await (await search(page, 'US.MEDI')).getByRole('button', { name: /US.MEDI/ }).click();
  await expect(page.getByRole('region', { name: 'Stock market', exact: true })).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Company', exact: true })).toBeVisible();
  await expect(page.getByText(/US.MEDI/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Buy shares:/ })).toBeDisabled();
  await expect(page.getByRole('contentinfo')).toContainText('Turn 0');
  const empty = await search(page, 'zz-no-match-zz');
  await expect(empty).toContainText('No matches.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/smoke/mobile-local-search.png', fullPage: true });
});

test('search opens the actual saved bill and election details', async ({ page }) => {
  const fixture = gunzipSync(readFileSync(new URL('../fixtures/career-elected-1953-US.save.json.gz', import.meta.url)));
  await page.goto('/');
  await page.getByLabel('Import saved game', { exact: true }).setInputFiles({ name: 'elected.json', mimeType: 'application/json', buffer: fixture });
  await gameReady(page);
  await (await search(page, 'Fair Labor')).getByRole('button').first().click();
  await expect(page.getByRole('heading', { name: 'Bill details: Fair Labor Standards and Employment Security Act', exact: true })).toBeVisible();
  await (await search(page, 'House Alabama')).getByRole('button').first().click();
  await expect(page.getByRole('region', { name: 'Election details', exact: true })).toBeFocused();
  await expect(page.getByRole('article').filter({ hasText: 'Winners:' })).toContainText('Muse');
  await expect(page.getByRole('contentinfo')).toContainText('Turn 98');
  // Read a real NPC name from the directory, then prove search reopens that person.
  await openGameMenu(page);
  await page.getByRole('dialog', { name: 'Game menu' }).getByRole('button', { name: 'Politicians', exact: true }).click();
  const politician = page.getByLabel('Politician', { exact: true });
  await expect(politician).toBeVisible();
  const options = await politician.locator('option').allTextContents();
  const name = options.at(-1)!.replace(/ \(.*\)$/, '');
  const id = await politician.locator('option').last().getAttribute('value');
  await (await search(page, name)).getByRole('button', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} Politician`) }).click();
  await expect(page.getByLabel('Politician', { exact: true })).toHaveValue(id!);
});
