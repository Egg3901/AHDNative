import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_CATALOG } from '@ahdclient/engine';
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
});
