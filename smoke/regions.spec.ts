import { expect, test } from '@playwright/test';
import { gameReady, navigateGame, saveGame, openGameMenu, closeGameMenu } from './game-navigation';

for (const country of ['US', 'UK']) {
  test(`${country} region browsing stays offline and does not move the player`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: 'New game', exact: true }).click();
    await page.getByLabel('Your name').fill('Region Player');
    await page.getByLabel('Country', { exact: true }).selectOption(country);
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await gameReady(page);
    await page.context().setOffline(true);
    await navigateGame(page, 'Regions');
    await expect(page.getByRole('article').first()).toBeVisible();
    const home = await page.getByRole('article').first().getAttribute('aria-label');
    const browse = page.getByText('Browse regions', { exact: true });
    expect((await browse.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await browse.click();
    const directory = page.getByRole('group', { name: 'Region directory', exact: true });
    const selected = country === 'US' ? 'California' : 'Scotland';
    await page.getByRole('searchbox', { name: 'Search regions', exact: true }).fill(selected);
    await page.getByRole('button', { name: 'Search directory', exact: true }).click();
    await directory.getByRole('button', { name: `View ${selected} details`, exact: true }).click();
    const detail = page.getByRole('article', { name: selected, exact: true });
    await expect(detail).toBeVisible();
    await expect(page.getByRole('group', { name: 'Region directory', exact: true })).toBeHidden();
    await expect(detail).toContainText(country === 'US' ? 'Senate' : 'House of Commons');
    if (country === 'UK') await expect(detail).not.toContainText('Governor');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/smoke/regions-${country}.png`, fullPage: true });
    await saveGame(page);
    await page.context().setOffline(false);
    await page.reload();
    await page.getByRole('button', { name: 'Continue Region Player', exact: true }).click();
    await gameReady(page);
    await navigateGame(page, 'Regions');
    await expect(page.getByRole('article', { name: home!, exact: true })).toBeVisible();
    await openGameMenu(page);
    await expect(page.getByRole('dialog', { name: 'Game menu' })).toContainText(country === 'US' ? 'United States' : 'United Kingdom');
    await closeGameMenu(page);
    await expect(page.getByRole('contentinfo')).toContainText('Turn 0');
  });
}
