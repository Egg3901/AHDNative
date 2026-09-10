import { expect, test } from '@playwright/test';
import { gameReady, navigateGame } from './game-navigation';

test('bottom destinations reset reading position and retain their section highlight', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill('UI Player');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await gameReady(page);
  const primary = page.getByRole('navigation', { name: 'Primary', exact: true });
  await primary.getByRole('button', { name: 'Character', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Character', exact: true })).toBeFocused();
  await page.mouse.move(150, 200);
  await page.mouse.wheel(0, 1200);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100);
  await primary.getByRole('button', { name: 'Character', exact: true }).click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await page.mouse.wheel(0, 1200);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100);
  await primary.getByRole('button', { name: 'Parties', exact: true }).click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await expect(page.getByRole('region', { name: 'Parties', exact: true })).toBeFocused();
  await navigateGame(page, 'Profile');
  await expect(primary.getByRole('button', { name: 'Character', exact: true })).toHaveAttribute('aria-current', 'location');
  await navigateGame(page, 'Economy');
  await expect(primary.getByRole('button', { name: 'Menu', exact: true })).toHaveAttribute('aria-current', 'location');
  await expect(primary.getByRole('button', { name: 'Menu', exact: true })).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of [320, 390]) {
  test(`overview shortcuts and full values remain usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    if (width === 320) {
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByRole('radio', { name: 'Large', exact: true }).check();
      await page.getByRole('button', { name: 'Back to home' }).click();
    }
    await page.getByRole('button', { name: 'New game', exact: true }).click();
    await page.getByLabel('Your name').fill('Mobile Player');
    await page.getByLabel('Country', { exact: true }).selectOption('UK');
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await gameReady(page);
    const overview = page.getByRole('region', { name: 'Player overview', exact: true });
    await expect(overview).toContainText('Mobile Player');
    await expect(overview).toContainText('£10,000.00');
    await expect(page.getByRole('region', { name: 'Nation metrics', exact: true })).toContainText('$40,336,000,000');
    const shortcuts = page.getByRole('navigation', { name: 'Continue to', exact: true });
    for (const [label, destination] of [['Take an action', 'Character'], ['View elections', 'Elections'], ['View economy', 'Economy'], ['Browse regions', 'Regions']]) {
      const button = shortcuts.getByRole('button', { name: label, exact: true });
      await button.scrollIntoViewIfNeeded();
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await button.click();
      await expect(page.getByRole('region', { name: destination, exact: true })).toBeFocused();
      await page.getByRole('navigation', { name: 'Primary', exact: true }).getByRole('button', { name: 'Overview', exact: true }).click();
    }
    await expect(overview).toBeVisible();
    const labelBounds = await page.getByRole('navigation', { name: 'Primary', exact: true })
      .locator('button > span').evaluateAll(labels => labels.map(label => ({
        height: label.getBoundingClientRect().height,
        fits: label.scrollWidth <= label.clientWidth + 1,
      })));
    expect(labelBounds.every(label => label.height < 24 && label.fits)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/reviews/mobile-readability/overview-depth-${width}.png`, fullPage: true });
  });
}

test('nation directory opens near the top and closes onto the chosen country', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill('World Browser');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await gameReady(page);
  await navigateGame(page, 'Nations');
  const browse = page.getByText('Browse nations', { exact: true });
  await expect(browse).toBeVisible();
  expect((await browse.boundingBox())!.y).toBeLessThan(350);
  await expect(page.getByRole('searchbox', { name: 'Search nations' })).toBeHidden();
  await browse.click();
  await page.getByRole('searchbox', { name: 'Search nations' }).fill('United Kingdom');
  await page.getByRole('button', { name: 'View United Kingdom details', exact: true }).click();
  await expect(page.getByRole('article', { name: 'United Kingdom', exact: true })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Search nations' })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/reviews/mobile-readability/nation-directory-compact.png', fullPage: true });
});
