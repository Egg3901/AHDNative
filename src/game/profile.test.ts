import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_CATALOG, ACHIEVEMENT_COUNT_TRIGGERS } from '@ahdclient/engine';
import { GameSession } from './session';

const options = { era: '1953', countryId: 'US', seed: 'native-profile-achievements', playerName: 'Alex' };
const savedAt = '2026-09-10T00:00:00.000Z';

// The exact subset solo's achievement phase can evaluate, in catalog order.
const evaluable = ACHIEVEMENT_CATALOG
  .filter((entry) => entry.status === 'available')
  .sort((a, b) => a.order - b.order);

/** Loads a save whose persisted achievementsEarned is exactly `earned`. */
function profileWith(earned: string[]) {
  const session = new GameSession();
  session.create(options);
  const raw = JSON.parse(session.serialize(savedAt));
  raw.world.achievementsEarned = earned;
  const loaded = new GameSession();
  loaded.load(JSON.stringify(raw));
  return loaded.profile();
}

/** Loads a save with the persisted per-action counts overridden. */
function sessionWithCounts(counts: Record<string, number>) {
  const session = new GameSession();
  session.create(options);
  const raw = JSON.parse(session.serialize(savedAt));
  raw.world.player.actionCounts = counts;
  const loaded = new GameSession();
  loaded.load(JSON.stringify(raw));
  return loaded;
}

describe('profile achievement progress', () => {
  it('reports a full earned-of-evaluable count and no locked entries once all are earned', () => {
    const profile = profileWith(evaluable.map((entry) => entry.slug));
    expect(profile.achievementProgress).toEqual({
      earned: evaluable.length,
      available: evaluable.length,
    });
    expect(profile.lockedAchievements).toEqual([]);
  });

  it('lists every evaluable-but-unearned catalog entry as locked, in catalog order', () => {
    const profile = profileWith([]);
    expect(profile.achievementProgress).toEqual({ earned: 0, available: evaluable.length });
    expect(profile.achievements).toEqual([]);
    expect(profile.lockedAchievements.map((entry) => entry.slug)).toEqual(
      evaluable.map((entry) => entry.slug),
    );
    // names and descriptions come verbatim from the catalog, nothing invented
    expect(profile.lockedAchievements[0]).toEqual({
      slug: evaluable[0].slug,
      name: evaluable[0].name,
      description: evaluable[0].description,
    });
  });

  it('never lists an unavailable PORT-STUB entry as a locked (reachable) achievement', () => {
    const profile = profileWith([]);
    const unavailable = ACHIEVEMENT_CATALOG.filter((entry) => entry.status === 'unavailable');
    expect(unavailable.length).toBeGreaterThan(0);
    for (const entry of unavailable) {
      expect(profile.lockedAchievements.some((locked) => locked.slug === entry.slug)).toBe(false);
    }
  });

  it('surfaces only persisted earned slugs and drops unknown ones without fabricating any', () => {
    const profile = profileWith(['turn_one', 'not_a_real_slug', 'first_fundraise']);
    expect(profile.achievements.map((entry) => entry.slug)).toEqual(['turn_one', 'first_fundraise']);
    expect(profile.achievementProgress).toEqual({ earned: 2, available: evaluable.length });
    expect(profile.lockedAchievements.some((entry) => entry.slug === 'turn_one')).toBe(false);
    expect(profile.lockedAchievements.some((entry) => entry.slug === 'first_fundraise')).toBe(false);
    expect(profile.lockedAchievements.some((entry) => entry.slug === 'not_a_real_slug')).toBe(false);
    expect(profile.lockedAchievements).toHaveLength(evaluable.length - 2);
  });

  it('counts only evaluable earned slugs toward progress, even if an unavailable slug is persisted', () => {
    const unavailable = ACHIEVEMENT_CATALOG.find((entry) => entry.status === 'unavailable')!;
    const profile = profileWith(['turn_one', unavailable.slug]);
    // A manually granted unavailable record still shows as an earned record ...
    expect(profile.achievements.map((entry) => entry.slug)).toContain(unavailable.slug);
    // ... but it never inflates the honest earned-of-evaluable progress count ...
    expect(profile.achievementProgress.earned).toBe(1);
    // ... and it is not part of the evaluable locked set either.
    expect(profile.lockedAchievements.some((entry) => entry.slug === unavailable.slug)).toBe(false);
  });

  it('keeps career history sourced only from persisted resolved wins (no fabricated events)', () => {
    const session = new GameSession();
    session.create(options);
    const raw = JSON.parse(session.serialize(savedAt)) as {
      world: { elections: unknown[] };
    };
    const race = {
      id: 'house:US:US-NY:c1', electionType: 'house', countryId: 'US', state: 'US-NY',
      cycle: 1, status: 'resolved', startTurn: 1, primaryEndTurn: 3, endTurn: 5,
      totalSeats: 1, chamberKey: 'house', candidates: [
        { id: 'player', name: 'Alex', partyId: '1', isNPP: false, incumbent: false },
      ], tally: { player: 100 }, winners: ['player'], resolvedTurn: 5,
    };
    const loss = { ...race, id: 'house:US:US-NY:c2', winners: ['npp'], resolvedTurn: 6 };
    raw.world.elections = [race, loss];
    const loaded = new GameSession();
    loaded.load(JSON.stringify(raw));
    const careerHistory = loaded.profile().careerHistory;
    // Only the persisted win surfaces; the persisted loss is never turned into an event.
    expect(careerHistory).toHaveLength(1);
    expect(careerHistory[0]).toMatchObject({ id: race.id, result: 'Elected', turn: race.resolvedTurn });
    expect(typeof careerHistory[0].office).toBe('string');
    expect(careerHistory[0].office.length).toBeGreaterThan(0);
  });

  it('orders persisted career wins newest-first and never fabricates a race', () => {
    const session = new GameSession();
    session.create(options);
    const raw = JSON.parse(session.serialize(savedAt)) as { world: { elections: unknown[] } };
    const mkRace = (id: string, resolvedTurn: number, winners: string[]) => ({
      id, electionType: 'house', countryId: 'US', state: 'US-NY',
      cycle: 1, status: 'resolved', startTurn: 1, primaryEndTurn: 3, endTurn: resolvedTurn,
      totalSeats: 1, chamberKey: 'house', candidates: [
        { id: 'player', name: 'Alex', partyId: '1', isNPP: false, incumbent: false },
      ], tally: { player: winners.includes('player') ? 100 : 0 }, winners, resolvedTurn,
    });
    raw.world.elections = [mkRace('race-old', 4, ['player']), mkRace('race-lost', 8, ['npp']), mkRace('race-new', 12, ['player'])];
    const loaded = new GameSession();
    loaded.load(JSON.stringify(raw));
    // Newest resolved win first; the loss is never converted into a career event.
    expect(loaded.profile().careerHistory.map((entry) => entry.id)).toEqual(['race-new', 'race-old']);
  });
});

