import { expect, test } from '@playwright/test';
import { GameSession } from '../src/game/session';
import { gameReady, loadFixture, navigateGame, openGameMenu, saveGame } from './game-navigation';

const SAVED_AT = '2026-10-01T00:00:00.000Z';

test('actual executive taking opens its National Corporation register and survives two phone resumes', async ({ page }) => {
  test.setTimeout(600_000);
  page.setDefaultTimeout(30_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const session = new GameSession();
  session.create({ era: '1953', countryId: 'US', homeRegionId: 'NY', mode: 'hos', seed: 'state-register-mobile', playerName: 'Register Operator' });
  const saved = JSON.parse(session.serialize(SAVED_AT));
  // Fresh procedural NPC ownership is eligible in the source. Government
  // authority and the taking itself use the actual public worker flow.
  const firmName = saved.world.corporations['US-media'].name;
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');
  await loadFixture(page, Buffer.from(JSON.stringify(saved)));
  await gameReady(page);
  await navigateGame(page, 'Actions');
  await page.getByRole('tab', { name: /Executive,/ }).click();
  await page.getByLabel('Corporation for Nationalize Corporation').selectOption('US-media');
  await page.getByRole('button', { name: 'Take action: Nationalize Corporation', exact: true }).click();
  await gameReady(page);

  const openRegister = async () => {
    await navigateGame(page, 'National Budget');
    await page.getByRole('button', { name: 'State ownership register', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'State ownership register', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Register', exact: true })).toHaveAttribute('aria-selected', 'true');
    const actions = page.getByRole('region', { name: 'State ownership actions', exact: true });
    await expect(actions).toContainText(firmName);
    await expect(actions).toContainText('NPC-owned');
    await expect(actions).toContainText('Executive');
    await expect(actions).toContainText('Seizure');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  };

  await openRegister();
  await page.getByRole('button', { name: /United States National Corporation.*media/ }).click();
  await expect(page.getByRole('heading', { name: 'Company', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to state ownership', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'State ownership register', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to budget', exact: true }).click();
  await expect(page.getByRole('button', { name: 'State ownership register', exact: true })).toBeVisible();
  await openGameMenu(page);
  const endTurn = page.getByRole('button', { name: 'End turn', exact: true });
  await expect(endTurn).toBeEnabled();
  await endTurn.click();
  await expect(endTurn).toBeEnabled({ timeout: 90_000 });
  await gameReady(page);
  await saveGame(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Continue Register Operator', exact: true }).click();
  await gameReady(page);
  await openRegister();
  await page.screenshot({ path: 'artifacts/smoke/state-register-320-resumed.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await saveGame(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Continue Register Operator', exact: true }).click();
  await gameReady(page);
  await openRegister();
  await page.screenshot({ path: 'artifacts/smoke/state-register-390-resumed.png', fullPage: true });
  expect(errors).toEqual([]);
});
