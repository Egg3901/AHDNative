import { expect, test } from '@playwright/test';
import { completeCharacterCreation, gameReady, navigateGame, saveGame } from './game-navigation';

test('fresh US HoS controls and save/resume work at 320px and 390px', async ({ page }) => {
  test.setTimeout(600_000);
  page.setDefaultTimeout(30_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill('Executive Player');
  await page.getByLabel('Seed', { exact: false }).fill('hos-authority-mobile');
  await page.getByLabel('Head of State').check();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await completeCharacterCreation(page, { party: 'REP' });
  await gameReady(page);
  await navigateGame(page, 'Actions');
  await expect(page.getByRole('note').filter({ hasText: 'Permanent Head of State' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.getByRole('tab', { name: /Executive,/ }).click();
  await expect(page.getByRole('button', { name: 'Take action: Set Tax Rate', exact: true })).toBeEnabled();
  await page.getByLabel('Amount for Set Tax Rate').fill('25');
  await page.getByRole('button', { name: 'Take action: Set Tax Rate', exact: true }).click();
  await gameReady(page);
  await expect(page.getByRole('status')).toContainText('enacts next turn');
  await saveGame(page);
  await page.reload();
  await page.getByRole('button', { name: 'Continue Executive Player', exact: true }).click();
  await gameReady(page);
  await navigateGame(page, 'Actions');
  await expect(page.getByRole('note').filter({ hasText: 'Permanent Head of State' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Executive,/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await navigateGame(page, 'Actions');
  await expect(page.getByRole('note').filter({ hasText: 'Permanent Head of State' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await saveGame(page);
  await page.reload();
  await page.getByRole('button', { name: 'Continue Executive Player', exact: true }).click();
  await gameReady(page);
  await navigateGame(page, 'Actions');
  await expect(page.getByRole('note').filter({ hasText: 'Permanent Head of State' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
