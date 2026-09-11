import { test, expect } from '@playwright/test';
import { gameReady } from './game-navigation';

test('notification read state survives closing the app without a manual save', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill('Inbox Reader');
  await page.getByLabel('Seed', { exact: false }).fill('inbox-browser-review');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await gameReady(page);
  await page.getByRole('button', { name: /Notifications, .* unread/ }).click();
  await page.getByRole('button', { name: 'Delete: Game saved · Turn 0', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete: Game saved · Turn 0', exact: true })).toHaveCount(0, { timeout: 2000 });
  await page.getByRole('button', { name: /Open inbox/ }).click();
  await page.screenshot({ path: 'artifacts/smoke/inbox-390.png', fullPage: true });
  await page.getByRole('button', { name: 'Mark all read', exact: true }).click();
  await gameReady(page);
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Continue Inbox Reader', exact: true }).click();
  await gameReady(page);
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete: Game saved · Turn 0', exact: true })).toHaveCount(0);
});
