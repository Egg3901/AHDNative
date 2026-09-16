import { test, expect, type Page } from '@playwright/test';
import { gameReady, openGameMenu, closeGameMenu, completeCharacterCreation } from './game-navigation';

/**
 * Dynamic Island / modern iPhone safe-area composition (#436).
 * Browser-geometry contract: no horizontal overflow, persistent footer and
 * bottom navigation visible, resource overlays and the drawer reachable with
 * their controls visible, in portrait at 320/390px and in landscape.
 * Simulator/browser evidence only; not a physical-device pass.
 */
async function startGame(page: Page, width: number, height: number, seed: string) {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill('Safe Area');
  await page.getByLabel('Seed', { exact: false }).fill(seed);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await completeCharacterCreation(page);
  await gameReady(page);
}

async function checkComposition(page: Page, width: number, tag: string) {
  const footer = page.getByRole('contentinfo');
  await expect(footer).toBeVisible();
  const primary = page.getByRole('navigation', { name: 'Primary', exact: true });
  await expect(primary.getByRole('button')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await footer.getByRole('button', { name: /Action points/ }).click();
  const details = page.getByRole('dialog', { name: 'Action points details' });
  await expect(details).toBeVisible();
  await expect(details.getByRole('button', { name: 'Close details' })).toBeVisible();
  await expect(details.getByRole('button', { name: 'Go to Actions' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/smoke/safe-area-resources-${tag}.png` });
  await details.getByRole('button', { name: 'Close details' }).click();
  await openGameMenu(page);
  const drawer = page.getByRole('dialog', { name: 'Game menu', exact: true });
  await expect(drawer.getByRole('button', { name: 'End turn', exact: true })).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Save game', exact: true })).toBeVisible();
  const drawerBounds = await drawer.boundingBox();
  expect(drawerBounds!.width).toBeLessThan(width);
  await page.screenshot({ path: `artifacts/smoke/safe-area-drawer-${tag}.png` });
  await closeGameMenu(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const width of [320, 390]) {
  test(`safe-area composition holds at ${width}px portrait`, async ({ page }) => {
    await startGame(page, width, 844, `safe-area-${width}`);
    await checkComposition(page, width, `${width}`);
  });
}

test('safe-area composition holds at 844x390 landscape', async ({ page }) => {
  await startGame(page, 844, 390, 'safe-area-landscape');
  await checkComposition(page, 844, 'landscape');
});
