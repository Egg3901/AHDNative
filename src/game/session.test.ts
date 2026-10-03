import { describe, expect, it } from "vitest";
import { rulingPartyIdForCountry } from "@ahdclient/engine";
import { GameSession } from "./session";

const options = { era: "1953", countryId: "US", seed: "native-session-v1", playerName: "Alex" };
const savingsSaveAt = "2026-10-03T06:00:00.000Z";

type SavingsSessionSave = {
  world: {
    savingsAccountsPolicy?: { mode: "off" | "shadow" | "authoritative"; readCurrencies: string[] };
    featureFlags: Record<string, boolean>;
    player: { cash: number; savings: number; savingsHolder: string };
    centralBanks: Record<string, { externalBroadMoney: number }>;
    corporations: Record<string, { bankCharter?: {
      cashReserves: number;
      depositCeiling: number;
      npcDeposits: number;
      totalDeposits: number;
    } }>;
  };
};

function savingsSave(session: GameSession): SavingsSessionSave {
  return JSON.parse(session.serialize(savingsSaveAt)) as SavingsSessionSave;
}

function homeSavingsCashTotal(world: SavingsSessionSave["world"]): number {
  return world.player.cash + world.centralBanks.US!.externalBroadMoney +
    (world.corporations["US-financial"]!.bankCharter?.cashReserves ?? 0);
}

function sessionWithSavingsAuthority(): GameSession {
  const created = new GameSession();
  created.create(options);
  const save = savingsSave(created);
  save.world.savingsAccountsPolicy = { mode: "authoritative", readCurrencies: ["USD"] };
  const funded = new GameSession();
  funded.load(JSON.stringify(save));
  return funded;
}

function sessionWithConstrainedCentralBankPool(): GameSession {
  const funded = sessionWithSavingsAuthority();
  expect(funded.act("depositSavings", { amount: 4_000 }).ok).toBe(true);
  const save = savingsSave(funded);
  save.world.centralBanks.US!.externalBroadMoney = 0;
  const constrained = new GameSession();
  constrained.load(JSON.stringify(save));
  return constrained;
}

