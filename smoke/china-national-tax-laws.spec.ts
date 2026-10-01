import { expect, test } from '@playwright/test';
import { advanceGame, completeCharacterCreation, gameReady, navigateGame, saveGame } from './game-navigation';

test('China 2019 Head of State directly decrees, replaces and resumes a tariff at phone widths', async ({ page }) => {
  test.setTimeout(600_000);
  page.setDefaultTimeout(30_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill('China Law Player');
  await page.getByLabel('Seed', { exact: false }).fill('cn-budget-laws-2019');
  await page.getByRole('radio', { name: '2019 Start Date - Default Parties' }).check();
  await page.getByLabel('Country', { exact: true }).selectOption('CN');
  await page.getByLabel('Head of State').check();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await completeCharacterCreation(page, { party: 'CCP' });
  await gameReady(page);

  await navigateGame(page, 'Legislature');
  await page.getByRole('button', { name: 'Browse bills and proposals', exact: true }).click();
  await page.getByRole('combobox', { name: 'Available legislation' }).selectOption('cn_customs_tariff');
  await page.getByRole('combobox', { name: 'Tax rate' }).selectOption('10');
  await page.getByRole('button', { name: 'Sponsor bill', exact: true }).click();
  await gameReady(page);

  let bills = page.getByRole('article', { name: 'Statutory Customs Tariff Law' })
    .filter({ hasText: 'China Law Player' });
  await expect(bills).toHaveCount(1);
  await expect(bills.last()).toContainText(/signed/i);
  await expect(bills.last()).toContainText('0 for · 0 against');

  await navigateGame(page, 'National Budget');
  let tariff = page.getByRole('listitem').filter({ hasText: 'Customs Duties (关税)' });
  // Independent Game@968 vector: 2019 CN starts at 0%; 10% is the authored
  // target. Source tax phase-in moves at most 1 percentage point per turn, so
  // the direct enactment immediately records 1% on the 22.68T import base:
  // 22.68T × 1% = 226.8B revenue.
  await expect(tariff).toContainText('1.0% rate');
  await expect(tariff).toContainText('226,800,000,000');

  // Save/reload the enacted decree at 320px before the next ordinary turn.
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await saveGame(page);
  await page.reload();
  await page.getByRole('button', { name: 'Continue China Law Player', exact: true }).click();
  await gameReady(page);
  await navigateGame(page, 'Bills and proposals');
  bills = page.getByRole('article', { name: 'Statutory Customs Tariff Law' })
    .filter({ hasText: 'China Law Player' });
  await expect(bills).toHaveCount(1);
  await expect(bills.last()).toContainText(/signed/i);
  await expect(bills.last()).toContainText('0 for · 0 against');
  await navigateGame(page, 'National Budget');
  tariff = page.getByRole('listitem').filter({ hasText: 'Customs Duties (关税)' });
  await expect(tariff).toContainText('1.0% rate');

  // One source-ordered normal turn moves the rate from 1% to 2%.
  await advanceGame(page);
  await expect(tariff).toContainText('2.0% rate');

  // Replacing with the authored zero-rate option is another direct decree.
  await navigateGame(page, 'Legislature');
  await page.getByRole('button', { name: 'Browse bills and proposals', exact: true }).click();
  await page.getByRole('combobox', { name: 'Available legislation' }).selectOption('cn_customs_tariff');
  await page.getByRole('combobox', { name: 'Tax rate' }).selectOption('0');
  await page.getByRole('button', { name: 'Sponsor bill', exact: true }).click();
  await gameReady(page);
  bills = page.getByRole('article', { name: 'Statutory Customs Tariff Law' })
    .filter({ hasText: 'China Law Player' });
  await expect(bills).toHaveCount(2);
  await expect(bills.last()).toContainText(/signed/i);
  await expect(bills.last()).toContainText('0 for · 0 against');
  await navigateGame(page, 'National Budget');
  tariff = page.getByRole('listitem').filter({ hasText: 'Customs Duties (关税)' });
  await expect(tariff).toContainText('1.0% rate');

  // The replacement's zero target finishes on the next normal turn; save at
  // 390px and prove both the replacement history and settled budget survive.
  await advanceGame(page);
  await expect(tariff).toContainText('0.0% rate');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await saveGame(page);
  await page.reload();
  await page.getByRole('button', { name: 'Continue China Law Player', exact: true }).click();
  await gameReady(page);
  await navigateGame(page, 'Bills and proposals');
  bills = page.getByRole('article', { name: 'Statutory Customs Tariff Law' })
    .filter({ hasText: 'China Law Player' });
  await expect(bills).toHaveCount(2);
  for (let index = 0; index < 2; index++) {
    await expect(bills.nth(index)).toContainText(/signed/i);
    await expect(bills.nth(index)).toContainText('0 for · 0 against');
  }
  await navigateGame(page, 'National Budget');
  await expect(page.getByRole('listitem').filter({ hasText: 'Customs Duties (关税)' })).toContainText('0.0% rate');

  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/smoke/china-tariff-law-resumed-320.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/smoke/china-tariff-law-resumed-390.png', fullPage: true });
});
