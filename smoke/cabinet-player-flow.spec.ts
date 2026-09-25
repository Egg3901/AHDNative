/**
 * #262 integrated cabinet route at phone widths. The fixture is earned through
 * the public nomination and turn commands; no cabinet row or order is inserted
 * into a save. It enters the app through the same validated worker load path
 * as a resumed local game. Screenshots are inspection artifacts, not device
 * evidence or AHDGame visual parity by themselves.
 */
import { test, expect } from '@playwright/test';
import { GameSession } from '../src/game/session';
import { gameReady, loadFixture, navigateGame, saveGame } from './game-navigation';

function seatedFixture(): Buffer {
  const session = new GameSession();
  session.create({
    era: '1953', countryId: 'US', seed: 'native-cabinet-player-flow-262',
    playerName: 'Alex', mode: 'hos',
  });
  const nomination = session.act('sponsorCabinetNomination', {
    countryId: 'US', positionId: 'secretary_of_treasury', nomineeId: 'player',
  });
  if (!nomination.ok) throw new Error(`Cabinet nomination failed: ${nomination.error}`);
  for (let turn = 0; turn < 25; turn++) {
    if (session.cabinetOffice().positions.find((entry) => entry.id === 'secretary_of_treasury')?.isPlayerHolder) {
      return Buffer.from(session.serialize('2026-09-25T00:00:00.000Z'));
    }
    session.advance();
  }
  throw new Error('Public nomination never seated the player by turn 24');
}

const fixture = seatedFixture();

for (const width of [320, 390]) {
  test(`${width}px: player opens Cabinet office, issues, saves, and resumes order`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await loadFixture(page, fixture);
    await gameReady(page);
    await navigateGame(page, 'Cabinet office');

    await expect(page.getByRole('heading', { name: 'Cabinet office', exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'Cabinet office' }).selectOption('secretary_of_treasury');
    await page.getByRole('combobox', { name: 'Ministerial order' }).selectOption('emergency_fiscal_stimulus');
    const issue = page.getByRole('button', { name: 'Issue ministerial order' });
    await expect(issue).toBeEnabled();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `artifacts/smoke/cabinet-player-ready-${width}.png`, fullPage: true });

    await issue.click();
    await expect(page.getByText('1 order in force')).toBeVisible();
    // An issue response refreshes the world; keep the selected portfolio and
    // show one result notice rather than silently switching to a vacant seat.
    await expect(page.getByRole('combobox', { name: 'Cabinet office' })).toHaveValue('secretary_of_treasury');
    await expect(page.getByRole('status').filter({ hasText: 'Emergency Fiscal Stimulus' })).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Active orders' })).toBeVisible();
    await expect(issue).toBeDisabled();
    await page.screenshot({ path: `artifacts/smoke/cabinet-player-issued-${width}.png`, fullPage: true });

    // The compact fixed footer may overlap this card in a full-page capture.
    // Scroll it to the top and prove the complete card can clear that footer.
    const activeCard = page.getByRole('heading', { name: 'Active orders' }).locator('..');
    await activeCard.evaluate((element) => element.scrollIntoView({ block: 'start' }));
    const clearance = await activeCard.evaluate((element) => {
      const footer = document.querySelector('footer[role="contentinfo"], footer');
      if (!footer) throw new Error('Persistent game footer is missing');
      return { cardBottom: element.getBoundingClientRect().bottom, footerTop: footer.getBoundingClientRect().top };
    });
    expect(clearance.cardBottom).toBeLessThanOrEqual(clearance.footerTop + 1);
    await page.screenshot({ path: `artifacts/smoke/cabinet-player-active-${width}.png` });

    await saveGame(page);
    await page.reload();
    await page.getByRole('button', { name: 'Continue Alex', exact: true }).click();
    await gameReady(page);
    await navigateGame(page, 'Cabinet office');
    await expect(page.getByText('1 order in force')).toBeVisible();
    await expect(page.getByText('Emergency Fiscal Stimulus').first()).toBeVisible();
  });
}
