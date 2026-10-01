/** Source-backed political destination at phone widths. The recorded UK
 * cabinet holder isolates regional orders; appointment is a separate flow. */
import { test, expect } from '@playwright/test';
import { GameSession } from '../src/game/session';
import { advanceGame, gameReady, loadFixture, navigateGame, saveGame } from './game-navigation';

let fixture: Buffer;
test.beforeAll(() => {
  const session = new GameSession();
  session.create({ era: '2019', countryId: 'UK', seed: 'cabinet-political-263', playerName: 'Alex' });
  session.allocateStats({ charisma: 1, debate: 1, energy: 1, fundraising: 1, businessAcumen: 4, statecraft: 10, intellect: 10 });
  const save = JSON.parse(session.serialize('2026-10-01T00:00:00.000Z'));
  save.world.cabinetMembers.push({ countryId: 'UK', positionId: 'defence_secretary', characterId: 'player', characterName: 'Alex', partyId: 'UK_CON', appointedBy: null, appointedAtTurn: 0, confirmedAtTurn: 0, ministerialActions: 4, lastMinisterialActionRefillTurn: 0 });
  session.load(JSON.stringify(save));
  const issued = session.issueCabinetOrder({ positionId: 'defence_secretary', orderId: 'veterans_support_programme', targetRegionId: 'LON' });
  if (!issued.result.ok) throw new Error(issued.result.error);
  session.advance();
  fixture = Buffer.from(session.serialize('2026-10-01T00:00:00.000Z'));
});

for (const width of [320, 390]) {
  test(`${width}px: political category and metric retain the regional order through reload`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await loadFixture(page, fixture);
    await gameReady(page);
    await advanceGame(page);
    const openMetric = async () => {
      await navigateGame(page, 'Political metrics');
      await expect(page.getByRole('heading', { name: 'Political metrics', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Economy & Labour', exact: true }).click();
      await page.getByRole('button', { name: 'Trade Union Strength and Worker Protections', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Trade Union Strength and Worker Protections', exact: true })).toBeVisible();
      await expect(page.getByRole('table', { name: 'Regional breakdown' }).getByRole('row', { name: /London.*53\.9/ })).toBeVisible();
      await expect(page.getByText('Ministerial orders', { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    };
    await openMetric();
    await page.screenshot({ path: `artifacts/smoke/political-board-${width}.png`, fullPage: true });
    await saveGame(page);
    await page.reload();
    await page.getByRole('button', { name: 'Continue Alex', exact: true }).click();
    await gameReady(page);
    await openMetric();
    await page.getByRole('button', { name: 'Back to Economy & Labour', exact: true }).click();
    await page.getByRole('button', { name: 'Back to national overview', exact: true }).click();
    await expect(page.getByText('Overall score', { exact: false })).toBeVisible();
  });
}
