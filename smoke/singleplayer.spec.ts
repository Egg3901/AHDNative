import { test, expect } from '@playwright/test';
test('a real singleplayer world survives save and relaunch on a phone sized screen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill('Smoke Player');
  await page.getByLabel('Seed', { exact: false }).fill('native-smoke-1953');
  await page.getByLabel('Country', { exact: true }).selectOption('US');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('button', { name: 'End turn', exact: true })).toBeEnabled();
  await page.getByRole('tab', { name: 'Character', exact: true }).click();
  const amount = page.getByRole('spinbutton', { name: /Amount for/ });
  await amount.fill('2000');
  await amount.locator('xpath=../..').getByRole('button').click();
  await expect(page.getByRole('status')).toContainText(/2,000|2000/);
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'End turn', exact: true }).click();
  await expect(page.getByText(/^1953 · Turn 1 ·/)).toBeVisible();
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Game saved' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /Continue Smoke Player/ }).click();
  await expect(page.getByText(/^1953 · Turn 1 ·/)).toBeVisible();
  await page.getByRole('button', { name: 'End turn', exact: true }).click();
  await expect(page.getByText(/^1953 · Turn 2 ·/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: 'End turn', exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'artifacts/smoke/mobile-world.png', fullPage: true });
});

test('a corrupt import leaves the saved world available', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill('Recovery Player');
  await page.getByLabel('Seed', { exact: false }).fill('recovery-smoke');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'Exit game', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue Recovery Player' })).toBeVisible();
  await page.getByLabel('Import saved game', { exact: true }).setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{broken') }, { timeout: 10_000 });
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Continue Recovery Player' }).click();
  await expect(page.getByRole('button', { name: 'End turn', exact: true })).toBeEnabled();
});

test('a completed turn is saved before the app is closed', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill('Autosave Player');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  const endTurn = page.getByRole('button', { name: 'End turn', exact: true });
  await expect(endTurn).toBeEnabled();
  await endTurn.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(page.getByRole('status').filter({ hasText: 'Game saved' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/^1953 · Turn 1 ·/)).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Continue Autosave Player' }).click();
  await expect(page.getByText(/^1953 · Turn 1 ·/)).toBeVisible();
});

test('a failed save reports failure and preserves the last completed save', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill('Storage Recovery');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  const endTurn = page.getByRole('button', { name: 'End turn', exact: true });
  await expect(endTurn).toBeEnabled();
  // Inject an external storage failure. The real worker and IDB transaction still run.
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args: Parameters<typeof original>) {
      const tx = original.apply(this, args);
      if (args[1] === 'readwrite') queueMicrotask(() => tx.abort());
      return tx;
    };
  });
  await endTurn.click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText(/^1953 · Turn 1 ·/)).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Game saved' })).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Continue Storage Recovery' }).click();
  await expect(page.getByText(/^1953 · Turn 0 ·/)).toBeVisible();
});
