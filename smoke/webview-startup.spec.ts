import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { exitGame, gameReady, completeCharacterCreation, loadFixture } from './game-navigation';

test('new game and fixture loading remain usable when a webview has no randomUUID', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill('Webview Player');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await completeCharacterCreation(page);
  await expect(page.getByRole('region', { name: 'Profile', exact: true })).toContainText('Webview Player', { timeout: 8000 });
  await gameReady(page);
  await page.reload();
  await page.getByRole('button', { name: 'Continue Webview Player', exact: true }).click();
  await gameReady(page);
  await exitGame(page);
  await loadFixture(page, gunzipSync(readFileSync('fixtures/v42-1953-US.save.json.gz')));
  await gameReady(page);
  await expect(page.getByRole('region', { name: 'Profile', exact: true })).toContainText('Validator');
  await exitGame(page);
  await expect(page.getByRole('button', { name: 'Continue Webview Player', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue Validator', exact: true })).toBeVisible();
});
