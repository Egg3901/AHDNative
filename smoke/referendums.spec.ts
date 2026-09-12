import { test, expect } from '@playwright/test';
import { gameReady, navigateGame } from './game-navigation';

test('referendum requests surface every devolved region from the engine', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill('Referendum Player');
  await page.getByLabel('Country', { exact: true }).selectOption('UK');
  await page.getByLabel('Seed', { exact: false }).fill('referendum-smoke');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await gameReady(page);

  await navigateGame(page, 'Referendums');
  await expect(page.getByRole('heading', { name: 'Referendums', exact: true })).toBeVisible();
  const requests = page.getByRole('article', { name: 'Referendum requests' });
  await expect(requests).toBeVisible();
  await expect(requests.getByRole('button', { name: /^Request referendum in / })).toHaveCount(3);
  await expect(page.getByText('No referendums have been requested.')).toBeVisible();
  expect(errors).toEqual([]);
});
