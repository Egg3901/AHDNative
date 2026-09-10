import { expect, test } from '@playwright/test';
import { gameReady, navigateGame } from './game-navigation';

test('a player builds donors, receives the quoted Fundraise yield and continues after relaunch', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill('Donor Player');
  await page.getByLabel('Country', { exact: true }).selectOption('US');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await gameReady(page);
  await navigateGame(page, 'Actions');
  await expect(page.getByRole('button', { name: 'Unavailable: Fundraise', exact: true })).toBeDisabled();
  await expect(page.getByRole('note').filter({ hasText: 'No donor base. Use Build Donor Network first.' })).toBeVisible();
  await page.getByRole('spinbutton', { name: /Amount for/ }).fill('6000');
  await page.getByRole('button', { name: 'Take action: Personal Campaign Donation', exact: true }).click();
  await gameReady(page);
  await page.getByRole('button', { name: 'Take action: Build Donor Network', exact: true }).click();
  await gameReady(page);
  // AHDGame L1/0% neutral-stat Fundraise yields 52,000 and costs 3 AP.
  await expect(page.getByText('Raises 52,000 campaign funds', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/smoke/mobile-shared-fundraise.png', fullPage: true });
  await page.getByRole('button', { name: 'Take action: Fundraise', exact: true }).click();
  await gameReady(page);
  await navigateGame(page, 'Profile');
  await expect(page.getByRole('region', { name: 'Political standing' })).toContainText('16 / 200');
  await expect(page.getByText('Campaign funds', { exact: true }).locator('..')).toContainText('52,000');
  await page.reload();
  await page.getByRole('button', { name: 'Continue Donor Player', exact: true }).click();
  await gameReady(page);
  await expect(page.getByText('Campaign funds', { exact: true }).locator('..')).toContainText('52,000');
  await navigateGame(page, 'Actions');
  await expect(page.getByText('Raises 52,000 campaign funds', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Take action: Fundraise', exact: true }).click();
  await gameReady(page);
  await navigateGame(page, 'Profile');
  await expect(page.getByRole('region', { name: 'Political standing' })).toContainText('13 / 200');
  await expect(page.getByText('Campaign funds', { exact: true }).locator('..')).toContainText('104,000');
});
