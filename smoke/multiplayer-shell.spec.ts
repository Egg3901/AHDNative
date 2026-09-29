import { expect, test } from '@playwright/test';

// Presentation evidence with a deterministic native bridge fixture, not a
// signed-in server/device acceptance test. Mutations and remote traffic refuse.
const reads: Record<string, unknown> = {
  'auth-session': { active: true, sub: '507f1f77bcf86cd799439011', username: 'Ada' },
  'character-me': { character: { _id: 'c1', name: 'Ada', party: 'Labor', homeState: 'CA', cashOnHand: 1000, actions: 3, countryId: 'US' }, corporation: null },
  'turn-status': { currentTurn: 12, currentYear: 1862, isActive: true, isProcessing: false, nextScheduledTurn: null },
  'client-nav': { user: { id: '507f1f77bcf86cd799439011', username: 'Ada', isAdmin: false }, hasCharacter: true, characterCountryId: 'US', characterName: 'Ada', unreadMailCount: 0 },
  notifications: { notifications: [], unreadCount: 0, total: 0, hasMore: false },
  'mail-inbox': { mails: [], unreadCount: 0, total: 0, hasMore: false },
  'mail-sent': { mails: [], total: 0, hasMore: false },
  'players-online': { online: 12 },
};

for (const width of [320, 390]) {
  test(`MP keeps native destinations, drafts and readable Profile at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.addInitScript(fixture => {
      Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
        invoke: async (command: string, args: { opId?: string }) => {
          if (command === 'mp_session_fetch' && args.opId && args.opId in fixture) return JSON.stringify(fixture[args.opId]);
          if (command === 'list_saves') return [];
          throw new Error(`Unsupported presentation fixture command: ${command}`);
        },
      } });
    }, reads);
    await page.goto('/?view=mp');
    const primary = page.getByRole('navigation', { name: 'Primary' });
    const profile = page.getByRole('article', { name: 'Player', exact: true });
    await expect(profile.getByRole('heading', { name: 'Ada' })).toBeVisible();
    const checkTitle = async () => {
      const title = await profile.getByRole('heading', { name: 'Ada' }).boundingBox();
      const identity = await profile.locator('.ahd-profile-hero-id').boundingBox();
      expect(title).not.toBeNull();
      expect(identity).not.toBeNull();
      expect(title!.y + title!.height).toBeLessThanOrEqual(identity!.y);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    };
    await checkTitle();
    const choose = async (name: string) => {
      await primary.getByRole('button', { name: 'Menu', exact: true }).click();
      await page.getByRole('dialog', { name: 'Game menu' }).getByRole('button', { name, exact: true }).click();
    };
    await primary.getByRole('button', { name: 'Actions', exact: true }).click();
    await expect(profile).toBeHidden();
    await page.getByRole('tab', { name: /^Fundraising/ }).click();
    await expect(page.getByRole('button', { name: /^Fundraise:/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Quick Poll:/ })).toHaveCount(0);
    await choose('Mail');
    await page.getByPlaceholder('Subject').fill('Draft survives navigation');
    await choose('Settings');
    await page.getByRole('radio', { name: 'Large', exact: true }).click();
    await primary.getByRole('button', { name: 'Profile', exact: true }).click();
    await checkTitle();
    await choose('Mail');
    await expect(page.getByPlaceholder('Subject')).toHaveValue('Draft survives navigation');
    await expect(page.getByRole('button', { name: 'Cash on hand: 1,000' })).toBeVisible();
    await expect(primary).toBeVisible();
  });
}
