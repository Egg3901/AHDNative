import { gameReady, navigateGame, advanceGame } from './game-navigation';
import { expect, test } from '@playwright/test';

test('an unelected player can inspect legislation without sponsoring a bill', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill('Legislature Player');
  await page.getByLabel('Seed', { exact: false }).fill('native-legislature-v1');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await gameReady(page);
  await navigateGame(page, 'Legislature');
  await expect(page.getByText('No legislative seat', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Legislation', { exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Sponsor bill', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/smoke/mobile-legislature.png', fullPage: true });
});

test('the historical primary transition and sponsorship survive relaunch', async ({ page }) => {
  const { readFileSync } = await import('node:fs');
  const { gunzipSync } = await import('node:zlib');
  const fixture = gunzipSync(readFileSync(new URL('../fixtures/career-t95-1953-US.save.json.gz', import.meta.url)));
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByLabel('Import saved game', { exact: true }).setInputFiles({ name: 'career.json', mimeType: 'application/json', buffer: fixture });
  await gameReady(page);
  await advanceGame(page);
  await expect(page.getByRole('contentinfo')).toContainText('Turn 96 ·');
  await gameReady(page);
  await navigateGame(page, 'Legislature');
  await expect(page.getByText('House of Representatives · United States', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sponsor bill', exact: true })).toBeEnabled();
  await page.reload();
  await page.getByRole('button', { name: 'Continue Muse', exact: true }).click();
  await gameReady(page);
  await navigateGame(page, 'Legislature');
  await expect(page.getByText('House of Representatives · United States', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sponsor bill', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'artifacts/smoke/mobile-election-result.png', fullPage: true });
});
