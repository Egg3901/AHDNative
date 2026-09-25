import { test, expect } from '@playwright/test';

for (const width of [320, 390]) {
  test(`${width}px world setup keeps the full year/week control usable`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await page.getByRole('button', { name: 'New game', exact: true }).click();

    const slider = page.getByRole('slider', { name: 'Starting year and week' });
    await expect(slider).toBeVisible();
    await expect(slider).toHaveAttribute('max', '3974');
    await page.getByRole('radio', { name: '1991' }).click();
    await expect(slider).toHaveAttribute('aria-valuetext', '1991, week 1');
    await slider.scrollIntoViewIfNeeded();
    const bounds = await slider.boundingBox();
    expect(bounds && bounds.width >= 44 && bounds.height >= 20).toBeTruthy();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `artifacts/smoke/era-date-selector-${width}.png`, fullPage: true });
  });
}
