/**
 * #51 integrated Profile card evidence at320px and390px.
 *
 * Game954f1c21781e6e767455a15eed40f73993d89a8b renders the exact recorded
 * CEO relationship when ceoVacant is not true. Native preserves that gate
 * through the source public CEO appointment and resignation commands.
 * Profile and company detail share the issuer, brand and actual payout view.
 *
 * The rendering fixture uses public share/vote/accept/resign commands.
 * It isolates conditional rendering; the separate browser flow clicks those
 * controls in the integrated application.
 * The CEO fixture is an unmodified fresh GameSession world at the source HQ;
 * its rendered share purchase, vote, acceptance, compensation, turn, resignation
 * and two normal save resumes establish the supported public CEO lifecycle.
 * These are Chromium results, with physical-device acceptance tracked separately.
 */
import { test, expect, type Page } from '@playwright/test';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { advanceGame, gameReady, loadFixture, navigateGame } from './game-navigation';
import { GameSession } from '../src/game/session';

const OPTIONS = { era: '1953', countryId: 'US', seed: 'native-profile-card-51-smoke', playerName: 'Owner Player', homeRegionId: 'DC' };
const CEO_OPTIONS = { ...OPTIONS, homeRegionId: 'DC', playerName: 'CEO Player' };
const SAVED_AT = '2026-09-18T00:00:00.000Z';

/** Appointed and resigned saves use current public CEO authority. */
function ownerFixtures(): { owner: string; reverted: string; ticker: string } {
  const session = new GameSession();
  session.create(OPTIONS);
  expect(session.act('buyShares', { corpId: 'US-media', shares: 1 }).ok).toBe(true);
  expect(session.act('voteCeo', { corpId: 'US-media', candidateId: 'player' }).ok).toBe(true);
  expect(session.act('acceptCeoAppointment', { corpId: 'US-media' }).ok).toBe(true);
  const listing = session.markets().listings.find((entry) => entry.id === 'US-media');
  if (!listing) throw new Error('US-media listing missing from the markets projection');
  expect(session.profile().corporations).toHaveLength(1);
  const owner = session.serialize(SAVED_AT);
  expect(session.act('resignCeo', { corpId: 'US-media' }).ok).toBe(true);
  expect(session.profile().corporations).toEqual([]);
  return { owner, reverted: session.serialize(SAVED_AT), ticker: listing.ticker };
}

const fixtures = ownerFixtures();

/** New source-authored US corporation world for the integrated CEO flow. */
function ceoWorldFixture(): { save: string; ticker: string } {
  const session = new GameSession();
  session.create(CEO_OPTIONS);
  expect(session.profile().corporations).toEqual([]);
  const listing = session.markets().listings.find((entry) => entry.id === 'US-media');
  if (!listing) throw new Error('US-media listing missing from the markets projection');
  return { save: session.serialize(SAVED_AT), ticker: listing.ticker };
}

const ceo = ceoWorldFixture();

function card(page: Page) {
  return page.locator('section[aria-label="Corporation"]');
}

async function openProfile(page: Page) {
  await navigateGame(page, 'Profile');
  await gameReady(page);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const width of [320, 390]) {
  test(`${width}px: appointed CEO card renders on Profile, links the company detail, and survives resume`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await loadFixture(page, Buffer.from(fixtures.owner));
    await gameReady(page);
    await openProfile(page);

    const section = card(page);
    await expect(section).toBeVisible();
    await expect(section.getByRole('heading', { name: 'Corporation' })).toBeVisible();
    await expect(section).toContainText(fixtures.ticker);
    await expect(section).toContainText('CEO');
    await expect(section).toContainText('Corporate cash');
    await expect(section).toContainText('Your shares');
    if (width === 320) {
      // The player's currency figures must remain readable as whole values.
      // A page-width check alone misses a number split across two lines.
      const moneyLines = await section.evaluate((root) => {
        return ['Corporate cash', 'Revenue', 'Share price'].map((label) => {
          const row = [...root.querySelectorAll('dt')].find((term) => term.textContent === label)?.parentElement;
          const value = row?.querySelector('dd')?.firstChild;
          if (!value) throw new Error(`Missing value for ${label}`);
          const range = document.createRange();
          range.selectNodeContents(value);
          return { label, lines: range.getClientRects().length };
        });
      });
      expect(moneyLines).toEqual([
        { label: 'Corporate cash', lines: 1 },
        { label: 'Revenue', lines: 1 },
        { label: 'Share price', lines: 1 },
      ]);
    }
    // No compensation has been configured and no turn has settled a dividend.
    for (const label of ['CEO salary', 'Dividends']) {
      const row = section.locator('.ahd-profile-row').filter({ has: page.getByText(label, { exact: true }) });
      await expect(row).toContainText('$0.00');
    }
    await expectNoHorizontalOverflow(page);
    await section.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `artifacts/smoke/profile-corporation-card-${width}.png` });
    await section.screenshot({ path: `artifacts/smoke/profile-corporation-card-section-${width}.png` });

    // Working destination: company detail with a return frame to Profile.
    const view = section.getByRole('button', { name: /^View company: / });
    const box = await view.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await view.click();
    await expect(page.getByRole('button', { name: 'Back to market list' })).toBeVisible();
    await expect(page.getByText('Company', { exact: true })).toBeVisible();
    await expect(page.getByText(fixtures.ticker).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: `artifacts/smoke/profile-corporation-detail-${width}.png` });
    await page.getByRole('button', { name: 'Back to profile' }).click();
    await expect(card(page)).toBeVisible();

    // Reload resumes the stored CEO appointment and keeps the conditional card.
    await page.reload();
    await page.getByRole('button', { name: 'Continue Owner Player', exact: true }).click();
    await gameReady(page);
    await openProfile(page);
    await expect(card(page)).toBeVisible();
    await expect(card(page)).toContainText(fixtures.ticker);
  });
}

