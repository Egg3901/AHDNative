import { test, expect } from '@playwright/test';
import { gameReady, navigateGame } from './game-navigation';

test('footer Actions links select the relevant category and preserve it on return', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill('Action Reader');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await gameReady(page);
  await page.getByRole('button', { name: /^Campaign funds:/ }).click();
  await page.getByRole('button', { name: 'Go to Actions', exact: true }).click();
  const fundraising = page.getByRole('tab', { name: /^Fundraising,/ });
  await expect(fundraising).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('contentinfo')).toContainText('Turn 0');
  await page.getByRole('tab', { name: /^Influence,/ }).click();
  await navigateGame(page, 'Profile');
  await navigateGame(page, 'Actions');
  await expect(page.getByRole('tab', { name: /^Influence,/ })).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/smoke/actions-320.png', fullPage: true });
});

test('structured action results survive a turn and save reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill('Outcome Reader');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await gameReady(page);
  await navigateGame(page, 'Actions');
  await page.getByRole('tab', { name: /^Fundraising,/ }).click();
  await page.getByRole('spinbutton', { name: 'Amount for Personal Campaign Donation' }).fill('10000');
  await page.getByRole('button', { name: 'Take action: Personal Campaign Donation' }).click();
  await gameReady(page);
  await page.getByRole('button', { name: 'Take action: Build Donor Network' }).click();
  await gameReady(page);
  const history = page.getByRole('region', { name: 'Recent action results' });
  await expect(history).toContainText('Donor network expanded');
  await expect(history).toContainText('Campaign funds: 5000 to 2000 (-3000)');
  await expect(history).toContainText('Donor network: 0 to 1 (+1)');

  await page.reload();
  await page.getByRole('button', { name: 'Continue Outcome Reader', exact: true }).click();
  await gameReady(page);
  await navigateGame(page, 'Actions');
  await expect(history).toContainText('Donor network expanded');
});
