import { test, expect } from '@playwright/test';
import { completeCharacterCreation, gameReady, navigateGame } from './game-navigation';

/**
 * Issue #38: commission a real quick poll through the shared mobile UI.
 * New players start broke, so the flow earns funds first (convert cash,
 * build donor network, fundraise), then commissions under Intelligence and
 * reads the stored results in Latest polls.
 */
test('intelligence quick poll commissions and displays stored results', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill('Poll Reader');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await completeCharacterCreation(page);
  await gameReady(page);
  await navigateGame(page, 'Actions');

  // Intelligence tab: quick poll exists but is funds-gated for a new player.
  await page.getByRole('tab', { name: /^Intelligence,/ }).click();
  const quickCard = page.getByRole('article', { name: 'Quick Poll' });
  await expect(quickCard.getByRole('button', { name: 'Unavailable: Quick Poll' })).toBeDisabled();

  // Earn funds: convert cash, build the donor network, fundraise.
  await page.getByRole('tab', { name: /^Fundraising,/ }).click();
  await page.getByLabel('Amount for Personal Campaign Donation').fill('10000');
  await page.getByRole('button', { name: 'Take action: Personal Campaign Donation' }).click();
  await gameReady(page);
  await page.getByRole('button', { name: 'Take action: Build Donor Network' }).click();
  await gameReady(page);
  await page.getByRole('button', { name: 'Take action: Fundraise' }).click();
  await gameReady(page);

  // Commission the quick poll and read the stored results.
  await page.getByRole('tab', { name: /^Intelligence,/ }).click();
  await expect(quickCard.getByRole('button', { name: 'Take action: Quick Poll' })).toBeEnabled();
  await quickCard.getByRole('button', { name: 'Take action: Quick Poll' }).click();
  await gameReady(page);
  const latest = page.getByRole('region', { name: 'Latest polls' });
  await expect(latest.getByRole('article', { name: 'Quick Poll' })).toBeVisible();
  await expect(latest.getByText(/likely voters/)).toBeVisible();
  await expect(latest.getByText(/Strongest groups/)).toBeVisible();
  await expect(latest.getByText(/Weakest groups/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/smoke/polling-390.png', fullPage: true });
});
