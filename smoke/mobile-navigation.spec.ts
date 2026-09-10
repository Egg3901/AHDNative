import { test, expect } from '@playwright/test';
import { gameReady, openGameMenu, closeGameMenu, navigateGame, advanceGame } from './game-navigation';

for (const width of [320, 390]) {
  test(`mobile navigation uses a side drawer and bottom bar at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: 'New game', exact: true }).click();
    await page.getByLabel('Your name').fill('Mobile Player');
    await page.getByLabel('Seed', { exact: false }).fill('mobile-navigation');
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await gameReady(page);
    await expect(page.getByRole('banner')).toHaveCount(0);
    await expect(page.getByRole('tablist')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'End turn', exact: true })).toHaveCount(0);
    const primary = page.getByRole('navigation', { name: 'Primary', exact: true });
    await expect(primary.getByRole('button')).toHaveCount(4);
    const bounds = await primary.boundingBox();
    expect(bounds!.y).toBeGreaterThan(844 - 100);
    expect((await page.getByRole('contentinfo').boundingBox())!.height).toBeLessThan(160);
    await page.screenshot({ path: `artifacts/smoke/mobile-navigation-${width}.png`, fullPage: true });
    await openGameMenu(page);
    const drawer = page.getByRole('dialog', { name: 'Game menu', exact: true });
    await expect(drawer).toHaveAttribute('aria-modal', 'true');
    await expect.poll(async () => (await drawer.boundingBox())?.x).toBe(0);
    const drawerBounds = await drawer.boundingBox();
    expect(drawerBounds!.width).toBeLessThan(width);
    await expect(drawer.getByRole('button', { name: 'End turn', exact: true })).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Save game', exact: true })).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Exit game', exact: true })).toBeVisible();
    await page.screenshot({ path: `artifacts/smoke/mobile-drawer-${width}.png` });
    await closeGameMenu(page);
    await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeFocused();
    await navigateGame(page, 'News');
    await advanceGame(page);
    await expect(page.getByRole('contentinfo')).toContainText('Turn 1');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
