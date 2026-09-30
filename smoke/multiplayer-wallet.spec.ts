import { expect, test, type Page } from '@playwright/test';

// External native transport fixture only. No live account or bank is touched.
async function walletFixture(page: Page) {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => {
    let cash = 300;
    let saved = 40;
    let opened = false;
    const reads: Record<string, unknown> = {
      'auth-session': { active: true, sub: '507f1f77bcf86cd799439011', username: 'Ada' },
      'turn-status': { currentTurn: 12, currentYear: 1953, isActive: true, isProcessing: false },
      'client-nav': { user: { id: '507f1f77bcf86cd799439011', username: 'Ada' }, hasCharacter: true, characterName: 'Ada', characterCountryId: 'UK' },
      notifications: { notifications: [], unreadCount: 0, total: 0, hasMore: false },
      'mail-inbox': { mails: [], unreadCount: 0, total: 0, hasMore: false },
      'mail-sent': { mails: [], total: 0, hasMore: false },
      'players-online': { online: 12 },
    };
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      invoke: async (command: string, args: { opId?: string; payload?: Record<string, unknown> }) => {
        if (command === 'list_saves') return [];
        if (command === 'mp_session_fetch') {
          if (args.opId === 'character-me') return JSON.stringify({ character: {
            _id: 'c1', name: 'Ada', party: 'Labor', countryId: 'UK', homeState: 'ENG', actions: 3,
            cashOnHand: cash, homeCurrency: 'GBP', currencyBalances: { campaign: 1250,
              personal: { GBP: cash, USD: 21285000774 }, savings: { GBP: saved, JPY: 900 } },
          } });
          if (args.opId === 'savings-accounts') return JSON.stringify({ apyByCurrency: { GBP: 0.025, USD: 0.03 },
            savingsAccountsOpened: { GBP: opened, USD: true }, savingsBalances: { GBP: saved, JPY: 900 },
            interestEarned: { GBP: 2 }, pendingInterest: { GBP: 0.5 }, turnsUntilCredit: 3 });
          if (args.opId && args.opId in reads) return JSON.stringify(reads[args.opId]);
        }
        if (command === 'mp_session_mutate') {
          const currency = args.payload?.currency;
          const amount = args.payload?.amount;
          if (currency !== 'GBP') throw new Error('remote-error:400:0:Choose the home currency for this fixture');
          if (args.opId === 'savings-open') opened = true;
          else if (typeof amount === 'number' && amount > 0) {
            if (args.opId === 'savings-deposit' && amount <= cash) { cash -= amount; saved += amount; }
            else if (args.opId === 'savings-withdraw' && amount <= saved) { cash += amount; saved -= amount; }
            else throw new Error('remote-error:400:0:Insufficient balance');
          } else throw new Error('Unsupported savings mutation');
          return JSON.stringify({ success: true, currency, ...(args.opId === 'savings-open' ? {} : { amount }) });
        }
        throw new Error(`Unsupported wallet fixture command: ${command}`);
      },
    } });
  });
}

async function choose(page: Page, name: string) {
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('dialog', { name: 'Game menu' }).getByRole('button', { name, exact: true }).click();
}

for (const width of [320, 390, 1280]) {
  test(`MP wallet opens and transfers authoritative savings at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await walletFixture(page);
    await page.goto('/?view=mp');
    await expect(page.getByRole('heading', { name: 'Ada', exact: true })).toBeVisible();
    await choose(page, 'Settings');
    await page.getByRole('radio', { name: 'Large', exact: true }).click();
    await choose(page, 'Wallet');
    const wallet = page.getByRole('region', { name: 'Wallet', exact: true });
    const balances = wallet.getByRole('table', { name: 'Currency balances' });
    await expect(balances.getByRole('row', { name: 'GBP 300 40' })).toBeVisible();
    await expect(balances.getByRole('row', { name: 'USD 21,285,000,774 0' })).toBeVisible();
    await expect(balances.getByRole('row', { name: 'JPY 0 900' })).toBeVisible();
    await wallet.getByRole('button', { name: 'Savings accounts', exact: true }).click();
    await expect(wallet.getByText('2.5% APY')).toBeVisible();
    await wallet.getByRole('button', { name: 'Open savings account' }).click();
    await expect(page.getByText('Savings account opened (GBP).')).toBeVisible();
    const input = wallet.getByRole('spinbutton', { name: 'Savings amount' });
    await input.fill('25');
    await wallet.getByRole('button', { name: 'Deposit', exact: true }).click();
    await expect(balances.getByRole('row', { name: 'GBP 275 65' })).toBeVisible();
    await input.fill('10');
    await wallet.getByRole('button', { name: 'Withdraw', exact: true }).click();
    await expect(balances.getByRole('row', { name: 'GBP 285 55' })).toBeVisible();
    await input.fill('999');
    await wallet.getByRole('button', { name: 'Withdraw', exact: true }).click();
    await expect(page.getByText('Insufficient balance', { exact: true })).toBeVisible();
    await expect(balances.getByRole('row', { name: 'GBP 285 55' })).toBeVisible();
    await wallet.getByLabel('Savings currency').selectOption('USD');
    await expect(input).toHaveValue('');
    await expect(wallet.getByText('3% APY', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`wallet-${width}.png`), fullPage: true });
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Profile', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Ada', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cash on hand: 285', exact: true })).toBeVisible();
  });
}
