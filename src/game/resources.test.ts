import { describe, expect, it } from 'vitest';
import {
  FAVORABILITY_NATURAL_DECAY_THRESHOLD,
  FAVORABILITY_TIERS,
  advertiseActionCost,
  calculateFavorabilityAboveThresholdPenalty,
  favorabilityTierFor,
} from '@ahdclient/engine';
import { GameSession } from './session';

const options = { era: '1953', countryId: 'US', seed: 'resource-details', playerName: 'Resource Player' };
const savedAt = '2026-09-10T00:00:00.000Z';

/** Loads a save with selected player and world fields overridden. */
function sessionWith(overrides: (raw: {
  world: {
    player: Record<string, unknown>;
    featureFlags: Record<string, boolean>;
  };
}) => void) {
  const created = new GameSession();
  created.create(options);
  const raw = JSON.parse(created.serialize(savedAt));
  overrides(raw);
  const loaded = new GameSession();
  loaded.load(JSON.stringify(raw));
  return loaded;
}
describe('resource details through the session contract', () => {
  it('explains the actual local action and campaign income rules', () => {
    const session = new GameSession();
    session.create(options);
    expect(session.view().resources.actions).toMatchObject({ base: 4, seat: 0, cabinet: 0, chair: 0, office: 0, penalty: 0, threshold: 100, cap: 200, next: 29, refresh: 4 });
    expect(session.view().resources.partyInfluence).toBeNull();
    expect(session.view().resources.funds).toMatchObject({ base: 10000, donor: 200, office: 0, tax: 0, regularNet: 10200 });
    expect(session.act('joinParty', { partyId: 'US_DEM' }).ok).toBe(true);
    expect(session.view().resources.funds).toMatchObject({ tax: 510, regularNet: 9690 });
    const partyInfluence = session.view().resources.partyInfluence;
    expect(partyInfluence).not.toBeNull();
    expect(typeof partyInfluence!.gain).toBe('number');
    expect(typeof partyInfluence!.closeness).toBe('number');
    const loaded = new GameSession();
    loaded.load(session.serialize('2026-09-10T00:00:00.000Z'));
    expect(loaded.view().resources).toEqual(session.view().resources);
  });
});

it('keeps Profile, footer breakdown and granted actions consistent for an office holder', () => {
  const session = new GameSession();
  session.create(options);
  const save = JSON.parse(session.serialize('2026-09-10T00:00:00.000Z'));
  save.world.player.legislativeSeat = { chamberKey: 'senate', countryId: 'US' };
  save.world.player.actions = 5;
  session.load(JSON.stringify(save));
  // Footer breakdown (world.resources) previews the same refresh the phase grants.
  expect(session.view().resources.actions).toMatchObject({ base: 4, seat: 2, cabinet: 0, chair: 0, office: 2, penalty: 0, threshold: 100, cap: 200, next: 11, refresh: 6 });
  expect(session.profile().standing).toMatchObject({ actions: 5, actionCap: 200, actionGain: 6 });
  session.advance();
  expect(session.view().player.actions).toBe(11);
  expect(session.profile().standing).toMatchObject({ actions: 11, actionGain: 6 });
});

it('does not promise campaign income when economy phases are disabled', () => {
  const session = new GameSession();
  session.create(options);
  const save = JSON.parse(session.serialize('2026-09-10T00:00:00.000Z'));
  save.world.featureFlags.economy = false;
  session.load(JSON.stringify(save));
  expect(session.view().resources.funds).toMatchObject({ enabled: false, base: 0, donor: 0, tax: 0, regularNet: 0 });
});

describe('#49 national-influence gain', () => {
  it('projects the exact per-turn gain the refresh applies and follows it across a reload', () => {
    const session = sessionWith((raw) => {
      // Senate seat is a position tier 1; influence/100 adds the rest.
      raw.world.player.legislativeSeat = { chamberKey: 'senate', countryId: 'US' };
      raw.world.player.politicalInfluence = 50;
      raw.world.player.nationalInfluence = 10;
    });
    // gain = 50 / 100 + seat tier 1 = 1.5
    expect(session.view().resources.nationalInfluence).toEqual({ current: 10, gain: 1.5 });
    expect(session.profile().standing.nationalInfluence).toBe(10);
    const gain = session.view().resources.nationalInfluence.gain;
    session.advance();
    // The displayed gain is the amount actually recorded, not a stale quote.
    expect(session.profile().standing.nationalInfluence).toBeCloseTo(10 + gain, 10);
    expect(session.view().resources.nationalInfluence.current).toBeCloseTo(10 + gain, 10);
    const loaded = new GameSession();
    loaded.load(session.serialize(savedAt));
    expect(loaded.view().resources).toEqual(session.view().resources);
  });

  it('reports zero gain at zero standing instead of claiming the mechanic is missing', () => {
    const session = sessionWith((raw) => {
      raw.world.player.politicalInfluence = 0;
    });
    expect(session.view().resources.nationalInfluence).toEqual({ current: 0, gain: 0 });
  });
});

describe('#49 favorability tiers and decay (reference-validated)', () => {
  it('matches the reference boundary table and natural-decay threshold', () => {
    // AHDGame shared/constants/formulas.ts:10 and src/lib/actions.ts:213-220.
    expect(FAVORABILITY_NATURAL_DECAY_THRESHOLD).toBe(60);
    expect(FAVORABILITY_TIERS.map((tier) => [tier.min, tier.cost]))
      .toEqual([[85, 9], [70, 8], [50, 7], [30, 6], [0, 5]]);
    expect(advertiseActionCost(85)).toBe(9);
    expect(advertiseActionCost(84)).toBe(8);
    expect(advertiseActionCost(70)).toBe(8);
    expect(advertiseActionCost(50)).toBe(7);
    expect(advertiseActionCost(30)).toBe(6);
    expect(advertiseActionCost(0)).toBe(5);
    expect(calculateFavorabilityAboveThresholdPenalty(60)).toBe(0);
    expect(calculateFavorabilityAboveThresholdPenalty(70)).toBeCloseTo(0.5, 10);
    expect(calculateFavorabilityAboveThresholdPenalty(100)).toBeCloseTo(2, 10);
  });

  it('projects the current tier boundary and above-threshold decay at each recorded value', () => {
    const favorabilityOf = (favorability: number) =>
      sessionWith((raw) => { raw.world.player.favorability = favorability; }).view().resources.favorability;
    expect(favorabilityOf(88)).toMatchObject({ current: 88, decayThreshold: 60, tierFloor: 85, tierCost: 9 });
    expect(favorabilityOf(88).aboveThresholdDecay).toBeCloseTo(1.4, 10);
    expect(favorabilityOf(72)).toMatchObject({ current: 72, decayThreshold: 60, tierFloor: 70, tierCost: 8 });
    expect(favorabilityOf(72).aboveThresholdDecay).toBeCloseTo(0.6, 10);
    // At or below the threshold favorability is stable, and the tier floor moves.
    expect(favorabilityOf(60)).toMatchObject({ tierFloor: 50, tierCost: 7, aboveThresholdDecay: 0 });
    expect(favorabilityOf(45)).toMatchObject({ tierFloor: 30, tierCost: 6, aboveThresholdDecay: 0 });
    expect(favorabilityOf(10)).toMatchObject({ tierFloor: 0, tierCost: 5, aboveThresholdDecay: 0 });
    // favorabilityTierFor is the single helper the projection and cost share.
    expect(favorabilityTierFor(88)).toEqual({ min: 85, cost: 9 });
  });
});
