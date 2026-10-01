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
  await expect(page.getByRole('group', { name: /world nations geographic map|regions geographic map/i })).toBeVisible();
}

test('390px: geographic map selection, Hall of Fame flow, saved view survives reload', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await startWorld(page, 'MapPlayer', 'geo-night-390', 390);
  await openWorldMap(page);

  // Real shapes render: France path exists and is a working selection.
  const map = page.getByRole('group', { name: /world nations geographic map/i });
  await expect(map.locator('path[data-feature-id="250"]')).toHaveCount(1);
  await expect(map.locator('path[data-feature-id="834"]')).toHaveCount(1);
  // Tap mainland France. Its multipart feature also includes French Guiana,
  // so the bounding-box center falls outside the actual country shape.
  const bounds = await map.boundingBox();
  if (!bounds) throw new Error('Geographic map has no visible bounds');
  await page.mouse.click(bounds.x + bounds.width * (182.3 / 360), bounds.y + bounds.height * (41.2 / 180));
  await expect(map).toBeHidden();
  await expect(page.getByRole('heading', { name: 'France' }).first()).toBeVisible();

  // Back to the map: real source subdivisions and country-scoped browsing.
  await openWorldMap(page);
  await page.getByRole('button', { name: 'Show country spotlight geography' }).click();
  await expect(page.getByRole('heading', { name: 'United States spotlight' })).toBeVisible();
  const subdivisions = page.getByRole('group', { name: 'United States regions geographic map', exact: true });
  await expect(subdivisions).toBeVisible();
  await expect(subdivisions.locator('path[data-region-id="CA"]')).toHaveCount(1);
  const countryPicker = page.getByRole('combobox', { name: 'Choose country for the region map and directory', exact: true });
  await countryPicker.selectOption('UK');
  const british = page.getByRole('group', { name: 'United Kingdom regions geographic map', exact: true });
  await expect(british).toBeVisible();
  const eastMidlands = british.getByRole('button', { name: 'Select East Midlands (England) region', exact: true });
  await eastMidlands.focus();
  await eastMidlands.press('Enter');
  await expect(eastMidlands).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('heading', { name: 'United Kingdom spotlight', exact: true })).toBeVisible();
  const foreignDirectory = page.getByRole('region', { name: 'Regions on the world map', exact: true });
  await foreignDirectory.getByRole('button', { name: 'Select London region', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'United Kingdom spotlight', exact: true })).toBeVisible();
  await countryPicker.selectOption('US');
  await expect(subdivisions).toBeVisible();

  // Hall of Fame: filters, profile link, race links when recorded.
  await page.getByRole('button', { name: 'Open the Hall of Fame standings' }).click();
  await expect(page.getByRole('heading', { name: 'Hall of Fame', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Show only the current era' }).click();
  await expect(page.getByRole('button', { name: 'Show only the current era' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Rank by net worth' }).click();
  await expect(page.getByRole('button', { name: 'Rank by net worth' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Show every recorded life' }).click();
  await page.getByRole('button', { name: 'Rank by Legacy Score' }).click();
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
  expect(errors).toEqual([]);
  await page.getByRole('heading', { name: 'United States spotlight' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/smoke/world-map-geo-390.png' });
});

test('320px: keyboard map selection without horizontal overflow', async ({ page }) => {
  await startWorld(page, 'MapSmall', 'geo-night-320', 320);
  await openWorldMap(page);

  const map = page.getByRole('group', { name: /world nations geographic map/i });
  const france = map.getByRole('button', { name: 'Open France on the map' });
  await france.focus();
  await france.press('Enter');
  await expect(map).toBeHidden();
  await expect(page.getByRole('heading', { name: 'France' }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/smoke/world-map-geo-320.png', fullPage: true });
});
