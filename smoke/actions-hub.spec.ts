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
