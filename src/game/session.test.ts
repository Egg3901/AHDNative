import { describe, expect, it } from "vitest";
import { rulingPartyIdForCountry } from "@ahdclient/engine";
import { GameSession } from "./session";

const options = { era: "1953", countryId: "US", seed: "native-session-v1", playerName: "Alex" };

describe("singleplayer session", () => {
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
  it("keeps the status-bar identity inputs across save and reload (#223)", () => {
    const session = new GameSession();
    const before = session.create(options);
    const loaded = new GameSession();
    const after = loaded.load(session.serialize("2026-09-10T00:00:00.000Z"));
    expect(after.player.name).toBe(before.player.name);
    expect(after.player.partyName).toBe(before.player.partyName);
    expect(after.countryName).toBe(before.countryName);
  });
  it("projects founding-inactive on a fresh world and across real turns (#223)", () => {
    const session = new GameSession();
    expect(session.create(options).foundingActive).toBe(false);
    for (let turn = 0; turn < 30; turn += 1) session.advance();
    expect(session.view().foundingActive).toBe(false);
  });
  it("projects founding-active through save/reload while a cycle-0 race is unresolved (#223)", () => {
    const stamp = "2026-09-10T00:00:00.000Z";
    const session = new GameSession();
    session.create(options);
    const saved = JSON.parse(session.serialize(stamp));
    saved.world.elections.push({ id: "house:US:NY:c0", electionType: "house", countryId: "US", state: "NY", cycle: 0, status: "upcoming", startTurn: 0, primaryEndTurn: 24, endTurn: 48, totalSeats: 1, chamberKey: "house", candidates: [], tally: {} });
    expect(new GameSession().load(JSON.stringify(saved)).foundingActive).toBe(true);
    const loaded = new GameSession();
    loaded.load(JSON.stringify(saved));
    expect(new GameSession().load(loaded.serialize(stamp)).foundingActive).toBe(true);
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
    // The New Game "founding" initialization only selects authored legislature
    // composition; it never starts the pre-iteration lifecycle.
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
    expect(view.actions.map((action) => action.id)).toEqual(["adjustBudgetSpending", "adjustTaxRate"]);
    expect(view.actions.every((action) => action.category === "executive")).toBe(true);
    const loaded = new GameSession();
    loaded.load(session.serialize(stamp));
    expect(loaded.view().player).toMatchObject({ mode: "hos", hosPartyId: "US_REP", homeRegionId: "NY", permanentHeadOfState: true, currentOffice: "president" });
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
  it("groups every hub action under Influence, Fundraising or Intelligence with engine-backed costs", () => {
    const session = new GameSession(); session.create(options);
    const actions = session.view().actions;
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      expect(["influence", "fundraising", "intelligence"]).toContain(action.category);
      expect(action.cost).toBeGreaterThanOrEqual(0);
      expect(action.fundCost).toBeGreaterThanOrEqual(0);
      expect(action.cooldownTurns).toBeGreaterThanOrEqual(0);
      if (!action.available) expect(action.disabledReason).toBeTruthy();
    }
    expect(new Set(actions.map((a) => a.category))).toEqual(new Set(["influence", "fundraising", "intelligence"]));
    expect(actions.find((a) => a.id === "fundraise")).toMatchObject({ available: false, disabledReason: "No donor base. Use Build Donor Network first." });
  });
  it("offers real intelligence polls whose results project into the view and survive reload", () => {
    const session = new GameSession(); session.create(options);
    expect(session.view().actions.find((a) => a.id === "poll")).toMatchObject({ category: "intelligence", cost: 2, fundCost: 25_000 });
    expect(session.view().actions.find((a) => a.id === "pollLarge")).toMatchObject({ category: "intelligence", cost: 6, fundCost: 75_000 });
    expect(session.view().polls).toEqual({ quick: null, full: null });
    // New players start broke: polls are funds-gated until money is raised.
    expect(session.view().actions.find((a) => a.id === "poll")).toMatchObject({ available: false });
    expect(session.act("convertCash", { amount: 10000 }).ok).toBe(true);
    expect(session.act("buildDonorBase").ok).toBe(true);
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
    const session = new GameSession(); session.create(options);
    const action = session.view().actions.find((a) => a.id === "debatePrep");
    expect(action).toMatchObject({ category: "intelligence", cost: 1, fundCost: 0, available: true });
    expect(action?.name).toContain("Debate");
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
});
