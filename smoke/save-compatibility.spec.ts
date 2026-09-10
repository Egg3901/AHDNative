import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

// This fixture was minted by the pinned historical v42 engine, not relabelled v43.
const historicalSave = gunzipSync(readFileSync(new URL('../fixtures/v42-1953-US.save.json.gz', import.meta.url)));

test('an authentic v42 save imports, advances, and reloads through the game UI', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Import saved game', { exact: true }).setInputFiles({
    name: 'historical-v42.json', mimeType: 'application/json', buffer: historicalSave,
  });
  const endTurn = page.getByRole('button', { name: 'End turn', exact: true });
  await expect(endTurn).toBeEnabled();
  await expect(page.getByText(/^1953 · Turn 0 ·/)).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Saved game imported');
  await endTurn.click();
  await expect(endTurn).toBeEnabled();
  await expect(page.getByText(/^1953 · Turn 1 ·/)).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Game saved');
  await page.reload();
  await page.getByRole('button', { name: 'Continue Validator', exact: true }).click();
  await expect(endTurn).toBeEnabled();
  await expect(page.getByText(/^1953 · Turn 1 ·/)).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