describe("singleplayer session", () => {
  it("blocks source-unavailable new-character choices but keeps worldsim spectator creation distinct", () => {
    const player = new GameSession();
    expect(() => player.create({ ...options, era: "1991", countryId: "IE", mode: "career" }))
      .toThrow(/playable country/);
    const spectator = new GameSession();
    spectator.create({ ...options, era: "1991", countryId: "IE", mode: "worldsim" });
    const saved = JSON.parse(spectator.serialize("2026-10-03T06:00:00.000Z"));
    expect(saved.world.player.mode).toBe("worldsim");
    expect(saved.world.player.countryId).toBe("IE");
  });

  it("executes a quoted home-to-foreign-currency trade through the public session", () => {
    const session = new GameSession();
    session.create({ ...options, era: "1979" });
    session.advance(); // Source trade-history queries begin at turn 1.
    const before = JSON.parse(session.serialize("2026-10-03T06:00:00.000Z"));
    const amount = Math.min(100, before.world.player.cash);
    const quote = session.forexQuote("USD", "GBP", amount);
    expect(quote.ok).toBe(true);
    if (!quote.ok) return;
    const result = session.act("exchangeCurrency", {
      fromCurrency: "USD",
      toCurrency: "GBP",
      amount: quote.quote.fromAmount,
    });
    expect(result.ok).toBe(true);
    const after = JSON.parse(session.serialize("2026-10-03T06:00:00.000Z"));
    expect(after.world.player.cash).toBe(before.world.player.cash - quote.quote.fromAmount);
    expect(after.world.player.currencyBalances.personal.GBP).toBe(quote.quote.toAmount);
    expect(after.world.centralBanks.US.forexRevenue - (before.world.centralBanks.US.forexRevenue ?? 0)).toBe(Math.round(quote.quote.spreadFee * 0.25));
    expect(after.world.centralBanks.UK.spreadFeeReserveBalances.USD - (before.world.centralBanks.UK.spreadFeeReserveBalances?.USD ?? 0)).toBe(Math.round(quote.quote.spreadFee * 0.5));
    expect(after.world.forexTradeHistory).toHaveLength(1);
    expect(after.world.forexTradeHistory[0]).toMatchObject({ turn: before.world.meta.turn, source: "manual", amount: quote.quote.fromAmount, spread: quote.quote.spreadFee });
    const resumed = new GameSession();
    resumed.load(session.serialize("2026-10-03T06:00:00.000Z"));
    expect(JSON.parse(resumed.serialize("2026-10-03T06:00:00.000Z")).world.forexTradeHistory).toEqual(after.world.forexTradeHistory);
    session.advance();
    resumed.advance();
    const directNext = JSON.parse(session.serialize("2026-10-03T06:00:00.000Z")).world;
    const loadedNext = JSON.parse(resumed.serialize("2026-10-03T06:00:00.000Z")).world;
    expect(loadedNext).toEqual(directNext);
    expect(loadedNext.meta.turn).toBe(before.world.meta.turn + 1);
    expect(loadedNext.exchangeRates.UK.buyVolume24).toBeCloseTo(quote.quote.anchorAmount);
  });

  it("rejects invalid and unaffordable currency trades without changing any saved state", () => {
    const session = new GameSession();
    session.create(options);
    const before = session.serialize("2026-10-03T06:00:00.000Z");
    expect(session.act("exchangeCurrency", { fromCurrency: "USD", toCurrency: "USD", amount: 100 }).ok).toBe(false);
    expect(session.act("exchangeCurrency", { fromCurrency: "USD", toCurrency: "GBP", amount: Number.MAX_SAFE_INTEGER }).ok).toBe(false);
    expect(session.serialize("2026-10-03T06:00:00.000Z")).toBe(before);
  });

  it("creates a real playable country and exposes the player's starting world", () => {
    const session = new GameSession();
    const view = session.create(options);
    expect(view).toMatchObject({ turn: 0, era: "1953", countryId: "US", player: { name: "Alex" } });
    expect(view.parties.some((party) => party.id === "US_DEM")).toBe(true);
    expect(view.metrics.find((metric) => metric.id === "gdp")?.value).toBeGreaterThan(0);
  });
  it("projects stable structured offline news through save and reload", () => {
    const session = new GameSession();
    session.create(options);
    const saved = JSON.parse(session.serialize("2026-09-10T00:00:00.000Z"));
    saved.world.news.push({ id: "event-1", turn: 1, date: "1953-01-02", headline: "Election called", body: "Voters return to the polls.", category: "Election", countryId: "US", partyId: "US_DEM", electionId: saved.world.elections[0]?.id, eventId: "election-call", eventName: "Election call" });
    const loaded = new GameSession();
    const first = loaded.load(JSON.stringify(saved)).news[0];
    expect(first).toMatchObject({ id: "event-1", category: "Election", country: { id: "US", name: "United States" }, party: { id: "US_DEM" }, event: { id: "election-call", name: "Election call" } });
    const reloaded = new GameSession().load(loaded.serialize("2026-09-10T00:00:00.000Z")).news[0];
    expect(reloaded).toEqual(first);
  });
  it("normalizes news produced by the running session without inventing related links", () => {
    const session = new GameSession();
    session.create(options);
    for (let turn = 0; turn < 24 && session.view().news.length === 0; turn += 1) session.advance();
    const produced = session.view().news[0];
    expect(produced).toBeDefined();
    expect(produced).toMatchObject({ id: expect.any(String), title: expect.any(String), body: expect.any(String), date: expect.any(String), category: expect.any(String) });
    expect(produced?.country ?? null).toBe(null);
    expect(produced?.party ?? null).toBe(null);
    expect(produced?.election ?? null).toBe(null);
  });
  it("continues the same seeded world after actions, a turn and save/reload", () => {
    const session = new GameSession();
    session.create(options);
    const before = session.view().player;
    expect(session.act("convertCash", { amount: 2000 }).ok).toBe(true);
    expect(session.view().player.cash).toBe(before.cash - 2000);
    session.advance();
    expect(session.view().turn).toBe(1);
    const loaded = new GameSession();
    loaded.load(session.serialize("2026-09-10T00:00:00.000Z"));
    loaded.advance();
    session.advance();
    expect(loaded.serialize("2026-09-10T00:00:00.000Z")).toBe(session.serialize("2026-09-10T00:00:00.000Z"));
  });
  it("refuses central-bank savings payouts and holder moves atomically when the household pool is short", () => {
    for (const action of [
      ["withdrawSavings", { amount: 1_000 }],
      ["moveSavings", { holder: "US-financial" }],
    ] as const) {
      const session = sessionWithConstrainedCentralBankPool();
      const before = session.serialize(savingsSaveAt);
      const result = session.act(action[0], action[1]);
      expect(result.ok).toBe(false);
      expect(session.serialize(savingsSaveAt)).toBe(before);
    }
  });
  it("settles savings backing through public actions and continues identically after reload", () => {
    const session = sessionWithSavingsAuthority();
    session.advance(); // source computes the bank's live deposit ceiling during its turn

    const beforeDeposit = savingsSave(session).world;
    expect(session.act("depositSavings", { amount: 4_000 }).ok).toBe(true);
    const afterDeposit = savingsSave(session).world;
    expect(afterDeposit.player.cash).toBe(beforeDeposit.player.cash - 4_000);
    expect(afterDeposit.player.savings).toBe(beforeDeposit.player.savings + 4_000);
    expect(afterDeposit.centralBanks.US!.externalBroadMoney).toBe(beforeDeposit.centralBanks.US!.externalBroadMoney + 4_000);
    expect(homeSavingsCashTotal(afterDeposit)).toBeCloseTo(homeSavingsCashTotal(beforeDeposit), 6);

    const beforeWithdrawal = afterDeposit;
    expect(session.act("withdrawSavings", { amount: 1_000 }).ok).toBe(true);
    const afterWithdrawal = savingsSave(session).world;
    expect(afterWithdrawal.player.cash).toBe(beforeWithdrawal.player.cash + 1_000);
    expect(afterWithdrawal.player.savings).toBe(beforeWithdrawal.player.savings - 1_000);
    expect(afterWithdrawal.centralBanks.US!.externalBroadMoney).toBe(beforeWithdrawal.centralBanks.US!.externalBroadMoney - 1_000);
    expect(homeSavingsCashTotal(afterWithdrawal)).toBeCloseTo(homeSavingsCashTotal(beforeWithdrawal), 6);

    const beforeMoveToBank = afterWithdrawal;
    const bankCashBefore = beforeMoveToBank.corporations["US-financial"]!.bankCharter!.cashReserves;
    const cbBeforeMove = beforeMoveToBank.centralBanks.US!.externalBroadMoney;
    expect(session.act("moveSavings", { holder: "US-financial" }).ok).toBe(true);
    const atPrivateBank = savingsSave(session).world;
    expect(atPrivateBank.player.savings).toBe(beforeMoveToBank.player.savings);
    expect(atPrivateBank.player.cash).toBe(beforeMoveToBank.player.cash);
    expect(atPrivateBank.player.savingsHolder).toBe("US-financial");
    expect(atPrivateBank.centralBanks.US!.externalBroadMoney).toBe(cbBeforeMove - beforeMoveToBank.player.savings);
    expect(atPrivateBank.corporations["US-financial"]!.bankCharter!.cashReserves).toBe(bankCashBefore + beforeMoveToBank.player.savings);
    expect(homeSavingsCashTotal(atPrivateBank)).toBeCloseTo(homeSavingsCashTotal(beforeMoveToBank), 6);

    expect(session.act("moveSavings", { holder: "centralBank" }).ok).toBe(true);
    const backAtCentralBank = savingsSave(session).world;
    expect(backAtCentralBank.player.savings).toBe(atPrivateBank.player.savings);
    expect(backAtCentralBank.player.cash).toBe(atPrivateBank.player.cash);
    expect(backAtCentralBank.player.savingsHolder).toBe("centralBank");
    expect(backAtCentralBank.centralBanks.US!.externalBroadMoney).toBe(cbBeforeMove);
    expect(backAtCentralBank.corporations["US-financial"]!.bankCharter!.cashReserves).toBe(bankCashBefore);
    expect(homeSavingsCashTotal(backAtCentralBank)).toBeCloseTo(homeSavingsCashTotal(atPrivateBank), 6);

    const resumed = new GameSession();
    resumed.load(session.serialize(savingsSaveAt));
    session.advance();
    resumed.advance();
    expect(resumed.serialize(savingsSaveAt)).toBe(session.serialize(savingsSaveAt));
  });
  it("keeps absent-policy legacy saves pointer-only instead of inventing backing cash", () => {
    const created = new GameSession();
    created.create(options);
    const legacy = new GameSession();
    legacy.load(created.serialize(savingsSaveAt));
    const beforeTurn = savingsSave(legacy).world;
    expect(beforeTurn.savingsAccountsPolicy).toBeUndefined();

    expect(legacy.act("depositSavings", { amount: 2_000 }).ok).toBe(true);
    let after = savingsSave(legacy).world;
    expect(after.player.cash).toBe(beforeTurn.player.cash - 2_000);
    expect(after.player.savings).toBe(beforeTurn.player.savings + 2_000);
    expect(after.centralBanks.US!.externalBroadMoney).toBe(beforeTurn.centralBanks.US!.externalBroadMoney);

    legacy.advance(); // publishes the bank capacity used by the existing pointer-only move
    const beforeMove = savingsSave(legacy).world;
    const vault = beforeMove.corporations["US-financial"]!.bankCharter!.cashReserves;
    const pool = beforeMove.centralBanks.US!.externalBroadMoney;
    expect(legacy.act("moveSavings", { holder: "US-financial" }).ok).toBe(true);
    after = savingsSave(legacy).world;
    expect(after.player.savingsHolder).toBe("US-financial");
    expect(after.centralBanks.US!.externalBroadMoney).toBe(pool);
    expect(after.corporations["US-financial"]!.bankCharter!.cashReserves).toBe(vault);
  });
  it("keeps forex-disabled writes on the legacy path and gates authoritative holder changes on private banking", () => {
    const session = sessionWithSavingsAuthority();
    const save = savingsSave(session);
    save.world.featureFlags = { ...save.world.featureFlags, foreignExchange: false };
    const forexOff = new GameSession();
    forexOff.load(JSON.stringify(save));
    const before = savingsSave(forexOff).world;
    expect(forexOff.act("depositSavings", { amount: 1_000 }).ok).toBe(true);
    const afterDeposit = savingsSave(forexOff).world;
    expect(afterDeposit.player.savings).toBe(before.player.savings + 1_000);
    expect(afterDeposit.centralBanks.US!.externalBroadMoney).toBe(before.centralBanks.US!.externalBroadMoney);

    const backed = sessionWithSavingsAuthority();
    backed.advance(); // source banking turn establishes current target-bank capacity
    expect(backed.act("depositSavings", { amount: 1_000 }).ok).toBe(true);
    const backedSave = savingsSave(backed);
    backedSave.world.featureFlags = { ...backedSave.world.featureFlags, foreignExchange: false };
    const forexDisabledTransfer = new GameSession();
    forexDisabledTransfer.load(JSON.stringify(backedSave));
    const beforeTransfer = savingsSave(forexDisabledTransfer).world;
    const poolBeforeTransfer = beforeTransfer.centralBanks.US!.externalBroadMoney;
    const bankCashBeforeTransfer = beforeTransfer.corporations["US-financial"]!.bankCharter!.cashReserves;
    expect(forexDisabledTransfer.act("moveSavings", { holder: "US-financial" }).ok).toBe(true);
    const afterTransfer = savingsSave(forexDisabledTransfer).world;
    expect(afterTransfer.player.savingsHolder).toBe("US-financial");
    expect(afterTransfer.centralBanks.US!.externalBroadMoney).toBe(poolBeforeTransfer - 1_000);
    expect(afterTransfer.corporations["US-financial"]!.bankCharter!.cashReserves).toBe(bankCashBeforeTransfer + 1_000);

    const noPrivateBankingSave = savingsSave(session);
    noPrivateBankingSave.world.featureFlags = { ...noPrivateBankingSave.world.featureFlags, banking: false };
    const noPrivateBanking = new GameSession();
    noPrivateBanking.load(JSON.stringify(noPrivateBankingSave));
    const beforeMove = noPrivateBanking.serialize(savingsSaveAt);
    expect(noPrivateBanking.act("moveSavings", { holder: "centralBank" }).ok).toBe(false);
    expect(noPrivateBanking.serialize(savingsSaveAt)).toBe(beforeMove);
  });
  it("keeps the status-bar identity inputs across save and reload (#223)", () => {
    const session = new GameSession();
    const before = session.create(options);
    const loaded = new GameSession();
    const after = loaded.load(session.serialize("2026-09-10T00:00:00.000Z"));
    expect(after.player.name).toBe(before.player.name);
    expect(after.player.partyName).toBe(before.player.partyName);
    expect(after.countryName).toBe(before.countryName);
  });
  it("starts the live founding lifecycle only on explicit opt-in (#223)", () => {
    const stamp = "2026-09-10T00:00:00.000Z";
    const opted = new GameSession();
    const view = opted.create({ ...options, foundingElections: true });
    expect(view.foundingActive).toBe(true);
    expect(view.foundingOffset).toBe(0);
    const saved = JSON.parse(opted.serialize(stamp)) as {
      world: { meta: { preIteration: unknown; preIterationTurns: unknown }; elections: { cycle: number }[] };
    };
    expect(saved.world.meta.preIteration).toMatchObject({ active: true, startedTurn: 0 });
    expect(saved.world.meta.preIterationTurns).toBe(0);
    expect(saved.world.elections.length).toBeGreaterThan(0);
    expect(saved.world.elections.every((election) => election.cycle === 0)).toBe(true);
    const loaded = new GameSession();
    expect(loaded.load(opted.serialize(stamp)).foundingActive).toBe(true);
    expect(loaded.view().foundingOffset).toBe(0);
  });
  it("leaves the founding lifecycle off by default and on bare initialization founding (#223)", () => {
    const plain = new GameSession();
    expect(plain.create(options).foundingActive).toBe(false);
    expect(plain.view().foundingOffset).toBeUndefined();
    const named = new GameSession();
    expect(named.create({ ...options, initialization: "founding" }).foundingActive).toBe(false);
    expect(named.view().foundingOffset).toBeUndefined();
  });
  it("rejects invalid new-game input without replacing the current world", () => {
    const session = new GameSession();
    session.create(options);
    expect(() => session.create({ ...options, playerName: "   " })).toThrow();
    expect(session.view().player.name).toBe("Alex");
  });
  it("keeps the current world when an imported save cannot produce a playable view", () => {
    const session = new GameSession(); session.create(options);
    const before = session.serialize("2026-09-10T00:00:00.000Z");
    const corrupt = JSON.parse(before); delete corrupt.world.countries.US;
    expect(() => session.load(JSON.stringify(corrupt))).toThrow();
    expect(session.serialize("2026-09-10T00:00:00.000Z")).toBe(before);
  });
});


