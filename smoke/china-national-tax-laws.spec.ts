import { expect, test } from '@playwright/test';
import { advanceGame, completeCharacterCreation, gameReady, navigateGame, saveGame } from './game-navigation';

test('China HoS proposes, enacts, saves and resumes an authored customs tariff law', async ({ page }) => {
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

  const bill = page.getByRole('article', { name: 'Statutory Customs Tariff Law' })
    .filter({ hasText: 'China Law Player' })
    .filter({ hasText: /signed/i });
  let enacted = false;
  for (let turn = 0; turn < 8; turn++) {
    if (await bill.count()) {
      const text = await bill.innerText();
      if (/signed/i.test(text)) {
        enacted = true;
        break;
      }
    }
    await advanceGame(page);
  }
  await expect(bill).toHaveCount(1);
  expect(enacted).toBe(true);

  await navigateGame(page, 'National Budget');
  const tariff = page.getByRole('listitem').filter({ hasText: 'Customs Duties (关税)' });
  const tariffTextBeforeSave = await tariff.innerText();
  const savedRate = tariffTextBeforeSave.match(/(\d+(?:\.\d+)?% rate)/)?.[1];
  expect(savedRate, 'enacted tariff should affect the live national budget').toBeTruthy();
  expect(Number.parseFloat(savedRate!)).toBeGreaterThan(0);
  await saveGame(page);
  await page.reload();
  await page.getByRole('button', { name: 'Continue China Law Player', exact: true }).click();
  await gameReady(page);
  await navigateGame(page, 'Bills and proposals');
  await expect(page.getByRole('article', { name: 'Statutory Customs Tariff Law' })
    .filter({ hasText: 'China Law Player' })
    .filter({ hasText: /signed/i })).toHaveCount(1);
  await navigateGame(page, 'National Budget');
  await expect(page.getByRole('listitem').filter({ hasText: 'Customs Duties (关税)' })).toContainText(savedRate!);
  expect(errors).toEqual([]);
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/smoke/china-tariff-law-resumed-320.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/smoke/china-tariff-law-resumed.png', fullPage: true });
});
