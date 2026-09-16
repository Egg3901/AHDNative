import { test, expect, type Page } from '@playwright/test';
import { gameReady, openGameMenu, closeGameMenu, completeCharacterCreation, navigateGame } from './game-navigation';

/**
 * Glass material visual acceptance (#437).
 * Representative phone rendered checks at 320/390px portrait for the
 * accessible material hierarchy owned by `src/ui/materials.ts` with values
 * in `src/ui/ui.css`: chrome (footer + bottom nav, drawer), elevated
 * (resource details), modal (resource/notification popover), opaque content
 * cards. Covers the supported dark appearance, the Settings reduced
 * transparency pipeline, forced-colors, large text, and reduced motion.
 * Browser evidence only; named physical-device performance stays open.
 */

async function startGame(page: Page, width: number, seed: string) {
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill('Material Review');
  await page.getByLabel('Seed', { exact: false }).fill(seed);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await completeCharacterCreation(page);
  await gameReady(page);
}

function parseAlpha(color: string): number | null {
  const rgba = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (rgba) return rgba[4] === undefined ? 1 : Number(rgba[4]);
  const srgb = color.match(/color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)/);
  if (srgb) return srgb[4] === undefined ? 1 : Number(srgb[4]);
  return null;
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function awaitDrawerSettled(page: Page) {
  // The drawer entrance runs a 0.18s slide-in; screenshots and geometry
  // assertions must see the resting position, not a mid-flight frame.
  const drawer = page.getByRole('dialog', { name: 'Game menu', exact: true });
  await expect.poll(
    async () => drawer.evaluate((el) => el.getBoundingClientRect().x),
    { timeouts: [5_000] },
  ).toBeGreaterThanOrEqual(0);
}

async function checkFullPresentation(page: Page, width: number, tag: string) {
  const footer = page.getByRole('contentinfo');
  await expect(footer).toBeVisible();
  const primary = page.getByRole('navigation', { name: 'Primary', exact: true });
  await expect(primary.getByRole('button')).toHaveCount(4);
  for (const navButton of await primary.getByRole('button').all()) {
    await expect(navButton).toBeVisible();
  }

  // Supported appearance is the default dark theme (AHDGame theme options
  // such as light/pastel are not ported): chrome resolves to a dark
  // translucent tint with blur, not an unstyled or light surface.
  const footerStyle = await footer.evaluate((el) => {
    const css = getComputedStyle(el);
    return { background: css.backgroundColor, filter: css.backdropFilter };
  });
  const footerAlpha = parseAlpha(footerStyle.background);
  expect(footerAlpha, `footer background resolves (${footerStyle.background})`).not.toBeNull();
  expect(footerAlpha!).toBeLessThan(1);
  expect(footerStyle.filter).toContain('blur');

  // Content cards stay opaque and never blurred.
  const card = page.locator('main .ahd-card').first();
  await expect(card).toBeVisible();
  const cardStyle = await card.evaluate((el) => {
    const css = getComputedStyle(el);
    return { background: css.backgroundColor, filter: css.backdropFilter };
  });
  expect(parseAlpha(cardStyle.background)).toBe(1);
  expect(cardStyle.filter).toBe('none');

  // Resource overlay: modal popover wraps the elevated details, with its
  // linked actions and close control reachable.
  await footer.getByRole('button', { name: /Action points/ }).click();
  const details = page.getByRole('dialog', { name: 'Action points details' });
  await expect(details).toBeVisible();
  const popoverStyle = await details.evaluate((el) => {
    const css = getComputedStyle(el);
    return { background: css.backgroundColor, filter: css.backdropFilter };
  });
  const popoverAlpha = parseAlpha(popoverStyle.background);
  expect(popoverAlpha, `popover background resolves (${popoverStyle.background})`).not.toBeNull();
  expect(popoverAlpha!).toBeLessThan(1);
  expect(popoverStyle.filter).toContain('blur');
  await expect(details.getByRole('button', { name: 'Go to Actions' })).toBeVisible();
  await expect(details.getByRole('button', { name: 'Close details' })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: `artifacts/smoke/material-overlay-${tag}.png` });
  await details.getByRole('button', { name: 'Close details' }).click();

  // Drawer chrome: persistent controls visible inside a sub-viewport panel.
  await openGameMenu(page);
  await awaitDrawerSettled(page);
  const drawer = page.getByRole('dialog', { name: 'Game menu', exact: true });
  await expect(drawer.getByRole('button', { name: 'End turn', exact: true })).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Save game', exact: true })).toBeVisible();
  const drawerStyle = await drawer.evaluate((el) => {
    const css = getComputedStyle(el);
    return { background: css.backgroundColor, filter: css.backdropFilter };
  });
  const drawerAlpha = parseAlpha(drawerStyle.background);
  expect(drawerAlpha, `drawer background resolves (${drawerStyle.background})`).not.toBeNull();
  expect(drawerAlpha!).toBeLessThan(1);
  expect(drawerStyle.filter).toContain('blur');
  const drawerBounds = await drawer.boundingBox();
  expect(drawerBounds!.width).toBeLessThan(width);
  await noOverflow(page);
  await page.screenshot({ path: `artifacts/smoke/material-drawer-${tag}.png` });
  await closeGameMenu(page);
  await page.screenshot({ path: `artifacts/smoke/material-game-${tag}.png` });
  await noOverflow(page);
}