describe('#52 countable achievement progress', () => {
  it('shows current / target only for count-trigger achievements, from persisted counts', () => {
    const profile = sessionWithCounts({
      fundraise: 12, campaign: 4, buildDonorBase: 5, advertise: 3, rest: 1, wireTransfer: 2,
    }).profile();
    const bySlug = new Map(profile.lockedAchievements.map((entry) => [entry.slug, entry]));
    expect(bySlug.get('first_fundraise')!.progress).toEqual({ current: 12, target: 1 });
    expect(bySlug.get('fundraiser')!.progress).toEqual({ current: 12, target: 10 });
    expect(bySlug.get('big_fundraiser')!.progress).toEqual({ current: 12, target: 50 });
    expect(bySlug.get('campaigner')!.progress).toEqual({ current: 4, target: 10 });
    expect(bySlug.get('grassroots')!.progress).toEqual({ current: 5, target: 5 });
    expect(bySlug.get('advertiser')!.progress).toEqual({ current: 3, target: 3 });
    expect(bySlug.get('rested')!.progress).toEqual({ current: 1, target: 1 });
    expect(bySlug.get('donor')!.progress).toEqual({ current: 2, target: 1 });
    // century_club counts every action: 12 + 4 + 5 + 3 + 1 + 2 = 27.
    expect(bySlug.get('century_club')!.progress).toEqual({ current: 27, target: 100 });
    // Boolean / current-state triggers have no honest numeric target.
    expect(bySlug.get('turn_one')!.progress).toBeUndefined();
    expect(bySlug.get('house_member')!.progress).toBeUndefined();
    expect(bySlug.get('iron_triangle')!.progress).toBeUndefined();
    expect(bySlug.get('millionaire')!.progress).toBeUndefined();
  });

  it('keeps the projected target identical to the exported grant threshold', () => {
    const profile = sessionWithCounts({ fundraise: 7 }).profile();
    const fundraiser = profile.lockedAchievements.find((entry) => entry.slug === 'fundraiser')!;
    expect(fundraiser.progress!.target).toBe(ACHIEVEMENT_COUNT_TRIGGERS['fundraiser']!.target);
    expect(ACHIEVEMENT_COUNT_TRIGGERS['fundraiser']).toEqual({ actionId: 'fundraise', target: 10 });
  });

  it('moves a countable achievement to earned after a turn without losing its recorded progress', () => {
    const session = sessionWithCounts({ rest: 1 });
    expect(session.profile().lockedAchievements.some((entry) => entry.slug === 'rested')).toBe(true);
    session.advance();
    const earned = session.profile().achievements.find((entry) => entry.slug === 'rested')!;
    expect(earned.progress).toEqual({ current: 1, target: 1 });
    expect(session.profile().lockedAchievements.some((entry) => entry.slug === 'rested')).toBe(false);
  });

  it('surfaces identical progress and the unavailable set after a save/reload', () => {
    const session = sessionWithCounts({ fundraise: 6, rest: 1 });
    const before = session.profile();
    const resumed = new GameSession();
    resumed.load(session.serialize(savedAt));
    const after = resumed.profile();
    expect(after.achievementProgress).toEqual(before.achievementProgress);
    expect(after.lockedAchievements).toEqual(before.lockedAchievements);
    expect(after.unavailableAchievements).toEqual(before.unavailableAchievements);
    // Reload never invents earned records the save did not persist.
    expect(after.achievements).toEqual(before.achievements);
  });
});

