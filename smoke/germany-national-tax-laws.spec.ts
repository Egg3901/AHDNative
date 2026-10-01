import { expect, test } from '@playwright/test';
import { advanceGame, completeCharacterCreation, gameReady, navigateGame, saveGame } from './game-navigation';

test('Germany singleplayer Chancellor decrees, replaces and resumes a VAT law at phone widths', async ({ page }) => {
  test.setTimeout(600_000);
  page.setDefaultTimeout(30_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill('Germany Law Player');
  await page.getByLabel('Seed', { exact: false }).fill('de-budget-laws-2019');
  await page.getByRole('radio', { name: '2019 Start Date - Default Parties' }).check();
  await page.getByLabel('Country', { exact: true }).selectOption('DE');
  await page.getByLabel('Head of State').check();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await completeCharacterCreation(page);
  await gameReady(page);
  await navigateGame(page, 'Actions');
  await expect(page.getByText(/Permanent Head of State · Chancellor/i)).toBeVisible();
  // Source office position grants 2.5 NPI per turn; the ordinary action
  // refresh accrues the 5 NPI needed for a non-tariff provision over two turns.
  await advanceGame(page);
  await advanceGame(page);

  async function proposeVat(rate: string) {
    await navigateGame(page, 'Legislature');
    await page.getByRole('button', { name: 'Browse bills and proposals', exact: true }).click();
    await page.getByRole('combobox', { name: 'Available legislation' }).selectOption('de_vat_rate');
    await page.getByRole('combobox', { name: 'Tax rate' }).selectOption(rate);
    const sponsor = page.getByRole('button', { name: 'Sponsor bill', exact: true });
    await expect(sponsor).toBeEnabled();
    await sponsor.click();
    await gameReady(page);
  }

  async function enactVat(rate: string) {
    const bills = page.getByRole('article', { name: 'Statutory VAT Act' })
      .filter({ hasText: 'Germany Law Player' });
    const bill = bills.last();
    let enacted = false;
    for (let turn = 0; turn < 12; turn++) {
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
    expect(enacted, `German Chancellor decree should sign the ${rate}% VAT bill immediately`).toBe(true);
    await expect(bill).toContainText(/signed/i);
    await expect(bill).toContainText('0 for · 0 against');
  }

  // Source-backed selector and local singleplayer decree flow at 390px.
  await proposeVat('20');
  await enactVat('20');
  await navigateGame(page, 'National Budget');
  const vatRow = page.getByRole('listitem').filter({ hasText: 'VAT' });
  await expect(vatRow).toContainText('20.0% rate');

  // Save/reload at 320px, then exercise a real replacement through the same UI.
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await saveGame(page);
  await page.reload();
  await page.getByRole('button', { name: 'Continue Germany Law Player', exact: true }).click();
  await gameReady(page);
  await navigateGame(page, 'Actions');
  await expect(page.getByText(/Permanent Head of State · Chancellor/i)).toBeVisible();
  await proposeVat('22');
  await enactVat('22');
  await navigateGame(page, 'National Budget');
  const vatRow = page.getByRole('listitem').filter({ hasText: 'VAT' });
  await expect(vatRow).toContainText('21.0% rate');
  await advanceGame(page);
  await expect(vatRow).toContainText('22.0% rate');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await saveGame(page);
  await page.reload();
  await page.getByRole('button', { name: 'Continue Germany Law Player', exact: true }).click();
  await gameReady(page);
  await navigateGame(page, 'Bills and proposals');
  const savedBills = page.getByRole('article', { name: 'Statutory VAT Act' }).filter({ hasText: 'Germany Law Player' });
  await expect(savedBills).toHaveCount(2);
  for (let index = 0; index < 2; index++) {
    await expect(savedBills.nth(index)).toContainText(/signed/i);
    await expect(savedBills.nth(index)).toContainText('0 for · 0 against');
  }
  await navigateGame(page, 'National Budget');
  await expect(page.getByRole('listitem').filter({ hasText: 'VAT' })).toContainText('22.0% rate');

  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/smoke/germany-vat-law-resumed-320.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/smoke/germany-vat-law-resumed-390.png', fullPage: true });
});
