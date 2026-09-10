import { test, expect } from '@playwright/test';

async function createWorldAndExit(page: import('@playwright/test').Page, name: string, seed: string) {
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Seed', { exact: false }).fill(seed);
  await page.getByLabel('Country', { exact: true }).selectOption('US');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('button', { name: 'End turn', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Exit game', exact: true }).click();
  await expect(page.getByRole('button', { name: `Continue ${name}` })).toBeVisible();
}

test('delete requires explicit confirmation: cancel preserves, confirm deletes only chosen slot and survives reload', async ({ page }) => {
  await page.goto('/');
  await createWorldAndExit(page, 'DeleteOne', 'delete-one-seed');
  await createWorldAndExit(page, 'DeleteTwo', 'delete-two-seed');
  await expect(page.getByRole('button', { name: /Continue DeleteOne/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Continue DeleteTwo/ })).toBeVisible();

  const deleteOne = page.getByRole('button', { name: 'Delete DeleteOne', exact: true });
  await deleteOne.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('DeleteOne');
  await expect(dialog).toContainText('US');
  await expect(dialog).toContainText('Turn');
  await expect(dialog).toContainText('cannot be undone');
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();

  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: /Continue DeleteOne/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Continue DeleteTwo/ })).toBeVisible();

  await deleteOne.click();
  await expect(dialog).toBeVisible();
  const confirm = page.getByRole('button', { name: 'Confirm delete DeleteOne', exact: true });
  // Busy lock: double click should not duplicate effect
  await confirm.evaluate((btn) => { (btn as HTMLButtonElement).click(); (btn as HTMLButtonElement).click(); });
  await expect(page.getByRole('button', { name: /Continue DeleteOne/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Continue DeleteTwo/ })).toBeVisible();
  await expect(dialog).toBeHidden();

  await page.reload();
  await expect(page.getByRole('button', { name: /Continue DeleteOne/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Continue DeleteTwo/ })).toBeVisible();
});

test('deleting the currently loaded world clears Return to game and does not silently recreate', async ({ page }) => {
  await page.goto('/');
  await createWorldAndExit(page, 'LoadedPlayer', 'loaded-seed');
  await expect(page.getByRole('button', { name: 'Return to game', exact: true })).toBeVisible();
  const del = page.getByRole('button', { name: 'Delete LoadedPlayer', exact: true });
  await del.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm delete LoadedPlayer', exact: true }).click();
  await expect(page.getByRole('button', { name: /Continue LoadedPlayer/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Return to game', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: /Continue LoadedPlayer/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Return to game', exact: true })).toHaveCount(0);
});

test('delete failure shows error and retains the save', async ({ page }) => {
  await page.goto('/');
  await createWorldAndExit(page, 'FailPlayer', 'fail-seed');
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    (IDBDatabase.prototype as unknown as Record<string, unknown>).__origTx = original;
    IDBDatabase.prototype.transaction = function (...args: Parameters<typeof original>) {
      const tx = (original as unknown as (...a: unknown[]) => IDBTransaction).apply(this, args as unknown as unknown[]);
      if (args[1] === 'readwrite') queueMicrotask(() => { try { tx.abort(); } catch { /* ignore */ } });
      return tx;
    };
  });
  await page.getByRole('button', { name: 'Delete FailPlayer', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm delete FailPlayer', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: /Continue FailPlayer/ })).toBeVisible();
  // restore for cleanup
  await page.evaluate(() => {
    const orig = (IDBDatabase.prototype as unknown as Record<string, unknown>).__origTx;
    if (orig) IDBDatabase.prototype.transaction = orig as typeof IDBDatabase.prototype.transaction;
  });
});
