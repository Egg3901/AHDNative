import { expect, type Page } from '@playwright/test';

/**
 * Completes the reference character-creation file (#242) after world setup.
 * Fills the background option chips, picks a party (or Independent), and spends
 * all stat points, then submits. The character name was prefilled from the
 * world-setup name, so existing flows keep their identity.
 *
 * The stat allocation deliberately leaves Energy at its floor so the action
 * cap stays at the baseline 200 the standing assertions expect; Energy is a real
 * consequence but this helper keeps unrelated flows stable.
 */
export async function completeCharacterCreation(page: Page, options: { party?: string } = {}) {
  await expect(page.getByRole('heading', { name: /Create your politician/ })).toBeVisible();
  await page.getByRole('button', { name: 'Female', exact: true }).click();
  await page.getByRole('button', { name: 'White', exact: true }).click();
  await page.getByRole('button', { name: 'College', exact: true }).click();
  await page.getByRole('button', { name: 'Middle Income', exact: true }).click();
  if (options.party) {
    await page.getByRole('button', { name: options.party, exact: false }).click();
  } else {
    await page.getByRole('button', { name: 'Independent', exact: true }).click();
  }
  // Spend all 21 free points without touching Energy (9 + 9 + 3 = 21), so the
  // baseline action cap 200 the standing assertions expect is preserved. The
  // resulting fundraising stat is 1, so fundraise yield is 0.82x neutral.
  for (let i = 0; i < 9; i++) await page.getByRole('button', { name: 'Increase Debate', exact: true }).click();
  for (let i = 0; i < 9; i++) await page.getByRole('button', { name: 'Increase Statecraft', exact: true }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Increase Business Acumen', exact: true }).click();
  await page.getByRole('button', { name: 'Create character', exact: true }).click();
}

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
