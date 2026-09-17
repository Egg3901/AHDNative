import { gameReady, advanceGame, loadFixture } from './game-navigation';
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

// This fixture was minted by the pinned historical v42 engine, not relabelled v43.
const historicalSave = gunzipSync(readFileSync(new URL('../fixtures/v42-1953-US.save.json.gz', import.meta.url)));

test('an authentic v42 save loads, advances, and reloads through the game UI', async ({ page }) => {
  await page.goto('/');
  await loadFixture(page, historicalSave);
  await gameReady(page);
  await expect(page.getByRole('contentinfo')).toContainText('Turn 0 ·');
  await expect(page.getByRole('status')).toContainText('Saved game loaded');
  await advanceGame(page);
  await gameReady(page);
  await expect(page.getByRole('contentinfo')).toContainText('Turn 1 ·');
  await expect(page.getByRole('status')).toContainText('Game saved');
  await page.reload();
  await page.getByRole('button', { name: 'Continue Validator', exact: true }).click();
  await gameReady(page);
  await expect(page.getByRole('contentinfo')).toContainText('Turn 1 ·');
  await expect(page.getByRole('alert')).toHaveCount(0);
});
