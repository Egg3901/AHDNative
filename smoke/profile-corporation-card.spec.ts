/**
 * #51 rendered player flow for the conditional Profile corporation card.
 *
 * Reference (AHDGame e364c049 src/app/profile/page.tsx +
 * components/CeoCorporationCard.tsx): the card renders only when a
 * corporation records `ceoId === character._id` with `ceoVacant` not true,
 * and links `/corporation/[id]`. Native records no CEO relationship, so the
 * gate is the only truthful ownership the engine persists: a player-owned
 * sector asset (`CorporateSectorAsset.owner === "player"`). The card labels
 * that role "Sector owner", never CEO, and shows no salary or dividends
 * because the engine records neither.
 *
 * The jsdom suites (src/game/profileCorporation.test.ts,
 * src/ui/ProfileCorporationCard.test.tsx, src/ui/CorporationDetailReturn80
 * .test.tsx) cover projection, panel and shell wiring. This spec is the
 * rendered evidence through the integrated app at 320px and 390px: the
 * fixture enters through the same worker/store path as a native resume,
 * the card appears on Profile, "View company" opens the working company
 * detail with Back to Profile, a page reload resumes the saved owner and the
 * card is still there, and a save whose owner reverted renders no card.
 */
import { test, expect, type Page } from '@playwright/test';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { gameReady, loadFixture, navigateGame } from './game-navigation';
import { GameSession } from '../src/game/session';

const OPTIONS = { era: '1953', countryId: 'US', seed: 'native-profile-card-51-smoke', playerName: 'Owner Player' };
const SAVED_AT = '2026-09-18T00:00:00.000Z';

/**
 * Public owner flow: buy a recorded share (sale authority), list the sector,
 * fund the asking price through a save round-trip, then acquire. Returns the
 * serialized owner save plus the same save with the owner reverted.
 */
function ownerFixtures(): { owner: string; reverted: string; ticker: string } {
  const session = new GameSession();
  session.create(OPTIONS);
  expect(session.act('buyShares', { corpId: 'US-media', shares: 1 }).ok).toBe(true);
  const listing = session.markets().listings.find((entry) => entry.id === 'US-media');
  if (!listing) throw new Error('US-media listing missing from the markets projection');
  const listed = session.listSectorForSale(listing.sectorAsset.id);
  expect(listed.ok).toBe(true);
  const raw = JSON.parse(session.serialize(SAVED_AT));
  raw.world.player.cash = listed.ok ? listed.priceAnchor : 0;
  const funded = new GameSession();
  funded.load(JSON.stringify(raw));
  expect(funded.buySectorForSale(listing.sectorAsset.id).ok).toBe(true);
  expect(funded.profile().corporations).toHaveLength(1);
  const owner = funded.serialize(SAVED_AT);

  const revertedRaw = JSON.parse(owner);
  expect(revertedRaw.world.corporateSectors[listing.sectorAsset.id].owner).toBe('player');
  revertedRaw.world.corporateSectors[listing.sectorAsset.id].owner = 'corporation';
  const check = new GameSession();
  check.load(JSON.stringify(revertedRaw));
  expect(check.profile().corporations).toEqual([]);
  return { owner, reverted: JSON.stringify(revertedRaw), ticker: listing.ticker };
}

const fixtures = ownerFixtures();

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
  test(`${width}px: owner card renders on Profile, links the company detail, and survives resume`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await loadFixture(page, Buffer.from(fixtures.owner));
    await gameReady(page);
    await openProfile(page);

    const section = card(page);
    await expect(section).toBeVisible();
    await expect(section.getByRole('heading', { name: 'Corporation' })).toBeVisible();
    await expect(section).toContainText(fixtures.ticker);
    await expect(section).toContainText('Sector owner');
    await expect(section).toContainText('Corporate cash');
    await expect(section).toContainText('Your shares');
    // Salary and dividends stay honest gaps: notes, never fabricated values.
    await expect(section).toContainText('Not recorded by the engine');
    await expect(section).toContainText('no dividend system');
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

    // Persisted role: reload resumes the stored owner save and keeps the card.
    await page.reload();
    await page.getByRole('button', { name: 'Continue Owner Player', exact: true }).click();
    await gameReady(page);
    await openProfile(page);
    await expect(card(page)).toBeVisible();
    await expect(card(page)).toContainText(fixtures.ticker);
  });
}

test('a save whose recorded owner reverted renders no corporation card', async ({ page }) => {
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
