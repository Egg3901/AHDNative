import { test, expect } from '@playwright/test';

for (const size of [
  { width: 320, height: 568, name: '320' },
  { width: 390, height: 844, name: '390' },
  { width: 1280, height: 800, name: 'desktop' },
]) {
  test(`globe landing fits ${size.name} and preserves entry controls`, async ({ page }) => {
    await page.setViewportSize(size);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'New game', exact: true })).toBeEnabled();
    await expect(page.getByRole('img', { name: 'World map' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // The main action must be in the initial viewport, including a short phone.
    const action = await page.getByRole('button', { name: 'New game', exact: true }).boundingBox();
    expect(action && action.y + action.height <= size.height).toBeTruthy();
    await page.screenshot({ path: `artifacts/smoke/landing-${size.name}.png`, fullPage: true });
    await page.getByRole('button', { name: 'New game', exact: true }).click();
    await expect(page.getByLabel('Your name')).toBeVisible();
    await expect(page.locator('.ahd-landing-globe canvas')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('globe rotates locally and stops when reduced motion is requested', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const canvas = page.locator('.ahd-landing-globe canvas');
  await expect(canvas).toBeVisible();
  const picture = () => canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL());
  const initial = await picture();
  await expect.poll(async () => (await picture()) !== initial).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(100);
  const stopped = await picture();
  await page.waitForTimeout(250);
  expect(await picture() === stopped, 'reduced motion must leave the globe still').toBe(true);
});
