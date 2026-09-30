import { describe, expect, it } from "vitest";
import { MpModeSession } from "./adapter";
import type { MpBridgeHost } from "./bridge";

const USER = "507f1f77bcf86cd799439011";
function savingsHost() {
  let personal = 300;
  let saved = 40;
  let opened = false;
  const host: MpBridgeHost = {
    fetch: async (op) => {
      const reads: Record<string, unknown> = {
        "auth-session": { active: true, sub: USER, username: "Ada" },
        "character-me": { character: { _id: "c1", name: "Ada", homeCurrency: "GBP", currencyBalances: { campaign: 1250, personal: { GBP: personal }, savings: { GBP: saved } } } },
        "client-nav": { user: null, hasCharacter: false },
        "turn-status": { currentTurn: 12, currentYear: 1953 },
        notifications: { notifications: [], unreadCount: 0, total: 0, hasMore: false },
        "savings-accounts": { apyByCurrency: { GBP: 0.025 }, savingsAccountsOpened: { GBP: opened }, savingsBalances: { GBP: saved }, interestEarned: { GBP: 2 }, pendingInterest: { GBP: 0.5 }, savingsInterestEarnedLifetime: 2, turnsUntilCredit: 3 },
      };
      if (!(op in reads)) throw new Error(`Unexpected read: ${op}`);
      return JSON.stringify(reads[op]);
    },
    mutate: async (op, body) => {
      const { currency, amount } = body as { currency: string; amount: number };
      if (currency !== "GBP") throw new Error("remote-error:400:0:Unknown currency");
      if (op === "savings-open") opened = true;
      else if (op === "savings-deposit") { personal -= amount; saved += amount; }
      else if (op === "savings-withdraw") { personal += amount; saved -= amount; }
      else throw new Error(`Unexpected mutation: ${op}`);
      return JSON.stringify({ success: true, currency, ...(op === "savings-open" ? {} : { amount }) });
    },
    beginSignIn: async () => {},
  };
  return host;
}

