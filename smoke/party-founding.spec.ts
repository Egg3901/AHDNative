import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

test('a funded career founds a party once and resumes with its membership and charter', async ({ page }) => {
  const fixture = gunzipSync(readFileSync(new URL('../fixtures/career-elected-1953-US.save.json.gz', import.meta.url)));
  await page.goto('/');
  await page.getByLabel('Import saved game', { exact: true }).setInputFiles({ name: 'elected.json', mimeType: 'application/json', buffer: fixture });
  const endTurn = page.getByRole('button', { name: 'End turn', exact: true });
  await expect(endTurn).toBeEnabled();
  await endTurn.click();
  await expect(endTurn).toBeEnabled();
  const openFounding = async () => {
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('menuitemradio', { name: 'Start a party', exact: true }).click();
    await expect(page.getByLabel('Party name', { exact: true })).toBeVisible();
  };
  await openFounding();
  await page.getByLabel('Party name', { exact: true }).fill('New Frontier');
  await page.getByLabel('Abbreviation', { exact: true }).fill('NFP');
  const found = page.getByRole('button', { name: 'Found party', exact: true });
  await expect(found).toBeEnabled();
  await found.click();
  await expect(page.getByText('You belong to New Frontier.', { exact: true })).toBeVisible();
  await expect(found).toBeDisabled();
  await expect(page.getByRole('listitem').filter({ hasText: 'New Frontier' })).toContainText('ratified');
  await expect(endTurn).toBeEnabled();
  await expect(page.getByRole('contentinfo')).toContainText('Turn 99');
  await page.reload();
  await page.getByRole('button', { name: 'Continue Muse', exact: true }).click();
  await expect(endTurn).toBeEnabled();
  await openFounding();
  await expect(page.getByText('You belong to New Frontier.', { exact: true })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'New Frontier' })).toContainText('ratified');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/smoke/mobile-party-founding.png', fullPage: true });
});
