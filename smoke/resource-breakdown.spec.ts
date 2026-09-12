import { test, expect } from '@playwright/test';
import { gameReady, advanceGame } from './game-navigation';

for (const width of [320, 390]) {
  test(`resource detail panels open and close without losing the footer at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: 'New game', exact: true }).click();
    await page.getByLabel('Your name').fill('Breakdown Player');
    await page.getByLabel('Seed', { exact: false }).fill('resource-breakdown');
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await gameReady(page);

    const resources = page.getByRole('group', { name: 'Resources' });
    await resources.getByRole('button', { name: /^Action points:/ }).click();
    const apPanel = page.getByRole('dialog', { name: 'Action points details' });
    await expect(apPanel).toBeVisible();
    await expect(apPanel.getByText('Base refresh')).toBeVisible();
    await expect(apPanel.getByText('Elected seat office')).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeVisible();
    await apPanel.getByRole('button', { name: 'Close details' }).click();
    await expect(apPanel).toHaveCount(0);
    await expect(page.getByRole('contentinfo')).toContainText('Turn 0');

    await advanceGame(page);
    await resources.getByRole('button', { name: /^Campaign funds:/ }).click();
    const fundsPanel = page.getByRole('dialog', { name: 'Campaign funds details' });
    await expect(fundsPanel.getByText('Base generation')).toBeVisible();
    await expect(fundsPanel.getByText('Regular net generation')).toBeVisible();
    await fundsPanel.getByText('Recent recorded balances').click();
    await expect(fundsPanel.getByText(/Turn 1:/)).toBeVisible();
    await expect(page.getByRole('contentinfo')).toContainText('Turn 1');
    await fundsPanel.getByRole('button', { name: 'Close details' }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