describe("world setup through the session contract (#241)", () => {
  const stamp = "2026-09-10T00:00:00.000Z";
  const setup = { era: "1953", countryId: "US", seed: "native-session-setup", playerName: "Alex" };
  const commonsComposition = (session: GameSession) => {
    const raw = JSON.parse(session.serialize(stamp)) as {
      world: { legislatures: Record<string, { chambers: { key: string; composition: { seatsByParty: Record<string, number> } }[] }> };
    };
    return raw.world.legislatures.UK.chambers.find((chamber) => chamber.key === "commons")!.composition.seatsByParty;
  };

  it("defaults to Career with the selected home region and no governing party", () => {
    const session = new GameSession();
    const view = session.create({ ...setup, homeRegionId: "NY" });
    expect(view.player.mode).toBe("career");
    expect(view.player.homeRegionId).toBe("NY");
    expect(view.player.hosPartyId).toBe(null);
  });

  it("binds the Head of State governing party and retains mode/homeRegion/hosPartyId through save/load", () => {
    const session = new GameSession();
    const view = session.create({ ...setup, mode: "hos", homeRegionId: "NY" });
    expect(view.player.mode).toBe("hos");
    expect(view.player.hosPartyId).toBe("US_REP");
    expect(view.player).toMatchObject({ permanentHeadOfState: true, currentOffice: "president" });
    expect(view.actions.map((action) => action.id)).toEqual(["adjustBudgetSpending", "adjustTaxRate", "nationalizeCorporation"]);
    expect(view.actions.every((action) => action.category === "executive")).toBe(true);
    const loaded = new GameSession();
    loaded.load(session.serialize(stamp));
    expect(loaded.view().player).toMatchObject({ mode: "hos", hosPartyId: "US_REP", homeRegionId: "NY", permanentHeadOfState: true, currentOffice: "president" });
    expect(loaded.view().actions.map((action) => action.id)).toEqual(["adjustBudgetSpending", "adjustTaxRate", "nationalizeCorporation"]);
  });

  it("applies Historical initialization as a real 1953 UK consequence versus Founding", () => {
    const historical = new GameSession();
    const historicalView = historical.create({ ...setup, countryId: "UK", mode: "hos", initialization: "historical" });
    expect(Object.values(commonsComposition(historical)).some((seats) => seats > 0)).toBe(true);
    // The post-initialization composition yields Labour, and the binding agrees
    // with the pre-world preview the picker showed.
    expect(historicalView.player.hosPartyId).toBe("UK_LAB");
    expect(historicalView.player.hosPartyId).toBe(rulingPartyIdForCountry("1953", "UK", "historical"));

    const founding = new GameSession();
    const foundingView = founding.create({ ...setup, countryId: "UK", mode: "hos", initialization: "founding" });
    expect(Object.values(commonsComposition(founding)).some((seats) => seats > 0)).toBe(false);
    // Founding stays null: no authored commons composition to form a government.
    expect(foundingView.player.hosPartyId).toBe(null);
  });

  it("resolves and binds 1979 UK historical while founding stays null", () => {
    const historical = new GameSession();
    const view = historical.create({ ...setup, era: "1979", countryId: "UK", mode: "hos", initialization: "historical" });
    expect(view.player.hosPartyId).toBe("UK_LAB");
    expect(view.player.hosPartyId).toBe(rulingPartyIdForCountry("1979", "UK", "historical"));

    const founding = new GameSession();
    const foundingView = founding.create({ ...setup, era: "1979", countryId: "UK", mode: "hos", initialization: "founding" });
    expect(foundingView.player.hosPartyId).toBe(null);
  });
});

