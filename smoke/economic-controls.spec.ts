import { expect, test } from '@playwright/test';
import { completeCharacterCreation, gameReady, navigateGame } from './game-navigation';

for (const width of [320, 390]) {
  test(`national subsidy and Gosbank controls fit a ${width}px player screen`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: 'New game', exact: true }).click();
    await page.getByLabel('Your name').fill('Economic Controls Player');
    await page.getByLabel('Seed', { exact: false }).fill(`economic-controls-${width}`);
    await page.getByLabel('Country', { exact: true }).selectOption('RU');
    await page.getByLabel('Head of State', { exact: true }).check();
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await completeCharacterCreation(page);
    await gameReady(page);

    await navigateGame(page, 'Legislature');
    await expect(page.getByRole('heading', { name: 'National subsidies' }).first()).toBeVisible();
    await page.getByLabel('Subsidy scope').selectOption('sector');
    await expect(page.getByRole('combobox', { name: 'Sector', exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'Sector', exact: true }).selectOption('energy');
    await page.getByRole('button', { name: 'Propose subsidy bill', exact: true }).click();
    await expect(page.getByText(/annual subsidy spending/i)).toBeVisible();
    const subsidyBill = page.getByRole('article', { name: 'National energy subsidy' });
    await expect(subsidyBill).toBeVisible();
    await expect(subsidyBill).toContainText('proposed');
    await page.screenshot({ path: `artifacts/smoke/subsidy-legislature-${width}.png`, fullPage: true });

    await navigateGame(page, 'Command Economy');
    await expect(page.getByRole('heading', { name: 'Command economy', exact: true })).toBeVisible();
    await expect(page.getByLabel('Credit aggressiveness')).toBeVisible();
    await expect(page.getByLabel('Budget softness')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Queue Gosbank directive' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/smoke/economic-controls-${width}.png`, fullPage: true });
  });
}
