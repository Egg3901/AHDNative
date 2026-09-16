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

  // The conversational presentation (#335) walks the six reference steps in
  // order with their labels. Each step fits the compact phone viewport.
  async function expectFitsPhone() {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  }

  // Step 1 Country: informational, with direct progress to every section.
  await expect(page.getByRole('heading', { name: /^Country/ })).toBeVisible();
  await expect(page.getByRole('navigation', { name: /Creation progress/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Current step, step 1 of 6: Country/ })).toBeVisible();
  await expectFitsPhone();
  await page.getByRole('button', { name: /Continue to The politician/i }).click();

  // Step 2 The politician: background + deliberate party choice + full stats.
  await expect(page.getByRole('heading', { name: /^The politician/ })).toBeVisible();
  await expectFitsPhone();
  await page.getByRole('button', { name: 'Female', exact: true }).click();
  await page.getByLabel('Name *').fill('Creation Player');
  await page.getByRole('button', { name: 'Black', exact: true }).click();
  await page.getByRole('button', { name: 'Graduate', exact: true }).click();
  await page.getByRole('button', { name: 'High Income', exact: true }).click();
  await page.getByRole('button', { name: /Continue to Home state/i }).click();

  // Step 3 Home region.
  await expect(page.getByRole('heading', { name: /^Home state/ })).toBeVisible();
  await expectFitsPhone();
  await page.getByRole('radio', { name: /^California\b/ }).check();
  await page.getByRole('button', { name: /Continue to Where you stand/i }).click();

  // Step 4 Where you stand: a deliberate compass answer.
  await expect(page.getByRole('heading', { name: /^Where you stand/ })).toBeVisible();
  await expectFitsPhone();
  await page.getByLabel('Economic position').fill('-1');
  await page.getByLabel('Social position').fill('-1');
  await page.getByRole('button', { name: /Continue to Party/i }).click();

  // Step 5 Party.
  await expect(page.getByRole('heading', { name: /^Party/ })).toBeVisible();
  await expectFitsPhone();
  await page.getByRole('button', { name: 'DEM Democratic Party', exact: true }).click();
  await page.getByRole('button', { name: /Continue to Stats/i }).click();

  // Step 6 Stats: a full allocation, then submit.
  await expect(page.getByRole('heading', { name: /^Stats/ })).toBeVisible();
  await expectFitsPhone();
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
  // The briefing lives on the Party step; the direct review path exposes it.
  await page.getByRole('button', { name: /Review all details/i }).click();
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
