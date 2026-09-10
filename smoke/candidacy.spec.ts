import { openGameMenu, closeGameMenu, gameReady, navigateGame, advanceGame, saveGame } from './game-navigation';
import { test, expect, type Locator, type Page } from '@playwright/test';

async function idle(page: Page) {
  await gameReady(page);
}

async function openElections(page: Page) {
  await navigateGame(page, 'Elections');
  await expect(page.getByRole('heading', { name: 'Elections', exact: true, level: 2 })).toBeVisible();
}

async function firstEnabledRun(page: Page): Promise<Locator | null> {
  for (let pageIndex = 0; pageIndex < 20; pageIndex++) {
    const runs = page.getByRole('button', { name: 'Run for office', exact: true });
    const count = await runs.count();
    for (let i = 0; i < count; i++) {
      const button = runs.nth(i);
      if (await button.isEnabled()) return button;
    }
    const next = page.getByRole('button', { name: 'Next page', exact: true });
    if (await next.count() === 0 || await next.isDisabled()) return null;
    await next.click();
  }
  return null;
}

async function raceArticle(page: Page, title: string): Promise<Locator> {
  const article = page.getByRole('article', { name: title, exact: true });
  if (await article.count()) return article;
  for (let pageIndex = 0; pageIndex < 20; pageIndex++) {
    const prev = page.getByRole('button', { name: 'Previous page', exact: true });
    if (await prev.count() === 0 || await prev.isDisabled()) break;
    await prev.click();
    if (await article.count()) return article;
  }
  for (let pageIndex = 0; pageIndex < 20; pageIndex++) {
    if (await article.count()) return article;
    const next = page.getByRole('button', { name: 'Next page', exact: true });
    if (await next.count() === 0 || await next.isDisabled()) break;
    await next.click();
  }
  return article;
}

test('a real career files, reloads, and withdraws through Worker UI buttons', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Your name').fill('Career Player');
  await page.getByLabel('Seed', { exact: false }).fill('career-smoke');
  await page.getByLabel('Country', { exact: true }).selectOption('US');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await idle(page);

  await navigateGame(page, 'Parties');
  await page.getByRole('button', { name: 'Join Democratic Party', exact: true }).click();
  await idle(page);
  await openGameMenu(page);
  await expect(page.getByRole('dialog', { name: 'Game menu' })).toContainText('Democratic Party');
  await closeGameMenu(page);

  await openElections(page);
  // 1953 US races spawn in electionTimers on the first advance. Cap at 2.
  let run = await firstEnabledRun(page);
  for (let turn = 0; turn < 2 && !run; turn++) {
    await advanceGame(page);
    await idle(page);
    await openElections(page);
    run = await firstEnabledRun(page);
  }
  expect(run, 'an enabled Run for office after at most 2 turns').not.toBeNull();

  const race = page.getByRole('article').filter({ has: run! }).first();
  const raceTitle = await race.getAttribute('aria-label');
  expect(raceTitle).toBeTruthy();
  await expect(race).toHaveAttribute('aria-label', raceTitle!);
  await run!.click();
  await idle(page);

  const filed = await raceArticle(page, raceTitle!);
  await expect(filed.getByText(/you are a candidate/i).or(filed.getByText('Candidate', { exact: true }))).toBeVisible();
  await expect(filed).toContainText('Career Player');
  await expect(filed.getByRole('button', { name: 'Withdraw candidacy', exact: true })).toBeEnabled();

  await saveGame(page);
  await expect(page.getByRole('status').filter({ hasText: 'Game saved' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Continue Career Player', exact: true }).click();
  await idle(page);
  await openGameMenu(page);
  await expect(page.getByRole('dialog', { name: 'Game menu' })).toContainText('Democratic Party');
  await closeGameMenu(page);

  await openElections(page);
  const reloaded = await raceArticle(page, raceTitle!);
  await expect(reloaded.getByText(/you are a candidate/i).or(reloaded.getByText('Candidate', { exact: true }))).toBeVisible();
  const withdraw = reloaded.getByRole('button', { name: 'Withdraw candidacy', exact: true });
  await expect(withdraw).toBeEnabled();
  await withdraw.click();
  await idle(page);
  const afterWithdraw = await raceArticle(page, raceTitle!);
  await expect(afterWithdraw.getByRole('button', { name: 'Run for office', exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
});
