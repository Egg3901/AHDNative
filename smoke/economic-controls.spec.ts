import { expect, test } from '@playwright/test';
import { advanceGame, completeCharacterCreation, gameReady, navigateGame, saveGame } from './game-navigation';

for (const width of [320, 390]) {
  test(`national subsidy and Gosbank controls fit a ${width}px player screen`, async ({ page }) => {
    test.setTimeout(300_000);
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
    await page.getByLabel('Credit aggressiveness').fill('0.67');
    await page.getByLabel('Budget softness').fill('0.23');
    await page.getByLabel('Pick winners by sector').check();
    await page.getByLabel('energy credit weight').fill('80');
    await page.getByLabel('manufacturing credit weight').fill('20');
    await page.getByRole('button', { name: 'Queue Gosbank directive', exact: true }).click();
    const pendingDirective = page.getByText('Credit 0.67 · Budget 0.23 · Sector weights 14', { exact: true });
    await expect(pendingDirective).toBeVisible();
    await page.screenshot({ path: `artifacts/smoke/economic-controls-pending-${width}.png`, fullPage: true });
    await saveGame(page);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    const continueGame = page.getByRole('button', { name: 'Continue Economic Controls Player', exact: true });
    await expect(continueGame).toBeVisible();
    await continueGame.click();
    await expect(page.getByRole('contentinfo')).toBeVisible({ timeout: 30_000 });
    await gameReady(page);
    await navigateGame(page, 'Command Economy');
    await expect(page.getByText('Credit 0.67 · Budget 0.23 · Sector weights 14', { exact: true })).toBeVisible();

    await advanceGame(page);
    await navigateGame(page, 'Command Economy');
    await expect(page.getByText('No pending directives.', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Credit aggressiveness')).toHaveValue('0.67');
    await expect(page.getByLabel('Budget softness')).toHaveValue('0.23');
    await expect(page.getByLabel('energy credit weight')).toHaveValue('80');
    await expect(page.getByLabel('manufacturing credit weight')).toHaveValue('20');
    await navigateGame(page, 'National Budget');
    await expect(page.getByLabel('Last turn Gosbank credit')).toContainText('energy');
    await navigateGame(page, 'Command Economy');
    await saveGame(page);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Continue Economic Controls Player', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Continue Economic Controls Player', exact: true }).click();
    await expect(page.getByRole('contentinfo')).toBeVisible({ timeout: 30_000 });
    await gameReady(page);
    await navigateGame(page, 'Command Economy');
    await expect(page.getByLabel('Credit aggressiveness')).toHaveValue('0.67');
    await expect(page.getByLabel('Budget softness')).toHaveValue('0.23');
    await expect(page.getByLabel('energy credit weight')).toHaveValue('80');
    await expect(page.getByLabel('manufacturing credit weight')).toHaveValue('20');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/smoke/economic-controls-${width}.png`, fullPage: true });
  });
}