describe("actions hub projection", () => {
  it("groups every hub action under its source category with engine-backed costs", () => {
    const session = new GameSession(); session.create(options);
    const actions = session.view().actions;
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      expect(["influence", "fundraising", "intelligence", "executive"]).toContain(action.category);
      expect(action.cost).toBeGreaterThanOrEqual(0);
      expect(action.fundCost).toBeGreaterThanOrEqual(0);
      expect(action.cooldownTurns).toBeGreaterThanOrEqual(0);
      if (!action.available) expect(action.disabledReason).toBeTruthy();
    }
    expect(new Set(actions.map((a) => a.category))).toEqual(new Set(["influence", "fundraising", "intelligence", "executive"]));
    expect(actions.find((a) => a.id === "fundraise")).toMatchObject({ available: true });
    expect(session.act("fundraise").ok).toBe(true);
  });
  it("projects only source-eligible corporation relocation actions and real destinations", () => {
    const session = new GameSession(); session.create(options);
    const saved = JSON.parse(session.serialize("2026-09-10T00:00:00.000Z")) as {
      world: { corporations: Record<string, Record<string, unknown>>; player: Record<string, unknown> };
    };
    const corporation = saved.world.corporations["US-manufacturing"]!;
    corporation["ceoId"] = "player";
    corporation["ceoType"] = "player";
    corporation["ceoVacant"] = false;
    corporation["isPrivate"] = true;
    corporation["headquartersRegionId"] = "DC";
    saved.world.player["homeRegionId"] = "DC";
    session.load(JSON.stringify(saved));

    const actions = session.view().actions;
    expect(actions.find((action) => action.id === "openCorporateRelocationVote")).toMatchObject({ available: false });
    expect(actions.find((action) => action.id === "relocatePlayerWithCorporation")).toMatchObject({
      available: true,
      requires: "corporationRegion",
      choices: [{ id: "US-manufacturing", label: "US.MANU" }],
    });
    expect(actions.find((action) => action.id === "relocatePlayerWithCorporation")?.destinations).toContainEqual({
      id: "LON", corporationId: "US-manufacturing", label: expect.stringContaining("UK"),
    });
  });
  it("offers real intelligence polls whose results project into the view and survive reload", () => {
    const session = new GameSession(); session.create(options);
    session.allocateStats({ charisma: 3, debate: 3, energy: 3, fundraising: 3, businessAcumen: 3, statecraft: 3, intellect: 10 });
    expect(session.view().actions.find((a) => a.id === "poll")).toMatchObject({ category: "intelligence", cost: 2, fundCost: 21_186 });
    expect(session.view().actions.find((a) => a.id === "pollLarge")).toMatchObject({ category: "intelligence", cost: 6, fundCost: 63_559 });
    expect(session.view().polls).toEqual({ quick: null, full: null });
    // Reference creation endowment (gameConfig.startingFunds 250_000): the
    // quick poll is affordable on arrival, and Fundraise stays executable.
    expect(session.view().actions.find((a) => a.id === "poll")).toMatchObject({ available: true });
    expect(session.act("fundraise").ok).toBe(true);
    expect(session.view().actions.find((a) => a.id === "poll")).toMatchObject({ available: true });
    const result = session.act("poll");
    expect(result.ok).toBe(true);
    const quick = session.view().polls.quick;
    expect(quick).toMatchObject({ kind: "quick", takenAtTurn: 0 });
    expect(quick!.overallAppeal).toBeGreaterThan(0);
    expect(quick!.topGroups).toHaveLength(5);
    expect(quick!.categories).toBeUndefined();
    expect(session.act("fundraise").ok).toBe(true);
    expect(session.act("pollLarge").ok).toBe(true);
    expect(session.view().polls.full?.categories?.length).toBeGreaterThan(0);
    const loaded = new GameSession();
    loaded.load(session.serialize("2026-09-10T00:00:00.000Z"));
    expect(loaded.view().polls).toEqual(session.view().polls);
  });
});

