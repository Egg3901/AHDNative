import { expect, test } from '@playwright/test';
import { completeCharacterCreation, gameReady, navigateGame } from './game-navigation';

for (const viewport of [
  { name: '320', width: 320, height: 700 },
  { name: '390', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
]) {
  test(`reference route heroes render offline at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const externalImages: string[] = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'image' && !request.url().startsWith('http://127.0.0.1:1427/')) externalImages.push(request.url());
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'New game', exact: true }).click();
    await page.getByLabel('Your name').fill(`Hero ${viewport.name}`);
    await page.getByLabel('Head of State').check();
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    const creationHero = page.locator('.ahd-route-hero-image');
    await expect(creationHero).toHaveAttribute('src', '/static/heroes/politicians.webp');
    await expect(creationHero).toBeVisible();
    await expect.poll(() => creationHero.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await page.screenshot({ path: `artifacts/smoke/hero-creation-${viewport.name}.png`, fullPage: true });

    await completeCharacterCreation(page, { party: 'REP' });
    await gameReady(page);
    await navigateGame(page, 'Actions');
    await expect(page.locator('.ahd-route-hero-image')).toHaveAttribute('src', '/static/heroes/white-house.webp');
    await page.screenshot({ path: `artifacts/smoke/hero-hos-${viewport.name}.png`, fullPage: true });
    await navigateGame(page, 'Parties');
    await expect(page.locator('.ahd-route-hero-image')).toHaveAttribute('src', '/static/heroes/parties.webp');
    await page.screenshot({ path: `artifacts/smoke/hero-parties-${viewport.name}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(externalImages).toEqual([]);
  });
}

test('career Actions uses the reference action artwork', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill('Action Hero');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await completeCharacterCreation(page);
  await gameReady(page);
  await navigateGame(page, 'Actions');
  const hero = page.locator('.ahd-route-hero-image');
  await expect(hero).toHaveAttribute('src', '/static/heroes/actions.webp');
  await expect.poll(() => hero.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await page.screenshot({ path: 'artifacts/smoke/hero-actions-390.png', fullPage: true });
});
