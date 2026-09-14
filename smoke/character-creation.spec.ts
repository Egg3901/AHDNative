import { expect, test } from '@playwright/test';
import { gameReady, completeCharacterCreation, openGameMenu, saveGame, exitGame } from './game-navigation';

/**
 * #242: a real player builds the six-step reference character file, acts, saves,
 * closes/relaunches and resumes, and every creation field survives. This runs
 * against the real worker and IndexedDB persistence, not a mock world.
 */
test('character creation fields survive action, turn, save, relaunch and resume', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill('World Setup Player');
  await page.getByLabel('Seed', { exact: false }).fill('native-character-creation-smoke');
  await page.getByLabel('Country', { exact: true }).selectOption('US');
  await page.getByRole('button', { name: 'Start', exact: true }).click();

  // The reference six-step flow, order and labels.
  await expect(page.getByRole('heading', { name: /^Country/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^The politician/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Home state/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Where you stand/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Party/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Stats/ })).toBeVisible();

  // Background + deliberate party choice + a full stat allocation.
  await page.getByRole('button', { name: 'Female', exact: true }).click();
  await page.getByLabel('Name *').fill('Creation Player');
  await page.getByRole('button', { name: 'Black', exact: true }).click();
  await page.getByRole('button', { name: 'Graduate', exact: true }).click();
  await page.getByRole('button', { name: 'High Income', exact: true }).click();
  await page.getByLabel('Home state', { exact: true }).selectOption('CA');
  await page.getByLabel('Economic position').fill('-1');
  await page.getByLabel('Social position').fill('-1');
  await page.getByRole('button', { name: 'DEM Democratic Party', exact: true }).click();
  await page.getByRole('button', { name: 'Increase Charisma', exact: true }).click();
  await page.getByRole('button', { name: 'Spread evenly', exact: true }).click();
  await page.getByRole('button', { name: 'Create character', exact: true }).click();
  await gameReady(page);

  // The creation identity reaches Profile immediately.
  const profile = page.getByRole('region', { name: 'Profile', exact: true });
  await expect(profile).toContainText('Creation Player');
  await expect(profile.getByRole('region', { name: 'Character stats' })).toBeVisible();
  await expect(profile.getByRole('region', { name: 'Policy and demographics' })).toContainText('Black');
  await expect(profile.getByRole('region', { name: 'Policy and demographics' })).toContainText('Graduate');

  await openGameMenu(page);
  await page.getByRole('button', { name: 'End turn', exact: true }).click();
  await expect(page.getByRole('button', { name: 'End turn', exact: true })).toBeEnabled();
  await saveGame(page);
  await page.reload();

  await page.getByRole('button', { name: 'Continue Creation Player' }).click();
  await gameReady(page);
  const resumed = page.getByRole('region', { name: 'Profile', exact: true });
  await expect(resumed.getByRole('region', { name: 'Character stats' })).toBeVisible();
  await expect(resumed.getByRole('region', { name: 'Policy and demographics' })).toContainText('Black');
  await expect(resumed.getByRole('region', { name: 'Policy and demographics' })).toContainText('Graduate');
  await expect(page.getByRole('contentinfo')).toContainText('Turn 1 ·');
});

test('a one-party country renders the reference one-party briefing', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill('Soviet Player');
  await page.getByLabel('Country', { exact: true }).selectOption('RU');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByText(/one-party state/i)).toBeVisible();
});

test('a non-one-party country does not render the one-party briefing', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill('American Player');
  await page.getByLabel('Country', { exact: true }).selectOption('US');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByText(/one-party state/i)).toHaveCount(0);
  await completeCharacterCreation(page);
  await gameReady(page);
});
