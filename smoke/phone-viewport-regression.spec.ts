import { test, expect, type Page } from '@playwright/test';
import { gameReady, navigateGame, openGameMenu, closeGameMenu, completeCharacterCreation } from './game-navigation';

/**
 * Phone viewport regression slice (#436 safe areas, #437 materials).
 *
 * Covers what the existing phone specs leave open:
 * - safe-area-composition.spec.ts holds the portrait/landscape shell contract
 *   but only on the landing destination; this slice traverses Profile,
 *   Actions, Parties, and Economy (the #436 repro destinations) in portrait
 *   390px and landscape 844x390.
 * - material-visual-acceptance.spec.ts holds the glass hierarchy in portrait
 *   only; this slice asserts the chrome/elevated/modal levels in landscape
 *   and the reduced-transparency fallback there.
 * - Neither spec exercises a keyboard-sensitive control or pins
 *   home-indicator clearance geometrically (footer bottom edge inside the
 *   viewport); this slice does both, plus large text with reduced motion in
 *   landscape.
 *
 * Browser-geometry contracts only: deterministic DOM/CSS/screenshot checks
 * that catch regressions. Simulator/browser evidence, never a
 * physical-device pass.
 */

async function startGame(page: Page, width: number, height: number, seed: string) {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill('Viewport Regression');
  await page.getByLabel('Seed', { exact: false }).fill(seed);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await completeCharacterCreation(page);
  await gameReady(page);
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

/** Persistent chrome is mounted, fully on screen, and every primary action is visible. */
async function checkChrome(page: Page) {
  const footer = page.getByRole('contentinfo');
  await expect(footer).toBeVisible();
  const primary = page.getByRole('navigation', { name: 'Primary', exact: true });
  await expect(primary.getByRole('button')).toHaveCount(4);
  for (const navButton of await primary.getByRole('button').all()) {
    await expect(navButton).toBeVisible();
  }
}

/**
 * Home-indicator clearance: the fixed footer bottom edge sits inside the
 * viewport (pinned above the indicator by safe-area padding, not scrolled
 * off screen or pushed past the edge).
 */
async function checkHomeIndicatorClearance(page: Page, height: number) {
  const box = await page.getByRole('contentinfo').boundingBox();
  expect(box, 'footer has geometry').not.toBeNull();
  const bottom = box!.y + box!.height;
  expect(bottom).toBeLessThanOrEqual(height + 1);
  expect(bottom).toBeGreaterThan(height - 120);
}

async function checkDestination(page: Page, name: string, height: number) {
  await navigateGame(page, name);
  await checkChrome(page);
  await checkHomeIndicatorClearance(page, height);
  await noOverflow(page);
}

async function checkResourceOverlay(page: Page, tag: string) {
  const footer = page.getByRole('contentinfo');
  await footer.getByRole('button', { name: /Action points/ }).click();
  const details = page.getByRole('dialog', { name: 'Action points details' });
  await expect(details).toBeVisible();
  await expect(details.getByRole('button', { name: 'Close details' })).toBeVisible();
  await expect(details.getByRole('button', { name: 'Go to Actions' })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: `artifacts/smoke/phone-viewport-overlay-${tag}.png` });
  await details.getByRole('button', { name: 'Close details' }).click();
}

async function checkDrawer(page: Page, width: number, tag: string) {
  await openGameMenu(page);
  const drawer = page.getByRole('dialog', { name: 'Game menu', exact: true });
  await expect(drawer.getByRole('button', { name: 'End turn', exact: true })).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Save game', exact: true })).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Exit game', exact: true })).toBeVisible();
  const drawerBounds = await drawer.boundingBox();
  expect(drawerBounds!.width).toBeLessThan(width);
  await noOverflow(page);
  await page.screenshot({ path: `artifacts/smoke/phone-viewport-drawer-${tag}.png` });
  await closeGameMenu(page);
}

test('phone portrait 390px: destination traversal, overlays, home-indicator clearance', async ({ page }) => {
  await startGame(page, 390, 844, 'phone-viewport-portrait');
  for (const destination of ['Profile', 'Actions', 'Parties', 'Economy']) {
    await checkDestination(page, destination, 844);
  }
  await checkResourceOverlay(page, 'portrait-390');
  await checkDrawer(page, 390, 'portrait-390');
  await checkChrome(page);
  await checkHomeIndicatorClearance(page, 844);
  await noOverflow(page);
  await page.screenshot({ path: 'artifacts/smoke/phone-viewport-portrait-390.png' });
});

