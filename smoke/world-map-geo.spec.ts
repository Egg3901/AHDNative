import { test, expect } from '@playwright/test';
import { gameReady, navigateGame, saveGame, openGameMenu, closeGameMenu, completeCharacterCreation } from './game-navigation';

async function startWorld(page: import('@playwright/test').Page, name: string, seed: string, width: number) {
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Country', { exact: true }).selectOption('US');
  await page.getByLabel('Seed', { exact: false }).fill(seed);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await completeCharacterCreation(page);
  await gameReady(page);
}

async function openWorldMap(page: import('@playwright/test').Page) {
  await openGameMenu(page);
  const dialog = page.getByRole('dialog', { name: 'Game menu' });
  const map = dialog.getByRole('button', { name: 'World map', exact: true });
  if (!(await map.isVisible())) {
    await dialog.getByRole('button', { name: 'World', exact: true }).click();
  }
  await map.click();
  await expect(page.getByRole('group', { name: /world nations geographic map/i })).toBeVisible();
}

test('390px: geographic map selection, Hall of Fame flow, saved view survives reload', async ({ page }) => {
  await startWorld(page, 'MapPlayer', 'geo-night-390', 390);
  await openWorldMap(page);

  // Real shapes render: France path exists and is a working selection.
  const map = page.getByRole('group', { name: /world nations geographic map/i });
  await expect(map.locator('path[data-feature-id="250"]')).toHaveCount(1);
  await expect(map.locator('path[data-feature-id="834"]')).toHaveCount(1);
  // SVG g actors never report DOM-visible to Playwright; dispatch the
  // real click event so the production handler (not a test hook) navigates.
  await map.getByRole('button', { name: 'Open France on the map' }).dispatchEvent('click');
  await expect(map).toBeHidden();
  await expect(page.getByRole('heading', { name: 'France' }).first()).toBeVisible();

  // Back to the map, switch to the country spotlight with its stated gap.
  await openWorldMap(page);
  await page.getByRole('button', { name: 'Show country spotlight geography' }).click();
  await expect(page.getByRole('heading', { name: 'United States spotlight' })).toBeVisible();
  await expect(page.getByText(/sub-region shapes are not bundled offline/i)).toBeVisible();

  // Hall of Fame: filters, profile link, race links when recorded.
  await page.getByRole('button', { name: 'Open the Hall of Fame standings' }).click();
  await expect(page.getByRole('heading', { name: 'Hall of Fame', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Show only my party' }).click();
  await page.getByRole('button', { name: 'Rank by influence' }).click();
  await page.getByRole('button', { name: 'Show every era' }).click();
  await page.getByRole('button', { name: /your character, open profile/ }).first().click();
  await expect(page.getByText('MapPlayer').first()).toBeVisible();

  // Persist the country view, reload the save, prove it survived.
  await openWorldMap(page);
  await expect(page.getByRole('heading', { name: 'United States spotlight' })).toBeVisible();
  await saveGame(page);
  await page.reload();
  await page.getByRole('button', { name: 'Continue MapPlayer', exact: true }).click();
  await gameReady(page);
  await openWorldMap(page);
  await expect(page.getByRole('heading', { name: 'United States spotlight' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/smoke/world-map-geo-390.png', fullPage: true });
});

test('320px: keyboard map selection without horizontal overflow', async ({ page }) => {
  await startWorld(page, 'MapSmall', 'geo-night-320', 320);
  await openWorldMap(page);

  const map = page.getByRole('group', { name: /world nations geographic map/i });
  const france = map.getByRole('button', { name: 'Open France on the map' });
  await france.dispatchEvent('keydown', { key: 'Enter' } as never);
  await expect(map).toBeHidden();
  await expect(page.getByRole('heading', { name: 'France' }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/smoke/world-map-geo-320.png', fullPage: true });
});
