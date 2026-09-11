import { test, expect } from '@playwright/test';

for (const size of [
  { width: 320, height: 568, name: '320' },
  { width: 390, height: 844, name: '390' },
  { width: 1280, height: 800, name: 'desktop' },
]) {
  test(`globe landing fits ${size.name} and preserves entry controls`, async ({ page }) => {
    await page.setViewportSize(size);
    const errors: string[] = [];
    const externalRequests: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.origin !== 'http://127.0.0.1:1427') externalRequests.push(request.url());
    });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'New game', exact: true })).toBeEnabled();
    await expect(page.getByRole('img', { name: 'World map' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'A House Divided' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    const logo = page.locator('.ahd-landing-logo');
    await expect(logo).toBeVisible();
    expect(await logo.evaluate(image => {
      const node = image as HTMLImageElement;
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        loaded: node.complete && node.naturalWidth === 500 && node.naturalHeight === 500,
        square: Math.abs(box.width - box.height) < 0.5,
        contained: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight,
        objectFit: style.objectFit,
        opacity: style.opacity,
      };
    })).toEqual({ loaded: true, square: true, contained: true, objectFit: 'contain', opacity: '1' });
    // The adjacent heading already exposes the product name. The mark must not
    // duplicate it as a noisy image announcement.
    await expect(logo).toHaveAttribute('alt', '');
    // The main action must be in the initial viewport, including a short phone.
    const action = await page.getByRole('button', { name: 'New game', exact: true }).boundingBox();
    expect(action && action.y + action.height <= size.height).toBeTruthy();
    await page.screenshot({ path: `artifacts/smoke/landing-${size.name}.png`, fullPage: true });
    await page.getByRole('button', { name: 'New game', exact: true }).click();
    await expect(page.getByLabel('Your name')).toBeVisible();
    await expect(page.locator('.ahd-landing-globe canvas')).toHaveCount(0);
    expect(errors).toEqual([]);
    expect(externalRequests).toEqual([]);
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
