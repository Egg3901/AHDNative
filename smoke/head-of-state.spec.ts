import { expect, test } from '@playwright/test';
import { advanceGame, completeCharacterCreation, gameReady, navigateGame, saveGame } from './game-navigation';

test('Head of State seats, directs tax policy, advances, saves and resumes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill('Executive Player');
  await page.getByLabel('Head of State').check();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await completeCharacterCreation(page, { party: 'REP' });
  await gameReady(page);

  await navigateGame(page, 'Actions');
  await expect(page.getByRole('note')).toContainText('Permanent Head of State');
  await expect(page.getByRole('article', { name: 'Campaign' })).toHaveCount(0);
  await page.getByRole('tab', { name: /Executive,/ }).click();
  await page.getByLabel('Amount for Set Tax Rate').fill('25');
  await page.getByRole('button', { name: 'Take action: Set Tax Rate', exact: true }).click();
  await gameReady(page);
  await expect(page.getByRole('status')).toContainText('enacts next turn');

  await advanceGame(page);
  await navigateGame(page, 'Policy');
  // HoS tax directives now follow the persisted one-point-per-phase-in path
  // used by enacted tax law. The deterministic 1953 US fixture starts at 35%
  // and is 33% after the first boundary; it converges to the requested 25%
  // over subsequent turns rather than jumping immediately.
  await expect(page.getByText('Income tax').locator('..')).toContainText('33.0%');
  await saveGame(page);
  await page.reload();
  await page.getByRole('button', { name: 'Continue Executive Player', exact: true }).click();
  await gameReady(page);
  await navigateGame(page, 'Actions');
  await expect(page.getByRole('note')).toContainText('Permanent Head of State');
  await expect(page.getByRole('contentinfo')).toContainText('Turn 1');
});