describe("authoritative savings session", () => {
  it("opens an account, deposits and withdraws, showing only re-read server balances", async () => {
    const session = new MpModeSession(savingsHost());
    await session.enter();
    expect((await session.loadSavings()).savings?.opened.GBP).toBe(false);
    expect((await session.openSavings("GBP")).savings?.opened.GBP).toBe(true);
    const deposited = await session.transferSavings("deposit", "GBP", 25);
    expect(deposited.phase).toBe("ready");
    expect(deposited.character?.wallet?.personal.GBP).toBe(275);
    expect(deposited.savings?.balances.GBP).toBe(65);
    const withdrawn = await session.transferSavings("withdraw", "GBP", 10);
    expect(withdrawn.character?.wallet?.personal.GBP).toBe(285);
    expect(withdrawn.savings?.balances.GBP).toBe(55);
  });

  it("keeps balances and the server refusal when a transfer is rejected", async () => {
    const host = savingsHost();
    host.mutate = async () => { throw new Error("remote-error:400:0:Insufficient savings balance"); };
    const session = new MpModeSession(host);
    await session.enter();
    await session.loadSavings();
    const result = await session.transferSavings("withdraw", "GBP", 500);
    expect(result.error).toBe("Insufficient savings balance");
    expect(result.notice).toBeNull();
    expect(result.savings?.balances.GBP).toBe(40);
    expect(result.character?.wallet?.personal.GBP).toBe(300);
  });

  it("drops the wallet and savings when an authenticated read expires", async () => {
    const host = savingsHost();
    const session = new MpModeSession(host);
    await session.enter();
    await session.loadSavings();
    host.fetch = async () => { throw new Error("remote-error:401:0:Unauthorized"); };
    const result = await session.loadSavings();
    expect(result.phase).toBe("auth-expired");
    expect(result.character).toBeNull();
    expect(result.savings).toBeNull();
  });

  it("reports a refresh failure after an accepted transfer without claiming completion", async () => {
    const host = savingsHost();
    const original = host.mutate;
    host.mutate = async (op, body) => {
      const result = await original(op, body);
      host.fetch = async () => { throw new Error("remote-error:503:0:Temporarily unavailable"); };
      return result;
    };
    const session = new MpModeSession(host);
    await session.enter();
    await session.loadSavings();
    const result = await session.transferSavings("deposit", "GBP", 25);
    expect(result.phase).toBe("server-error");
    expect(result.notice).toBeNull();
    expect(result.character?.wallet?.personal.GBP).toBe(300);
  });

  it("rejects corrupt savings data instead of manufacturing balances", async () => {
    const host = savingsHost();
    const fetch = host.fetch;
    host.fetch = async op => op === "savings-accounts"
      ? JSON.stringify({ apyByCurrency: { GBP: 0.025 }, savingsAccountsOpened: { GBP: true }, savingsBalances: { GBP: "lots" }, interestEarned: {}, pendingInterest: {}, turnsUntilCredit: 3 })
      : fetch(op);
    const session = new MpModeSession(host);
    await session.enter();
    const result = await session.loadSavings();
    expect(result.phase).toBe("server-error");
    expect(result.savings).toBeNull();
    expect(result.character?.wallet?.personal.GBP).toBe(300);
  });

  it("ignores a late mutation result after leaving multiplayer", async () => {
    const host = savingsHost();
    let release: (body: string) => void = () => {};
    host.mutate = async () => new Promise<string>(resolve => { release = resolve; });
    const session = new MpModeSession(host);
    await session.enter();
    const pending = session.openSavings("GBP");
    session.exit();
    release(JSON.stringify({ success: true, currency: "GBP" }));
    const result = await pending;
    expect(result.phase).toBe("idle");
    expect(result.character).toBeNull();
    expect(result.savings).toBeNull();
    expect(result.notice).toBeNull();
  });

  it("refuses malformed inputs before they reach the server", async () => {
    const session = new MpModeSession(savingsHost());
    await session.enter();
    expect((await session.openSavings("GBP?currency=USD")).error).toBe("Choose a supported savings currency.");
    for (const amount of [-1, 0, "25", Number.NaN, Number.POSITIVE_INFINITY]) {
      expect((await session.transferSavings("deposit", "GBP", amount)).error).toBe("Enter a positive savings amount.");
      expect(session.get().character?.wallet?.personal.GBP).toBe(300);
    }
  });

  it("ignores an old request after relinking the same account", async () => {
    const host = savingsHost();
    let release: (body: string) => void = () => {};
    host.mutate = async () => new Promise<string>(resolve => { release = resolve; });
    const session = new MpModeSession(host);
    await session.enter();
    const pending = session.openSavings("GBP");
    session.exit();
    await session.enter();
    release(JSON.stringify({ success: true, currency: "GBP" }));
    const result = await pending;
    expect(result.notice).toBeNull();
    expect(result.savings).toBeNull();
  });

  it("does not restore private balances when multiplayer closes during the confirmation refresh", async () => {
    const host = savingsHost();
    const fetch = host.fetch;
    let hold = false;
    let release: (body: string) => void = () => {};
    let started: () => void = () => {};
    const refreshing = new Promise<void>(resolve => { started = resolve; });
    host.fetch = async op => {
      if (hold && op === "auth-session") {
        started();
        return new Promise<string>(resolve => { release = resolve; });
      }
      return fetch(op);
    };
    const session = new MpModeSession(host);
    await session.enter();
    hold = true;
    const pending = session.openSavings("GBP");
    await refreshing;
    session.exit();
    release(JSON.stringify({ active: true, sub: USER, username: "Ada" }));
    const result = await pending;
    expect(result.phase).toBe("idle");
    expect(result.character).toBeNull();
    expect(result.savings).toBeNull();
    expect(result.notice).toBeNull();
  });
});
