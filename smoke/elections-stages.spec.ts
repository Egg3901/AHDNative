import { gameReady, navigateGame, advanceGame, saveGame, openGameMenu, closeGameMenu } from './game-navigation';
import { test, expect, type Locator, type Page } from '@playwright/test';

async function idle(page: Page) {
  await gameReady(page);
}

async function openElections(page: Page) {
  await navigateGame(page, 'Elections');
  await expect(page.getByRole('heading', { name: 'Elections', exact: true, level: 2 })).toBeVisible();
}

/** First race card offering details, paging forward if needed. */
async function firstRace(page: Page): Promise<Locator | null> {
  for (let pageIndex = 0; pageIndex < 5; pageIndex++) {
    const buttons = page.getByRole('button', { name: 'View race details', exact: true });
    if (await buttons.count() > 0) return page.getByRole('article').filter({ has: buttons.first() }).first();
    const next = page.getByRole('button', { name: 'Next page', exact: true });
    if (await next.count() === 0 || await next.isDisabled()) return null;
    await next.click();
  }
  return null;
}

test('race details expose lifecycle stages and survive save and reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill('Stage Player');
  await page.getByLabel('Seed', { exact: false }).fill('race-stage-smoke');
  await page.getByLabel('Country', { exact: true }).selectOption('US');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await idle(page);

  await navigateGame(page, 'Parties');
  await page.getByRole('button', { name: 'Join Democratic Party', exact: true }).click();
  await idle(page);
  await openGameMenu(page);
  await closeGameMenu(page);

  await openElections(page);
  let card = await firstRace(page);
  for (let turn = 0; turn < 2 && !card; turn++) {
    await advanceGame(page);
    await idle(page);
    await openElections(page);
    card = await firstRace(page);
  }
  expect(card, 'a race with a detail link after at most 2 turns').not.toBeNull();
  const raceTitle = await card!.getAttribute('aria-label');
  expect(raceTitle).toBeTruthy();
  await card!.getByRole('button', { name: 'View race details', exact: true }).click();

  const detail = page.getByRole('article', { name: raceTitle!, exact: true });
  await expect(detail.getByText('Race stages')).toBeVisible();
  await expect(detail.getByText('Filing', { exact: true })).toBeVisible();
  await expect(detail.getByText('General', { exact: true })).toBeVisible();

  await saveGame(page);
  await expect(page.getByRole('status').filter({ hasText: 'Game saved' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Continue Stage Player', exact: true }).click();
  await idle(page);

  await openElections(page);
  const reloaded = await firstRace(page);
  expect(reloaded).not.toBeNull();
  await reloaded!.getByRole('button', { name: 'View race details', exact: true }).click();
  await expect(page.getByRole('article', { name: raceTitle!, exact: true }).getByText('Race stages')).toBeVisible();
  expect(errors).toEqual([]);
});
