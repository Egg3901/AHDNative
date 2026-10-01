import { expect, test } from '@playwright/test';
import { advanceGame, completeCharacterCreation, gameReady, navigateGame, saveGame } from './game-navigation';

test('player organizes a union, accepts its presidency, bargains, advances and resumes', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill('Union Organizer');
  await page.getByLabel('Seed', { exact: false }).fill('union-leadership-browser-flow');
  await page.getByLabel('Country', { exact: true }).selectOption('US');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await completeCharacterCreation(page);
  await gameReady(page);

  await navigateGame(page, 'Stock market');
  const union = page.getByTestId('union-US-manufacturing');
  await expect(union).toBeVisible();
  await expect(union).toContainText('Organizing strength 0.0 / 100');
  let strength = 0;
  const currentTurnLabel = async () => (await page.getByRole('contentinfo').innerText()).match(/Turn \d+ ·[^\n]*/)?.[0] ?? '';
  const advanceAndWait = async () => {
    const previousTurn = await currentTurnLabel();
    expect(previousTurn).not.toBe('');
    await advanceGame(page);
    await expect(page.getByRole('contentinfo')).not.toContainText(previousTurn, { timeout: 120_000 });
  };
  for (let drive = 0; drive < 20; drive++) {
    const organize = union.getByRole('button', { name: 'Organize United Steelworkers' });
    while (await organize.isDisabled()) {
      await advanceAndWait();
      strength *= 0.995;
      await expect(union).toContainText(`Organizing strength ${strength.toFixed(1)} / 100`);
    }
    await expect(organize).toBeEnabled();
    await organize.click();
    strength += 10;
    await expect(union).toContainText(`Organizing strength ${strength.toFixed(1)} / 100`);
    await expect(page.getByRole('status').filter({ hasText: 'Organizing drive recorded.' })).toBeVisible({ timeout: 60_000 });
    if (strength >= 100) break;
    // The next iteration re-reads AP after the real session command settles.
  }
  await expect(union.getByRole('button', { name: 'Vote to lead' })).toBeVisible();
  await union.getByRole('button', { name: 'Vote to lead' }).click();
  await expect(union).toContainText('Presidency offered to you');
  await union.getByRole('button', { name: 'Accept presidency' }).click();
  await expect(union).toContainText('President: You');

  const dues = union.getByRole('spinbutton', { name: 'Annual dues per member for United Steelworkers' });
  const treasuryBeforeDues = Number((await union.innerText()).match(/Treasury ([\d,]+)/)?.[1].replaceAll(',', '') ?? 0);
  // Respect the rendered max attribute. The engine independently caps the
  // action too, while the public form prevents an invalid numeric value.
  await dues.fill('200');
  await union.getByRole('button', { name: 'Set annual dues', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Annual dues updated.' })).toBeVisible({ timeout: 60_000 });
  await expect(dues).toHaveValue('200');
  await advanceAndWait();
  await expect(union).toContainText('Treasury');
  const treasuryAfterDues = Number((await union.innerText()).match(/Treasury ([\d,]+)/)?.[1].replaceAll(',', '') ?? 0);
  expect(treasuryAfterDues).toBeGreaterThan(treasuryBeforeDues);
  const sectorDrive = union.getByRole('button', { name: /Organize sector US-manufacturing/ });
  let density = Number((await sectorDrive.innerText()).match(/· ([\d.]+)% ·/)?.[1] ?? 25);
  for (let drive = 0; drive < 7; drive++) {
    let refreshed = 0;
    while (await sectorDrive.isDisabled()) {
      await advanceAndWait();
      refreshed++;
      expect(refreshed, 'sector organizing should unlock after the next action-point refresh').toBeLessThanOrEqual(3);
    }
    const approval = Number((await union.innerText()).match(/Union approval: ([\d.]+)%/)?.[1] ?? 55);
    await sectorDrive.click();
    density = Math.min(100, density + 5 * approval / 100);
    await expect(union).toContainText(`${density.toFixed(1)}%`);
  }
  await expect(union).toContainText(`${density.toFixed(1)}%`);
  await union.getByRole('button', { name: 'Call US-manufacturing to bargain' }).click();
  await expect(union).toContainText('Bargaining: negotiating');

  // The employer is an engine-owned turn participant. Advancing two turns
  // allows the configured source response delay to elapse.
  for (let turn = 0; turn < 2; turn++) {
    await advanceAndWait();
  }
  await expect(union).toContainText('latest offer by employer', { timeout: 60_000 });
  const employerWage = Number((await union.innerText()).match(/latest offer by employer at (\d+)% wage/)?.[1]);
  expect(employerWage).toBeGreaterThan(0);
  await union.getByRole('button', { name: 'Accept employer offer' }).click();
  await expect(union).toContainText('Ratification ballot open');
  await union.getByRole('button', { name: 'Vote to ratify offer' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Ratification vote recorded.' })).toBeVisible({ timeout: 60_000 });
  await expect(union).toContainText(`Active agreement with US-manufacturing: wage floor ${employerWage}%`);
  await advanceAndWait();

  await saveGame(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Continue Union Organizer', exact: true }).click();
  await gameReady(page);
  await navigateGame(page, 'Stock market');
  const resumedUnion = page.getByTestId('union-US-manufacturing');
  await expect(resumedUnion).toContainText(/Organizing strength 1\d{2}\.\d \/ 100/);
  await expect(resumedUnion).toContainText('President: You');
  await expect(resumedUnion).toContainText(`Active agreement with US-manufacturing: wage floor ${employerWage}%`);
  await expect(page.getByRole('contentinfo')).toContainText(/Turn \d+ ·/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
