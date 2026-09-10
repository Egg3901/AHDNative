import { openGameMenu, gameReady, navigateGame, advanceGame } from './game-navigation';
import { test, expect, type Page } from '@playwright/test';

async function openMenu(page: Page, destination: string) {
  await openGameMenu(page);
  await page.getByRole('dialog', { name: 'Game menu' }).getByRole('button', { name: destination, exact: true }).click();
}

test('mobile politics, national accounts and resource explanations use a real UK world', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill('Detail Player');
  await page.getByLabel('Country', { exact: true }).selectOption('UK');
  await page.getByLabel('Seed', { exact: false }).fill('mobile-feature-depth');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await gameReady(page);

  await navigateGame(page, 'Parties');
  await page.getByRole('button', { name: /^View .* details$/ }).first().click();
  const party = page.getByRole('region', { name: 'Party details', exact: true });
  await expect(party.getByText('Platform', { exact: true })).toBeVisible();
  await party.getByRole('button', { name: /^Join / }).click();
  await expect(party.getByRole('button', { name: /^Leave / })).toBeEnabled();
  await page.screenshot({ path: 'artifacts/smoke/mobile-party-details.png', fullPage: true });

  await openMenu(page, 'Politicians');
  // The shipped 1953 UK Commons begins with vacant seats and no NPC roster.
  await expect(page.getByText('No politicians match this filter.')).toBeVisible();
  await openMenu(page, 'Economy');
  await expect(page.getByRole('heading', { name: 'Economy', exact: true })).toBeVisible();
  await expect(page.getByText(/million USD/)).toBeVisible();
  await openMenu(page, 'Budget');
  await expect(page.getByRole('heading', { name: 'Revenue', exact: true })).toBeVisible();
  await expect(page.getByText('Budget amounts are absolute GBP units.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/smoke/mobile-budget.png', fullPage: true });
  await openMenu(page, 'Policy');
  await expect(page.getByRole('heading', { name: 'Current tax settings', exact: true })).toBeVisible();

  await openMenu(page, 'Nations');
  await page.getByRole('searchbox', { name: 'Search nations' }).fill('United States');
  await page.getByRole('button', { name: 'View United States details' }).click();
  await expect(page.getByRole('article', { name: 'United States', exact: true })).toBeVisible();
  await openMenu(page, 'Economy');
  await expect(page.getByText('UK · GBP', { exact: true })).toBeVisible();
  await openMenu(page, 'Home region');
  await expect(page.getByRole('region', { name: 'Home region', exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/smoke/mobile-region.png', fullPage: true });

  const footer = page.getByRole('contentinfo', { name: 'Status and primary navigation' });
  await footer.getByRole('button', { name: /action points/i }).click();
  await expect(page.getByText('Base refresh', { exact: true })).toBeVisible();
  await footer.getByRole('button', { name: /campaign funds/i }).click();
  await expect(page.getByText('Regular net generation', { exact: true })).toBeVisible();
  await expect(page.getByText('Donor bonus', { exact: true })).toBeVisible();
  await footer.getByRole('button', { name: /campaign funds/i }).click();
  await advanceGame(page);
  await expect(footer).toContainText('Turn 1');
  await gameReady(page);
  await page.reload();
  await page.getByRole('button', { name: 'Continue Detail Player' }).click();
  await openMenu(page, 'Economy');
  await expect(page.getByRole('columnheader', { name: 'Turn', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
