import { navigateGame, gameReady, advanceGame } from './game-navigation';
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

test('a real career founds, leaves and rejoins a caucus, then resumes its membership', async ({ page }) => {
  const fixture = gunzipSync(readFileSync(new URL('../fixtures/career-elected-1953-US.save.json.gz', import.meta.url)));
  await page.goto('/');
  await page.getByLabel('Import saved game', { exact: true }).setInputFiles({ name: 'elected.json', mimeType: 'application/json', buffer: fixture });
  await gameReady(page);
  await advanceGame(page);
  await gameReady(page);
  const openCaucuses = async () => {
    await navigateGame(page, 'Caucuses');
    await expect(page.getByRole('heading', { name: 'Caucuses', exact: true, level: 2 })).toBeVisible();
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
  await gameReady(page);
  await page.reload();
  await page.getByRole('button', { name: 'Continue Muse', exact: true }).click();
  await gameReady(page);
  await openCaucuses();
  await expect(page.getByText('You belong to Blue Dog Caucus.', { exact: true })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Blue Dog Caucus' })).toContainText('Tax 2.5%');
  await expect(page.getByRole('contentinfo')).toContainText('Turn 99');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/smoke/mobile-caucuses.png', fullPage: true });
});

test('the caucus chair edits the tax rate and disbands through the reference controls, then resumes disbanded', async ({ page }) => {
  const fixture = gunzipSync(readFileSync(new URL('../fixtures/career-elected-1953-US.save.json.gz', import.meta.url)));
  await page.goto('/');
  await page.getByLabel('Import saved game', { exact: true }).setInputFiles({ name: 'elected.json', mimeType: 'application/json', buffer: fixture });
  await gameReady(page);
  await advanceGame(page);
  await gameReady(page);
  await navigateGame(page, 'Caucuses');
  await expect(page.getByRole('heading', { name: 'Caucuses', exact: true, level: 2 })).toBeVisible();
  await page.getByLabel('Caucus name', { exact: true }).fill('Blue Dog Caucus');
  await page.getByLabel('Caucus tax', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Found caucus', exact: true }).click();
  // The founder is the chair, so the chair-only controls are present.
  const taxInput = page.getByLabel('Caucus tax for Blue Dog Caucus', { exact: true });
  await expect(taxInput).toBeVisible();
  await taxInput.fill('4.5');
  await page.getByRole('button', { name: 'Save Blue Dog Caucus tax', exact: true }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Blue Dog Caucus' })).toContainText('Tax 4.5%');
  // Reload proves the edited rate persisted before disbanding.
  await gameReady(page);
  await page.reload();
  await page.getByRole('button', { name: 'Continue Muse', exact: true }).click();
  await gameReady(page);
  await navigateGame(page, 'Caucuses');
  await expect(page.getByRole('listitem').filter({ hasText: 'Blue Dog Caucus' })).toContainText('Tax 4.5%');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Disband Blue Dog Caucus', exact: true }).click();
  await expect(page.getByText('You are not in a caucus.', { exact: true })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Blue Dog Caucus' })).toHaveCount(0);
  // The result message is set after the action's save lands in storage; wait
  // for it so the relaunch below reads the disbanded snapshot.
  await expect(page.getByRole('status').filter({ hasText: 'Disbanded caucus' })).toBeVisible();
  // Disbanding persists across a full relaunch.
  await page.reload();
  await page.getByRole('button', { name: 'Continue Muse', exact: true }).click();
  await gameReady(page);
  await navigateGame(page, 'Caucuses');
  await expect(page.getByRole('listitem').filter({ hasText: 'Blue Dog Caucus' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/smoke/mobile-caucus-chair-controls.png', fullPage: true });
});
