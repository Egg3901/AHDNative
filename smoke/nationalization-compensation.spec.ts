import { expect, test } from '@playwright/test';
import { GameSession } from '../src/game/session';
import { advanceGame, gameReady, loadFixture, navigateGame, saveGame } from './game-navigation';

test('Official National Corporation paid taking survives a normal turn and two phone resumes', async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const session = new GameSession();
  session.create({ era: '1953', countryId: 'US', homeRegionId: 'NY', mode: 'hos', seed: 'paid-taking-mobile', playerName: 'Alex' });
  const saved = JSON.parse(session.serialize('2026-10-02T00:00:00.000Z'));
  const targetName = saved.world.corporations['US-manufacturing'].name;
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');
  await loadFixture(page, Buffer.from(JSON.stringify(saved)));
  await gameReady(page);

  // Source National Corporation entry currently follows the first actual taking.
  // The wider fresh-country entry remains an explicit #75 gap.
  await navigateGame(page, 'Actions');
  await page.getByRole('tab', { name: /Executive,/ }).click();
  await page.getByLabel('Corporation for Nationalize Corporation').selectOption('US-media');
  await page.getByRole('button', { name: 'Take action: Nationalize Corporation', exact: true }).click();
  await gameReady(page);
  await navigateGame(page, 'National Budget');
  await page.getByRole('button', { name: 'State ownership register', exact: true }).click();
  await page.getByRole('button', { name: /United States National Corporation.*media/ }).click();
  await expect(page.getByRole('tab', { name: 'Nationalize', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Official', exact: true }).click();
  await page.getByRole('tab', { name: 'Nationalize', exact: true }).click();
  await page.getByRole('radio', { name: new RegExp(targetName) }).check();
  await expect(page.getByRole('combobox', { name: 'Tier', exact: true })).toHaveValue('discounted');
  await expect(page.getByText(/Final amount computed and debited at execution/)).toBeVisible();
  await page.getByRole('button', { name: 'Nationalize', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: `${targetName} was absorbed into` })).toBeVisible();
  await gameReady(page);

  const openPaidRegister = async () => {
    await navigateGame(page, 'National Budget');
    await page.getByRole('button', { name: 'State ownership register', exact: true }).click();
    const paid = page.getByRole('region', { name: 'State ownership actions', exact: true }).locator('article').filter({ has: page.getByRole('heading', { name: targetName, exact: true }) });
    await expect(paid).toContainText('Discounted');
    const compensation = paid.locator('dl > div').filter({ has: page.getByText('Compensation', { exact: true }) }).locator('dd');
    await expect(compensation).not.toHaveText('None');
    await expect(compensation).toContainText('$');
    expect(Number((await compensation.innerText()).replace(/[^\d.-]/g, ''))).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  };
  await openPaidRegister();
  await advanceGame(page);
  await saveGame(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Continue Alex', exact: true }).click();
  await gameReady(page);
  await openPaidRegister();
  await page.screenshot({ path: 'artifacts/smoke/paid-taking-320-resumed.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await saveGame(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Continue Alex', exact: true }).click();
  await gameReady(page);
  await openPaidRegister();
  await page.screenshot({ path: 'artifacts/smoke/paid-taking-390-resumed.png', fullPage: true });
  expect(errors).toEqual([]);
});