describe("player candidacy through the session contract", () => {
  it("exposes filing choices and preserves candidacy through reload and withdrawal", () => {
    const session = new GameSession();
    session.create(options);
    session.advance();
    expect(session.view().elections.length).toBeGreaterThan(40);
    expect(session.view().elections[0].candidacy).toMatchObject({ available: false, disabledReason: "Join a party before filing." });
    expect(session.act("joinParty", { partyId: "US_DEM" }).ok).toBe(true);
    const race = session.view().elections.find((e) => e.candidacy.available)!;
    expect(race).toBeDefined();
    expect(session.act("declareCandidacy", { electionId: race.id }).ok).toBe(true);
    expect(session.view().elections[0]).toMatchObject({ id: race.id, playerCandidate: true, candidacy: { id: "withdrawCandidacy", available: true } });
    const another = session.view().elections.find((e) => e.id !== race.id)!;
    expect(another.candidacy.available).toBe(false);
    const before = session.serialize("2026-09-10T00:00:00.000Z");
    expect(session.act("declareCandidacy", { electionId: another.id }).ok).toBe(false);
    expect(session.serialize("2026-09-10T00:00:00.000Z")).toBe(before);
    const loaded = new GameSession();
    loaded.load(before);
    expect(loaded.view().elections.find((e) => e.id === race.id)?.candidateNames).toContain("Alex");
    expect(loaded.act("withdrawCandidacy", { electionId: race.id }).ok).toBe(true);
    expect(loaded.view().elections.find((e) => e.id === race.id)).toMatchObject({ playerCandidate: false, candidacy: { id: "declareCandidacy", available: true } });
  });
  it("reflects engine withdrawal when the player leaves their party", () => {
    const session = new GameSession(); session.create(options); session.advance();
    session.act("joinParty", { partyId: "US_DEM" });
    const race = session.view().elections.find((e) => e.candidacy.available)!;
    session.act("declareCandidacy", { electionId: race.id });
    expect(session.act("leaveParty").ok).toBe(true);
    expect(session.view().elections.find((e) => e.id === race.id)).toMatchObject({ playerCandidate: false, candidacy: { available: false } });
  });
});

