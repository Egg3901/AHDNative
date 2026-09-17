import { expect, type Page } from '@playwright/test';

/**
 * Completes the reference character-creation file (#242) after world setup.
 * Fills the background option chips, answers the compass deliberately, picks a
 * party (or Independent), and spends all stat points, then submits. The
 * character name was prefilled from the world-setup name, so existing flows
 * keep their identity.
 *
 * The stat allocation deliberately leaves Energy at its floor so the action
 * cap stays at the baseline 200 the standing assertions expect; Energy is a real
 * consequence but this helper keeps unrelated flows stable.
 */
export async function completeCharacterCreation(page: Page, options: { party?: string } = {}) {
  await expect(page.getByRole('heading', { name: /Create your politician/ })).toBeVisible();
  // The conversational presentation (#335/#336) shows one canonical step at a
  // time: Country (informational) -> The politician -> Home region ->
  // Where you stand -> Party -> Stats. Walk it in order.
  await page.getByRole('button', { name: /Continue to The politician/i }).click();
  await page.getByRole('button', { name: 'Female', exact: true }).click();
  await page.getByRole('button', { name: 'White', exact: true }).click();
  await page.getByRole('button', { name: 'College', exact: true }).click();
  await page.getByRole('button', { name: 'Middle Income', exact: true }).click();
  await page.getByRole('button', { name: /Continue to Home/i }).click();
  await page.getByRole('button', { name: /Continue to Where you stand/i }).click();
  // The compass is a deliberate answer independent of party choice now; move
  // Economics off centre so the step registers as answered, then leave it there.
  const economic = page.getByLabel('Economic position', { exact: true });
  await economic.fill('1');
  await page.getByRole('button', { name: /Continue to Party/i }).click();
  if (options.party) {
    await page.getByRole('button', { name: options.party, exact: false }).click();
  } else {
    await page.getByRole('button', { name: 'Independent', exact: true }).click();
  }
  await page.getByRole('button', { name: /Continue to Stats/i }).click();
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

const NATION_DESTINATIONS = new Set([
  'Elections', 'Parties', 'Start a party', 'Caucuses', 'Politicians',
  'Presidential election', 'Political metrics', 'Referendums', 'Legislature',
  'Bills and proposals', 'Policy', 'Economy', 'National Budget', 'National Metrics',
]);
const WORLD_DESTINATIONS = new Set([
  'Stock market', 'Bonds', 'Banking', 'Nations', 'News', 'World settings',
]);

export async function chooseGameMenuDestination(page: Page, name: string) {
  const dialog = page.getByRole('dialog', { name: 'Game menu' });
  const destination = dialog.getByRole('button', { name, exact: true });
  if (!(await destination.isVisible())) {
    const disclosure = NATION_DESTINATIONS.has(name)
      ? 'Nation'
      : WORLD_DESTINATIONS.has(name)
        ? 'World'
        : null;
    if (disclosure) {
      await dialog.getByRole('button', { name: disclosure, exact: true }).click();
      await expect(destination).toBeVisible();
    }
  }
  await destination.click();
}

export async function closeGameMenu(page: Page) {
  const menu = page.locator('button[aria-controls="ahd-drawer"]');
  if (await menu.getAttribute('aria-expanded') === 'true') await page.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
}

/**
 * Test-only fixture bootstrap (#506). Loads save bytes through the DEV-only
 * `window.__ahdTestHooks` boundary installed by the app (same worker/store
 * path as a native resume). The production smoke bundle is compiled with an
 * explicit CI-only flag; ordinary production builds omit the hook.
 */
export async function loadFixture(page: Page, fixture: Buffer) {
  await page.evaluate(async (saveText: string) => {
    const hooks = (window as unknown as { __ahdTestHooks?: { loadFixture: (contents: string) => Promise<void> } }).__ahdTestHooks;
    if (!hooks) throw new Error('Test fixture hooks are unavailable in this build.');
    await hooks.loadFixture(saveText);
  }, fixture.toString('utf8'));
}

export async function gameReady(page: Page) {
  await closeGameMenu(page);
  await expect(page.getByRole('contentinfo')).toBeVisible();
  await expect(page.getByRole('contentinfo')).not.toContainText('Processing');
  await expect(page.getByText('Loading profile...', { exact: true })).toHaveCount(0);
}

export async function navigateGame(page: Page, name: string) {
  await openGameMenu(page);
  await chooseGameMenuDestination(page, name);
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