async function checkReducedTransparency(page: Page, tag: string) {
  await navigateGame(page, 'Settings');
  await page.getByRole('radio', { name: 'Reduce transparency', exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-reduced-transparency', 'on');
  await navigateGame(page, 'Profile');
  await gameReady(page);

  // Every glass surface resolves to its solid fallback with no blur.
  const footerStyle = await page.locator('.ahd-footer').first().evaluate((el) => {
    const css = getComputedStyle(el);
    return { background: css.backgroundColor, filter: css.backdropFilter };
  });
  expect(parseAlpha(footerStyle.background), `footer solid (${footerStyle.background})`).toBe(1);
  expect(footerStyle.filter).toBe('none');
  const footer = page.getByRole('contentinfo');
  await footer.getByRole('button', { name: /Action points/ }).click();
  const details = page.getByRole('dialog', { name: 'Action points details' });
  await expect(details).toBeVisible();
  // The dialog itself carries the modal popover surface; the elevated
  // details card nests inside it.
  for (const [label, target] of [['popover', details], ['details', details.locator('.ahd-resource-details')]] as const) {
    const style = await target.evaluate((el) => {
      const css = getComputedStyle(el as Element);
      return { background: css.backgroundColor, filter: css.backdropFilter };
    });
    expect(parseAlpha(style.background), `${label} solid (${style.background})`).toBe(1);
    expect(style.filter).toBe('none');
  }
  await expect(details.getByRole('button', { name: 'Close details' })).toBeVisible();
  await noOverflow(page);
  await details.getByRole('button', { name: 'Close details' }).click();
  await openGameMenu(page);
  await awaitDrawerSettled(page);
  const drawer = page.getByRole('dialog', { name: 'Game menu', exact: true });
  const drawerStyle = await drawer.evaluate((el) => {
    const css = getComputedStyle(el);
    return { background: css.backgroundColor, filter: css.backdropFilter };
  });
  expect(parseAlpha(drawerStyle.background), `drawer solid (${drawerStyle.background})`).toBe(1);
  expect(drawerStyle.filter).toBe('none');
  await expect(drawer.getByRole('button', { name: 'End turn', exact: true })).toBeVisible();
  await page.screenshot({ path: `artifacts/smoke/material-solid-${tag}.png` });
  await closeGameMenu(page);
  await noOverflow(page);
}

async function checkLargeTextAndReducedMotion(page: Page, tag: string) {
  await navigateGame(page, 'Settings');
  await page.getByRole('radio', { name: 'Large', exact: true }).check();
  await page.getByRole('radio', { name: 'Reduce motion', exact: true }).check();
  await expect(page.locator('html')).toHaveCSS('font-size', '20px');
  await navigateGame(page, 'Profile');
  await gameReady(page);

  // Large text keeps chrome and overlays reachable with no page overflow.
  await expect(page.getByRole('contentinfo')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary', exact: true }).getByRole('button')).toHaveCount(4);
  await noOverflow(page);
  await openGameMenu(page);
  await awaitDrawerSettled(page);
  const drawer = page.getByRole('dialog', { name: 'Game menu', exact: true });
  await expect(drawer.getByRole('button', { name: 'End turn', exact: true })).toBeVisible();
  const drawerMotion = await drawer.evaluate((el) => {
    const css = getComputedStyle(el);
    return { animation: css.animationName, duration: css.animationDuration };
  });
  expect(drawerMotion.animation === 'none' || drawerMotion.duration === '0s').toBe(true);
  await page.screenshot({ path: `artifacts/smoke/material-large-text-${tag}.png` });
  await closeGameMenu(page);
  const footer = page.getByRole('contentinfo');
  await footer.getByRole('button', { name: /Action points/ }).click();
  const details = page.getByRole('dialog', { name: 'Action points details' });
  await expect(details).toBeVisible();
  await expect(details.getByRole('button', { name: 'Close details' })).toBeVisible();
  await noOverflow(page);
  await details.getByRole('button', { name: 'Close details' }).click();
  await noOverflow(page);
}

async function checkForcedColors(page: Page) {
  await page.emulateMedia({ forcedColors: 'active' });
  // Forced-colors resolves every glass surface to its solid fallback; only
  // the blur removal is asserted because system colors override paint.
  // The drawer renders only while open, so open it before asserting.
  await openGameMenu(page);
  await awaitDrawerSettled(page);
  for (const selector of ['.ahd-footer', '.ahd-drawer']) {
    const filter = await page.locator(selector).first().evaluate(
      (el) => getComputedStyle(el).backdropFilter,
    );
    expect(filter).toBe('none');
  }
  await closeGameMenu(page);
  const footer = page.getByRole('contentinfo');
  await footer.getByRole('button', { name: /Action points/ }).click();
  const details = page.getByRole('dialog', { name: 'Action points details' });
  await expect(details).toBeVisible();
  expect(await details.evaluate((el) => getComputedStyle(el).backdropFilter)).toBe('none');
  await expect(details.getByRole('button', { name: 'Close details' })).toBeVisible();
  await details.getByRole('button', { name: 'Close details' }).click();
  await page.emulateMedia({ forcedColors: 'none' });
}

for (const width of [320, 390]) {
  test(`material visual acceptance at ${width}px portrait`, async ({ page }) => {
    await startGame(page, width, `material-${width}`);
    await checkFullPresentation(page, width, `${width}`);
    await checkLargeTextAndReducedMotion(page, `${width}`);
    await checkReducedTransparency(page, `${width}`);
    await checkForcedColors(page);
    await noOverflow(page);
  });
}
