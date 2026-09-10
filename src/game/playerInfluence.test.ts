import { describe, expect, it } from 'vitest';
import type { WorldState } from '@ahdclient/engine';
import { GameSession } from './session';

const options = { era: '1953', countryId: 'US', seed: 'native-player-influence', playerName: 'Alex' };
const savedAt = '2026-09-10T00:00:00.000Z';

// Boundary: an actual saved session, turn, Profile and reload. Expectations come
// from Game d4baf899 shared/constants/formulas.ts and turn/actionRefresh.ts:
// NI uses pre-decay state influence clamped to 0..100, divided by 100. NI does
// not decay or cap. This first legacy-save case has no office or party bonus.
describe('player national influence through the saved session', () => {
  it('accrues from pre-decay state influence and continues after a legacy save reload', () => {
    const original = new GameSession();
    original.create(options);
    const legacy = JSON.parse(original.serialize(savedAt));
    delete legacy.world.player.nationalInfluence;
    legacy.world.player.politicalInfluence = 50;

    const session = new GameSession();
    session.load(JSON.stringify(legacy));
    session.advance();
    expect(session.profile().standing.nationalInfluence).toBe(0.5);
    expect(session.profile().standing.politicalInfluence).toBe(49.625);

    const resumed = new GameSession();
    resumed.load(session.serialize(savedAt));
    expect(resumed.profile().standing.nationalInfluence).toBe(0.5);
    resumed.advance();
    expect(resumed.profile().standing.nationalInfluence).toBeCloseTo(0.99625, 12);
  });

  it('uses the highest held position tier without stacking chair and justice reputation', () => {
    const original = new GameSession();
    original.create(options);
    const saved: { world: WorldState } = JSON.parse(original.serialize(savedAt));
    saved.world.player.politicalInfluence = 50;
    saved.world.player.nationalInfluence = 1000;
    saved.world.player.legislativeSeat = { countryId: 'US', chamberKey: 'house' };
    const party = Object.values(saved.world.parties).find((row) => row.countryId === 'US');
    if (!party) throw new Error('The real US seed must include a party');
    party.chairId = 'player';
    saved.world.supremeCourtSeats.push({
      seatNumber: 1, countryId: 'US', justiceMode: 'character', justiceId: 'player',
      justiceName: 'Alex', justiceParty: party.id, economicLean: 0, socialLean: 0,
      seatedAtTurn: 0, isDivergent: true, historicalOccupantIndex: 0,
      historicalOccupants: [], divergentHazardStartsTurn: null,
    });

    const session = new GameSession();
    session.load(JSON.stringify(saved));
    session.advance();
    // Game max(House 1, national chair 2, justice 2) + state 0.5.
    expect(session.profile().standing.nationalInfluence).toBe(1002.5);
    const resumed = new GameSession();
    resumed.load(session.serialize(savedAt));
    expect(resumed.profile().standing.nationalInfluence).toBe(1002.5);
  });

  it('starts at zero and clamps the state contribution while preserving executive reputation', () => {
    const independent = new GameSession();
    independent.create(options);
    independent.advance();
    expect(independent.profile().standing.nationalInfluence).toBe(0);

    const saved: { world: WorldState } = JSON.parse(independent.serialize(savedAt));
    saved.world.player.politicalInfluence = 150;
    saved.world.executives.US = {
      countryId: 'US', presidentId: 'player', presidentParty: null,
      termStartTurn: saved.world.meta.turn, vicePresidentId: null, vicePresidentParty: null,
    };
    const executive = new GameSession();
    executive.load(JSON.stringify(saved));
    executive.advance();
    // Source clamp(150, 0, 100)/100 + president tier 2.5.
    expect(executive.profile().standing.nationalInfluence).toBe(3.5);
  });

  it('rejects invalid national reputation without replacing the open saved session', () => {
    const session = new GameSession();
    session.create(options);
    const before = session.serialize(savedAt);
    for (const invalid of [null, '50', -1]) {
      const broken = JSON.parse(before);
      broken.world.player.nationalInfluence = invalid;
      expect(() => session.load(JSON.stringify(broken))).toThrow(/national influence/i);
      expect(session.serialize(savedAt)).toBe(before);
    }
  });
});
