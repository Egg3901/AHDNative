import { openGameMenu, gameReady } from './game-navigation';
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

test('sovereign units can be bought, partly sold and retained across relaunch', async ({ page }) => {
  const fixture = gunzipSync(readFileSync(new URL('../fixtures/career-elected-1953-US.save.json.gz', import.meta.url)));
  await page.goto('/');
  await page.getByLabel('Import saved game', { exact: true }).setInputFiles({ name: 'elected.json', mimeType: 'application/json', buffer: fixture });
  await gameReady(page);
  const openBonds = async () => {
    await openGameMenu(page);
    await page.getByRole('dialog', { name: 'Game menu' }).getByRole('button', { name: 'Bonds', exact: true }).click();
    await expect(page.getByLabel('Bond issue', { exact: true })).toBeVisible();
    await page.getByLabel('Bond issue', { exact: true }).selectOption('bond-60-US');
  };
  await openBonds();
  await page.getByLabel('Bond units', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Buy bond units', exact: true }).click();
  await expect(page.getByLabel('Your bond units', { exact: true })).toHaveText('2');
  await page.getByLabel('Bond units', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Sell bond units', exact: true }).click();
  await expect(page.getByLabel('Your bond units', { exact: true })).toHaveText('1');
  await gameReady(page);
  await page.reload();
  await page.getByRole('button', { name: 'Continue Muse', exact: true }).click();
  await gameReady(page);
  await openBonds();
  await expect(page.getByLabel('Your bond units', { exact: true })).toHaveText('1');
  await expect(page.getByRole('contentinfo')).toContainText('Turn 98');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/smoke/mobile-bond-market.png', fullPage: true });
});
