import { expect, test } from '@playwright/test';
import { advanceGame, completeCharacterCreation, gameReady, navigateGame, saveGame } from './game-navigation';

test('320/390px HoS education spending reaches the saved national metrics registry', async ({ page }) => {
  test.setTimeout(600_000);
  page.setDefaultTimeout(30_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill('TFP Phone Player');
  await page.getByLabel('Seed', { exact: false }).fill('tfp-phone-flow-40');
  await page.getByLabel('Country', { exact: true }).selectOption('US');
  await page.getByLabel('Head of State', { exact: true }).check();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await completeCharacterCreation(page, { party: 'REP' });
  await gameReady(page);

  const metricCard = () => page.getByRole('article', { name: 'Workforce Skill', exact: true });
  await navigateGame(page, 'National Metrics');
  await expect(page.getByRole('heading', { name: 'National metrics registry', exact: true })).toBeVisible();
  await expect(metricCard()).toBeVisible();
  const before = await metricCard().locator('.ahd-mono').first().innerText();

  await navigateGame(page, 'Actions');
  const spending = page.getByRole('article', { name: 'Direct Spending', exact: true });
  await spending.getByLabel('Spending category').selectOption('education');
  await spending.getByLabel('Amount for Direct Spending').fill('2000000000000');
  await spending.getByRole('button', { name: 'Take action: Direct Spending', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('enacts next turn');
  await advanceGame(page);
  await advanceGame(page);

  await navigateGame(page, 'National Metrics');
  await expect(metricCard()).toBeVisible();
  const after = await metricCard().locator('.ahd-mono').first().innerText();
  expect(Number(after)).toBeGreaterThan(Number(before));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await metricCard().scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/smoke/tfp-phone-320-before-save.png' });

  await saveGame(page);
  await page.reload();
  await page.getByRole('button', { name: 'Continue TFP Phone Player', exact: true }).click();
  await gameReady(page);
  await navigateGame(page, 'National Metrics');
  await expect(metricCard()).toBeVisible();
  await expect(metricCard().locator('.ahd-mono').first()).toHaveText(after);
  await metricCard().scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/smoke/tfp-phone-320-reloaded.png' });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(metricCard()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await metricCard().scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/smoke/tfp-phone-390.png' });
  await saveGame(page);
  await page.reload();
  await page.getByRole('button', { name: 'Continue TFP Phone Player', exact: true }).click();
  await gameReady(page);
  await navigateGame(page, 'National Metrics');
  await expect(metricCard().locator('.ahd-mono').first()).toHaveText(after);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
