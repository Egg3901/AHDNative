import { expect, type Page } from '@playwright/test';

export async function openGameMenu(page: Page) {
  const menu = page.locator('button[aria-controls="ahd-drawer"]');
  if (await menu.getAttribute('aria-expanded') !== 'true') await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
}

export async function closeGameMenu(page: Page) {
  const menu = page.locator('button[aria-controls="ahd-drawer"]');
  if (await menu.getAttribute('aria-expanded') === 'true') await page.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
}

export async function gameReady(page: Page) {
  await closeGameMenu(page);
  await expect(page.getByRole('contentinfo')).toBeVisible();
  await expect(page.getByRole('contentinfo')).not.toContainText('Processing');
  await expect(page.getByText('Loading profile...', { exact: true })).toHaveCount(0);
}

export async function navigateGame(page: Page, name: string) {
  await openGameMenu(page);
  await page.getByRole('dialog', { name: 'Game menu' }).getByRole('button', { name, exact: true }).click();
  await expect(page.locator('button[aria-controls="ahd-drawer"]')).toHaveAttribute('aria-expanded', 'false');
}

export async function advanceGame(page: Page) {
  await openGameMenu(page);
  const endTurn = page.getByRole('button', { name: 'End turn', exact: true });
  await expect(endTurn).toBeEnabled();
  await endTurn.click();
  await expect(endTurn).toBeEnabled();
  await gameReady(page);
}

export async function saveGame(page: Page) {
  await openGameMenu(page);
  const save = page.getByRole('button', { name: 'Save game', exact: true });
  await save.click();
  await expect(save).toBeEnabled();
  await gameReady(page);
}

export async function exitGame(page: Page) {
  await openGameMenu(page);
  await page.getByRole('button', { name: 'Exit game', exact: true }).click();
}