describe("debatePrep character action (#37)", () => {
  // Native has no stat-allocation step yet (#48/#91), so tests allocate the
  // Debate stat through the save boundary: create, inject stats, reload.
  function createAllocatedSession(seed: string): GameSession {
    const fresh = new GameSession();
    fresh.create({ ...options, seed });
    const stamp = "2026-09-10T00:00:00.000Z";
    const raw = JSON.parse(fresh.serialize(stamp)) as { world: { player: { stats?: { debate?: number } } } };
    raw.world.player.stats = { debate: 1 };
    const session = new GameSession();
    session.load(JSON.stringify(raw));
    return session;
  }
  it("exposes debate prep in the Intelligence hub with engine-backed cost", () => {
    // The statless quick-create world names the stat requirement instead of
    // advertising an action the engine refuses (first-turn availability fix:
    // the projection mirrors the executeAction Debate-stat preflight).
    const session = new GameSession(); session.create(options);
    const action = session.view().actions.find((a) => a.id === "debatePrep");
    expect(action).toMatchObject({ category: "intelligence", cost: 1, fundCost: 0, available: false });
    expect(action?.name).toContain("Debate");
    expect(action?.disabledReason).toBe("Allocate your stats before training Debate.");
    // Once stats are allocated the same hub entry is reachable and executable.
    const allocated = createAllocatedSession("debate-hub-allocated");
    expect(allocated.view().actions.find((a) => a.id === "debatePrep")).toMatchObject({ available: true });
  });
  it("refuses debate prep until stats are allocated", () => {
    const session = new GameSession(); session.create(options);
    const response = session.act("debatePrep");
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error).toMatch(/allocate your stats/i);
  });
  it("runs create -> debate prep -> save/reload through the session boundary", () => {
    const session = createAllocatedSession("debate-seed-2");
    const response = session.act("debatePrep");
    expect(response.ok).toBe(true);
    const stamp = "2026-09-10T00:00:00.000Z";
    const saved = (JSON.parse(session.serialize(stamp)) as { world: { player: { stats?: { debate?: number } } } })
      .world.player.stats?.debate;
    expect(saved).toBe(2);
    const loaded = new GameSession();
    loaded.load(session.serialize(stamp));
    expect((JSON.parse(loaded.serialize(stamp)) as { world: { player: { stats?: { debate?: number } } } })
      .world.player.stats?.debate).toBe(2);
    // The reloaded world continues the same deterministic RNG stream.
    expect(loaded.act("debatePrep").ok).toBe(true);
  });
  it("surfaces the engine AP refusal instead of executing", () => {
    const session = createAllocatedSession(options.seed);
    for (let i = 0; i < 30; i += 1) session.act("debatePrep");
    const exhausted = session.act("debatePrep");
    expect(exhausted.ok).toBe(false);
    if (!exhausted.ok) expect(exhausted.error).toMatch(/action points/i);
  });
  it("records the AP debit and debate gain in the returned outcome and result history", () => {
    const session = createAllocatedSession("debate-seed-2");
    const response = session.act("debatePrep");
    expect(response).toMatchObject({ ok: true, outcome: { actionId: "debatePrep" } });
    if (!response.ok) throw new Error("expected debatePrep to succeed");
    expect(response.outcome.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "actions", delta: -1 }),
      expect.objectContaining({ field: "debate", before: 1, after: 2, delta: 1 }),
    ]));
    const history = session.view().actionHistory ?? [];
    expect(history[0]).toMatchObject({ actionId: "debatePrep", turn: 0,
      message: "Breakthrough in the briefing room: your Debate skill improved (+1).",
      changes: expect.arrayContaining([expect.objectContaining({ field: "debate", after: 2 })]) });
    const stamp = "2026-09-10T00:00:00.000Z";
    const loaded = new GameSession();
    loaded.load(session.serialize(stamp));
    expect(loaded.view().actionHistory?.[0]).toMatchObject({ actionId: "debatePrep",
      changes: expect.arrayContaining([expect.objectContaining({ field: "debate", before: 1, after: 2 })]) });
  });
  it("records a failed roll in history without a debate change", () => {
    const session = createAllocatedSession("debate-seed-0");
    const response = session.act("debatePrep");
    expect(response).toMatchObject({ ok: true });
    if (!response.ok) throw new Error("expected debatePrep to succeed");
    expect(response.outcome.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "actions", delta: -1 }),
    ]));
    expect(response.outcome.changes.some((change) => change.field === "debate")).toBe(false);
    expect(session.view().actionHistory?.[0]).toMatchObject({ actionId: "debatePrep",
      message: "You studied hard, but no breakthrough this time." });
  });
  it("writes no history entry when the unallocated-stat refusal fires", () => {
    const session = new GameSession(); session.create(options);
    expect(session.view().actionHistory ?? []).toEqual([]);
    const response = session.act("debatePrep");
    expect(response.ok).toBe(false);
    expect(session.view().actionHistory ?? []).toEqual([]);
  });
});
