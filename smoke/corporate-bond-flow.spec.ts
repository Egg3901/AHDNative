import { expect, test } from '@playwright/test';
import { GameSession } from '../src/game/session';
import { gameReady, loadFixture, navigateGame, saveGame } from './game-navigation';

const SAVED_AT = '2026-10-01T00:00:00.000Z';

function sourceWorld(): string {
  const session = new GameSession();
  session.create({ era: '1953', countryId: 'UK', homeRegionId: 'LON', seed: 'native-bond-public-smoke', playerName: 'Bond CEO' });
  return session.serialize(SAVED_AT);
}

const fixture = sourceWorld();

for (const width of [320, 390]) {
  test(`${width}px: a player CEO issues and buys back a corporate bond through the public UI`, async ({ page }, testInfo) => {
    testInfo.setTimeout(240_000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await loadFixture(page, Buffer.from(fixture));
    await gameReady(page);

    await navigateGame(page, 'Stock market');
    await page.getByRole('button', { name: /Daily Media/ }).click();
    await page.getByRole('textbox', { name: 'Shares' }).fill('1');
    await page.getByRole('button', { name: /Buy shares:/ }).click();
    await page.getByRole('button', { name: 'Vote yourself as CEO' }).click();
    await page.getByRole('button', { name: 'Accept CEO appointment' }).click();
    await expect(page.getByRole('button', { name: 'Issue corporate bond', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Issue corporate bond', exact: true }).click();

    await navigateGame(page, 'Bonds');
    await expect(page.getByLabel('Bond issue', { exact: true })).toBeVisible();
    const issueId = await page.getByLabel('Bond issue', { exact: true }).locator('option').filter({ hasText: 'Daily Media' }).getAttribute('value');
    expect(issueId).toMatch(/^cbond-/);
    await expect(page.getByRole('button', { name: 'Buy back corporate bond units' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Buy back corporate bond units' })).toBeEnabled();
    await page.getByLabel('Bond units', { exact: true }).fill('1');
    await page.getByRole('button', { name: 'Buy back corporate bond units' }).click();
    const availableUnits = page.getByText('Available units', { exact: true }).locator('xpath=following-sibling::dd');
    await expect(availableUnits).not.toHaveText('0');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await saveGame(page);
    await page.reload({ timeout: 120_000 });
    await page.getByRole('button', { name: 'Continue Bond CEO', exact: true }).click();
    await gameReady(page);
    await navigateGame(page, 'Bonds');
    await page.getByLabel('Bond issue', { exact: true }).selectOption(issueId!);
    await expect(page.getByText('Available units', { exact: true }).locator('xpath=following-sibling::dd')).not.toHaveText('0');
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