test('phone landscape 844x390: material hierarchy, overlays, reduced transparency', async ({ page }) => {
  await startGame(page, 844, 390, 'phone-viewport-landscape');
  for (const destination of ['Profile', 'Actions', 'Parties', 'Economy']) {
    await checkDestination(page, destination, 390);
  }

  // Chrome resolves to a translucent blurred surface in landscape too.
  const footerStyle = await page.getByRole('contentinfo').evaluate((el) => {
    const css = getComputedStyle(el);
    return { background: css.backgroundColor, filter: css.backdropFilter };
  });
  expect(footerStyle.filter).toContain('blur');

  // Content cards stay opaque and unblurred at phone landscape width.
  const cardStyle = await page.locator('main .ahd-card').first().evaluate((el) => {
    const css = getComputedStyle(el);
    return { background: css.backgroundColor, filter: css.backdropFilter };
  });
  expect(cardStyle.filter).toBe('none');

  await checkResourceOverlay(page, 'landscape');
  await checkDrawer(page, 844, 'landscape');

  // Reduced transparency falls back to solid, blur-free chrome in landscape.
  await navigateGame(page, 'Settings');
  await page.getByRole('radio', { name: 'Reduce transparency', exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-reduced-transparency', 'on');
  await navigateGame(page, 'Profile');
  await gameReady(page);
  const solidStyle = await page.locator('.ahd-footer').first().evaluate((el) => {
    const css = getComputedStyle(el);
    return { background: css.backgroundColor, filter: css.backdropFilter };
  });
  expect(solidStyle.filter).toBe('none');
  await checkChrome(page);
  await checkHomeIndicatorClearance(page, 390);
  await noOverflow(page);
  await page.screenshot({ path: 'artifacts/smoke/phone-viewport-landscape-solid.png' });
});

test('phone portrait 390px: keyboard focus, large text, reduced motion', async ({ page }) => {
  await startGame(page, 390, 844, 'phone-viewport-keyboard');

  // Keyboard-sensitive control: focusing the search field keeps it on
  // screen at 16px (the iOS no-zoom floor) with chrome intact and no
  // page overflow, so the keyboard resizes rather than covers the UI.
  await navigateGame(page, 'Search');
  const search = page.getByLabel('Search your world');
  await expect(search).toBeVisible();
  await search.focus();
  await expect(search).toBeFocused();
  expect(await search.evaluate((el) => getComputedStyle(el).fontSize)).toBe('16px');
  const searchBox = await search.boundingBox();
  expect(searchBox, 'search field has geometry').not.toBeNull();
  expect(searchBox!.y).toBeGreaterThanOrEqual(0);
  expect(searchBox!.y + searchBox!.height).toBeLessThanOrEqual(844);
  await checkChrome(page);
  await noOverflow(page);
  await page.screenshot({ path: 'artifacts/smoke/phone-viewport-keyboard-390.png' });

  // Large text plus reduced motion: chrome, overlay, and drawer stay
  // reachable with no page overflow and no entrance animation.
  await navigateGame(page, 'Settings');
  await page.getByRole('radio', { name: 'Large', exact: true }).check();
  await page.getByRole('radio', { name: 'Reduce motion', exact: true }).check();
  await expect(page.locator('html')).toHaveCSS('font-size', '20px');
  await navigateGame(page, 'Profile');
  await gameReady(page);
  await checkChrome(page);
  await checkHomeIndicatorClearance(page, 844);
  await noOverflow(page);
  await openGameMenu(page);
  const drawer = page.getByRole('dialog', { name: 'Game menu', exact: true });
  const drawerMotion = await drawer.evaluate((el) => {
    const css = getComputedStyle(el);
    return { animation: css.animationName, duration: css.animationDuration };
  });
  expect(drawerMotion.animation === 'none' || drawerMotion.duration === '0s').toBe(true);
  await expect(drawer.getByRole('button', { name: 'End turn', exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/smoke/phone-viewport-large-text-390.png' });
  await closeGameMenu(page);
  await checkResourceOverlay(page, 'large-text-390');
  await noOverflow(page);
});