test('a save after public CEO resignation renders no corporation card', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await loadFixture(page, Buffer.from(fixtures.reverted));
  await gameReady(page);
  await openProfile(page);
  await expect(page.getByRole('heading', { name: 'Career history' })).toBeVisible();
  await expect(card(page)).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/smoke/profile-corporation-card-absent-390.png' });
});

test('a fresh game with no recorded ownership renders no corporation card', async ({ page }) => {
  // Committed fixture: an ordinary elected career player, no sector asset.
  const plain = gunzipSync(readFileSync(new URL('../fixtures/career-elected-1953-US.save.json.gz', import.meta.url)));
  await page.goto('/');
  await loadFixture(page, plain);
  await gameReady(page);
  await openProfile(page);
  await expect(page.getByRole('heading', { name: 'Career history' })).toBeVisible();
  await expect(card(page)).toHaveCount(0);
});

for (const width of [320, 390]) {
  test(`${width}px: public CEO lifecycle shows settled income, links detail and survives reload`, async ({ page }, testInfo) => {
    // This public flow spans worker startup, a simulated turn, and two native
    // save resumes; its measured end-to-end path needs a larger budget than a
    // single navigation while each reload retains its own bounded wait.
    testInfo.setTimeout(300_000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await loadFixture(page, Buffer.from(ceo.save));
    await gameReady(page);
    await navigateGame(page, 'Profile');
    await expect(card(page)).toHaveCount(0);

    // Seat the player through the rendered Markets controls. This executes
    // public share purchase, weighted ballot, appointment, compensation, and
    // end-turn settlement commands against the integrated saved world.
    await navigateGame(page, 'Stock market');
    await page.getByRole('button', { name: /Daily Media/ }).click();
    await page.getByRole('textbox', { name: 'Shares' }).fill('1');
    await page.getByRole('button', { name: /Buy shares:/ }).click();
    await page.getByRole('button', { name: 'Vote yourself as CEO' }).click();
    await page.getByRole('button', { name: 'Accept CEO appointment' }).click();
    await page.getByLabel('CEO salary per turn').fill('1000');
    await page.getByLabel('Dividend rate').fill('25');
    await page.getByRole('button', { name: 'Save compensation' }).click();
    await advanceGame(page);
    await openProfile(page);

    const section = card(page);
    await expect(section).toBeVisible();
    await expect(section).toContainText(ceo.ticker);
    await expect(section).toContainText('CEO');
    await expect(section).toContainText('CEO salary');
    await expect(section).toContainText('Dividends');
    await expect(section).toContainText('Paid last turn');
    await expect(section).toContainText('Received last turn');
    await expect(section.locator('[data-corporation-brand]')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await section.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `artifacts/smoke/profile-ceo-card-${width}.png` });

    await section.getByRole('button', { name: 'View company: Daily Media' }).click();
    await expect(page.getByRole('button', { name: 'Back to market list' })).toBeVisible();
    await expect(page.getByText(ceo.ticker).first()).toBeVisible();
    await page.getByRole('button', { name: 'Back to profile' }).click();
    await expect(card(page)).toBeVisible();

    await page.reload({ timeout: 120_000 });
    await page.getByRole('button', { name: 'Continue CEO Player', exact: true }).click();
    await gameReady(page);
    await openProfile(page);
    await expect(card(page)).toBeVisible();
    await expect(card(page)).toContainText('CEO');

    // Resignation is also a public company-detail action. Its persisted role
    // change removes the conditional card after the normal reload path.
    await navigateGame(page, 'Stock market');
    await page.getByRole('button', { name: /Daily Media/ }).click();
    await page.getByRole('button', { name: 'Resign as CEO' }).click();
    await expect(page.getByText(/You resigned as CEO of .*; the position is vacant/)).toBeVisible();
    await gameReady(page);
    await navigateGame(page, 'Profile');
    await expect(card(page)).toHaveCount(0);

    // Keep the second reload in the end-to-end regression: resignation must
    // remain absent after a fresh public resume, not only in the live session.
    await page.reload({ timeout: 120_000 });
    const continueButton = page.getByRole('button', { name: 'Continue CEO Player', exact: true });
    await expect(continueButton).toBeVisible({ timeout: 120_000 });
    await continueButton.click();
    await gameReady(page);
    await openProfile(page);
    await expect(card(page)).toHaveCount(0);
    expect(errors).toEqual([]);
    await expectNoHorizontalOverflow(page);
  });
}
