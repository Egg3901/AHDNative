import { openGameMenu, gameReady } from './game-navigation';
import { test, expect } from '@playwright/test';

test('offline help and presentation preferences remain usable and survive relaunch', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  await page.context().setOffline(true);
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Saving and recovery' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to home' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('radio', { name: 'Large', exact: true }).check();
  await page.getByRole('radio', { name: 'Reduce motion', exact: true }).check();
  await expect(page.locator('html')).toHaveCSS('font-size', '20px');
  await expect(page.getByRole('button', { name: 'Back to home' })).toHaveCSS('transition-duration', '0s');
  await page.context().setOffline(false);
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Large', exact: true })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Reduce motion', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Back to home' }).click();
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill('Reading Player');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await gameReady(page);
  await openGameMenu(page);
  await page.getByRole('dialog', { name: 'Game menu' }).getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Large', exact: true })).toBeChecked();
  await expect(page.getByRole('contentinfo')).toContainText('Turn 0');
  await expect(page.getByRole('banner')).toHaveCount(0);
  const main = await page.getByRole('main').boundingBox();
  const footer = await page.getByRole('contentinfo').boundingBox();
  expect(footer!.y - main!.y).toBeGreaterThanOrEqual(160);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/smoke/mobile-large-text-settings.png', fullPage: true });
});

test('preference storage failure keeps the selection active and explains persistence failure', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'ahdnative-preferences-v1') throw new DOMException('Storage blocked', 'SecurityError');
      return original.call(this, key, value);
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('radio', { name: 'Large', exact: true }).check();
  await expect(page.getByRole('alert')).toContainText('could not be saved');
  await expect(page.getByRole('radio', { name: 'Large', exact: true })).toBeChecked();
  await expect(page.locator('html')).toHaveCSS('font-size', '20px');
  await page.getByRole('button', { name: 'Back to home' }).click();
  await expect(page.getByRole('button', { name: 'New game', exact: true })).toBeEnabled();
});
