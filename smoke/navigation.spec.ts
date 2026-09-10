import { test, expect } from '@playwright/test';

test('mobile navigation and resource footer connect real savings actions through relaunch', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill('Navigation Player');
  await page.getByLabel('Seed', { exact: false }).fill('navigation-savings-1953');
  await page.getByLabel('Country', { exact: true }).selectOption('US');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('button', { name: 'End turn', exact: true })).toBeEnabled();

  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Politicians', exact: true }).click();
  await expect(page.getByLabel('Politician', { exact: true })).toBeVisible();
  expect(await page.getByLabel('Politician', { exact: true }).locator('option').count()).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Banking', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Banking', exact: true })).toBeVisible();
  await page.getByRole('spinbutton', { name: 'Amount', exact: true }).fill('1000');
  await page.getByRole('button', { name: /^Deposit:/ }).click();
  await expect(page.getByRole('status')).toContainText('Deposited 1000 to savings');
  await expect(page.getByRole('region', { name: 'Banking', exact: true })).toContainText('$1,000.00');

  await page.reload();
  await page.getByRole('button', { name: 'Continue Navigation Player' }).click();
  const footer = page.getByRole('contentinfo', { name: 'Character stats and turn timer' });
  await expect(footer).toBeVisible();
  await expect(footer).toContainText('Player paced');
  await footer.getByRole('button', { name: /cash/i }).click();
  await page.getByRole('button', { name: /go to portfolio/i }).click();
  await expect(page.getByRole('heading', { name: 'Portfolio', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Portfolio', exact: true })).toContainText('$1,000.00');

  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Banking', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Amount', exact: true }).fill('400');
  await page.getByRole('button', { name: /^Withdraw:/ }).click();
  await expect(page.getByRole('status')).toContainText('Withdrew 400 from savings');
  await expect(page.getByRole('region', { name: 'Banking', exact: true })).toContainText('$600.00');
  await expect(page.getByRole('region', { name: 'Banking', exact: true })).toContainText('$9,400.00');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: /^Withdraw:/ }).scrollIntoViewIfNeeded();
  const controls = await page.getByRole('button', { name: /^Withdraw:/ }).boundingBox();
  const bar = await footer.boundingBox();
  expect(controls).not.toBeNull();
  expect(bar).not.toBeNull();
  expect(controls!.y + controls!.height).toBeLessThanOrEqual(bar!.y);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'artifacts/smoke/mobile-banking.png', fullPage: true });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'Game menu' });
  const menuBox = await menu.boundingBox();
  expect(menuBox).not.toBeNull();
  expect(menuBox!.x).toBeGreaterThanOrEqual(0);
  expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(568);
  await page.screenshot({ path: 'artifacts/smoke/mobile-navigation.png' });
  await page.getByRole('menuitemradio', { name: 'Profile', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Profile', exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