describe('#52 full achievement catalog', () => {
  it('lists every unavailable catalog entry with its blocking system, separate from earned/locked', () => {
    const profile = profileWith([]);
    const unavailable = ACHIEVEMENT_CATALOG
      .filter((entry) => entry.status === 'unavailable')
      .sort((a, b) => a.order - b.order);
    expect(unavailable.length).toBeGreaterThan(0);
    expect(profile.unavailableAchievements.map((entry) => entry.slug)).toEqual(unavailable.map((entry) => entry.slug));
    for (const entry of unavailable) {
      const view = profile.unavailableAchievements.find((item) => item.slug === entry.slug)!;
      // The blocker is the catalog's own named reason, never a generic fallback.
      expect(view.blockingSystem).toBe(entry.blockingSystem);
      expect(view.blockingSystem).toBeTruthy();
      // Unavailable entries never leak into the reachable/locked set.
      expect(profile.lockedAchievements.some((locked) => locked.slug === entry.slug)).toBe(false);
    }
  });

  it('leaves the earned count and locked list untouched by the unavailable catalog view', () => {
    const profile = profileWith(['turn_one']);
    expect(profile.achievementProgress.earned).toBe(1);
    expect(profile.unavailableAchievements.length).toBe(
      ACHIEVEMENT_CATALOG.filter((entry) => entry.status === 'unavailable').length,
    );
  });
});

/** The save slice these projection tests patch before reload. */
type MutableSave = {
  world: {
    player: { partyId: string | null; policies?: { economic: number; social: number } };
    parties: Record<string, { economicPosition?: number; socialPosition?: number }>;
  };
};

/** Loads a save whose world is patched in place before projection. */
function profileFrom(mutate: (raw: MutableSave) => void) {
  const session = new GameSession();
  session.create(options);
  const raw = JSON.parse(session.serialize(savedAt)) as MutableSave;
  mutate(raw);
  const loaded = new GameSession();
  loaded.load(JSON.stringify(raw));
  return loaded.profile();
}

describe('#50 policy compass projection', () => {
  it('projects the party authored positions and the player axes from real state', () => {
    const profile = profileFrom((raw) => {
      raw.world.player.partyId = 'US_DEM';
      raw.world.player.policies = { economic: -3, social: 1 };
    });
    // The party's economicPosition/socialPosition are read straight from world.parties.
    expect(profile.party).toEqual({
      id: 'US_DEM', name: 'Democratic Party', color: '#3B82F6',
      economicPosition: -2, socialPosition: -2,
    });
    expect(profile.policies).toEqual({ economic: -3, social: 1 });
  });

  it('reports a null policy axis on a fresh save instead of a fabricated 0/0', () => {
    const session = new GameSession();
    session.create(options);
    const profile = session.profile();
    // Nothing in the engine writes world.player.policies, so there is no honest axis to show.
    expect(profile.policies).toBeNull();
    expect(profile.party).toBeNull();
  });

  it('never fabricates a party position when the party record omits it', () => {
    const profile = profileFrom((raw) => {
      raw.world.player.partyId = 'US_DEM';
      delete raw.world.parties.US_DEM.economicPosition;
      delete raw.world.parties.US_DEM.socialPosition;
    });
    const party = profile.party!;
    expect(party).toEqual({ id: 'US_DEM', name: 'Democratic Party', color: '#3B82F6' });
    expect('economicPosition' in party).toBe(false);
    expect('socialPosition' in party).toBe(false);
  });

  it('keeps the party position and axes through a save/reload', () => {
    const session = new GameSession();
    session.create(options);
    const raw = JSON.parse(session.serialize(savedAt));
    raw.world.player.partyId = 'US_REP';
    raw.world.player.policies = { economic: 4, social: -1 };
    const loaded = new GameSession();
    loaded.load(JSON.stringify(raw));
    const before = loaded.profile();
    const resumed = new GameSession();
    resumed.load(loaded.serialize(savedAt));
    const after = resumed.profile();
    expect(after.party).toEqual(before.party);
    expect(after.party).toEqual({
      id: 'US_REP', name: 'Republican Party', color: '#EF4444',
      economicPosition: 2, socialPosition: 2,
    });
    expect(after.policies).toEqual({ economic: 4, social: -1 });
  });
});
