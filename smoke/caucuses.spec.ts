import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

test('a real career founds, leaves and rejoins a caucus, then resumes its membership', async ({ page }) => {
  const fixture = gunzipSync(readFileSync(new URL('../fixtures/career-elected-1953-US.save.json.gz', import.meta.url)));
  await page.goto('/');
  await page.getByLabel('Import saved game', { exact: true }).setInputFiles({ name: 'elected.json', mimeType: 'application/json', buffer: fixture });
  const endTurn = page.getByRole('button', { name: 'End turn', exact: true });
  await expect(endTurn).toBeEnabled();
  await endTurn.click();
  await expect(endTurn).toBeEnabled();
  const openCaucuses = async () => {
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('menuitemradio', { name: 'Caucuses', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Caucuses', exact: true })).toBeVisible();
  };
  await openCaucuses();
  await page.getByLabel('Caucus name', { exact: true }).fill('Blue Dog Caucus');
  await page.getByLabel('Caucus tax', { exact: true }).fill('2.5');
  await page.getByRole('button', { name: 'Found caucus', exact: true }).click();
  await expect(page.getByText('You belong to Blue Dog Caucus.', { exact: true })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Blue Dog Caucus' })).toContainText('Tax 2.5%');
  await page.getByRole('button', { name: 'Leave Blue Dog Caucus', exact: true }).click();
  await expect(page.getByText('You are not in a caucus.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Join Blue Dog Caucus', exact: true }).click();
  await expect(page.getByText('You belong to Blue Dog Caucus.', { exact: true })).toBeVisible();
  await expect(endTurn).toBeEnabled();
  await page.reload();
  await page.getByRole('button', { name: 'Continue Muse', exact: true }).click();
  await expect(endTurn).toBeEnabled();
  await openCaucuses();
  await expect(page.getByText('You belong to Blue Dog Caucus.', { exact: true })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Blue Dog Caucus' })).toContainText('Tax 2.5%');
  await expect(page.getByRole('contentinfo')).toContainText('Turn 99');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/smoke/mobile-caucuses.png', fullPage: true });
});
