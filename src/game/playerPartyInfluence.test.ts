import { describe, expect, it } from 'vitest';
import { GameSession } from './session';
import type { WorldState } from '@ahdclient/engine';

const options = { era: '1953', countryId: 'US', seed: 'native-player-party-influence', playerName: 'Alex' };
const savedAt = '2026-09-10T00:00:00.000Z';

// Agreed boundary: saved GameSession, complete turn, Profile and reload.
// Game d4baf899 turn/partyInfluenceTurn.ts processes Characters only. NPPs
// have no party influence (electionEngine/candidateEnrichment.ts). One SP
// member has a pool of three, calculated from influence BEFORE this turn.
describe('player party standing through saved sessions', () => {
  it('grants the aligned member pool during this turn and persists the decayed standing', () => {
    const original = new GameSession();
    original.create(options);
    const saved: { world: WorldState } = JSON.parse(original.serialize(savedAt));
    const party = saved.world.parties.US_DEM;
    if (!party) throw new Error('The US seed must have Democrats');
    saved.world.player.partyId = party.id;
    saved.world.player.partyInfluence = 10;
    saved.world.player.policies = { economic: party.economicPosition, social: party.socialPosition };
    saved.world.player.actions = 0;

    const session = new GameSession();
    session.load(JSON.stringify(saved));
    session.advance();
    expect(session.profile().standing.partyInfluence).toBe(12.6);
    expect(session.view().player.actions).toBe(7);
    const resumed = new GameSession();
    resumed.load(session.serialize(savedAt));
    expect(resumed.profile().standing.partyInfluence).toBe(12.6);
    resumed.advance();
    expect(resumed.profile().standing.partyInfluence).toBeCloseTo(15.096, 12);
    expect(resumed.view().player.actions).toBe(14);
  });
  it('stacks party and state leadership and uses the bootstrap infamy before refresh decays it', () => {
    const original = new GameSession();
    original.create(options);
    const saved: { world: WorldState } = JSON.parse(original.serialize(savedAt));
    const party = saved.world.parties.US_DEM!;
    saved.world.player.partyId = party.id;
    saved.world.player.partyInfluence = 10;
    saved.world.player.policies = { economic: party.economicPosition, social: party.socialPosition };
    saved.world.player.infamy = 300;
    saved.world.player.actions = 0;
    party.chairId = 'player';
    const stateParty = Object.values(saved.world.partyRegions).find(row => row.partyId === party.id);
    if (!stateParty) throw new Error('US seed must provide state party organizations');
    stateParty.chairId = 'player';

    const session = new GameSession();
    session.load(JSON.stringify(saved));
    session.advance();
    // 10*0.96 + aligned base 3 + national chair 5 + state chair 2 - infamy 4.
    expect(session.profile().standing.partyInfluence).toBe(15.6);
    expect(session.profile().standing.infamy).toBe(285);
    expect(session.view().player.actions).toBe(7);
  });

  it('resets party clout, preserves state reputation, and vacates leadership on membership changes', () => {
    const original = new GameSession();
    original.create(options);
    const saved: { world: WorldState } = JSON.parse(original.serialize(savedAt));
    saved.world.player.politicalInfluence = 40;
    saved.world.player.nationalInfluence = 9;
    saved.world.player.partyInfluence = 20;
    saved.world.player.actions = 50;
    const session = new GameSession();
    session.load(JSON.stringify(saved));
    expect(session.act('joinParty', { partyId: 'US_DEM' }).ok).toBe(true);
    expect(session.profile().standing).toMatchObject({
      partyInfluence: 0, politicalInfluence: 40, nationalInfluence: 9,
    });
    const member: { world: WorldState } = JSON.parse(session.serialize(savedAt));
    member.world.player.partyInfluence = 25;
    member.world.parties.US_DEM!.chairId = 'player';
    session.load(JSON.stringify(member));
    expect(session.act('leaveParty').ok).toBe(true);
    expect(session.profile().standing).toMatchObject({
      partyInfluence: 0, politicalInfluence: 40, nationalInfluence: 9,
    });
    const independent: { world: WorldState } = JSON.parse(session.serialize(savedAt));
    expect(independent.world.parties.US_DEM!.chairId).toBeNull();
    session.advance();
    expect(session.profile().standing.partyInfluence).toBe(0);
    expect(session.profile().standing.nationalInfluence).toBe(9.4);
  });

  it('includes an active caucus founder and removes that bonus after leaving', () => {
    const original = new GameSession();
    original.create(options);
    const saved: { world: WorldState } = JSON.parse(original.serialize(savedAt));
    const party = saved.world.parties.US_DEM!;
    saved.world.player.partyId = party.id;
    saved.world.player.partyInfluence = 0;
    saved.world.player.policies = { economic: party.economicPosition, social: party.socialPosition };
    saved.world.player.actions = 20;
    saved.world.player.funds = 100_000;
    const session = new GameSession();
    session.load(JSON.stringify(saved));
    expect(session.act('createCaucus', { caucusName: 'Reform Club' }).ok).toBe(true);
    session.advance();
    expect(session.profile().standing.partyInfluence).toBe(5);
    expect(session.act('leaveCaucus').ok).toBe(true);
    session.advance();
    expect(session.profile().standing.partyInfluence).toBe(7.8);
  });

  it('keeps the party grant under the imported Energy cap after office refresh', () => {
    const original = new GameSession();
    original.create(options);
    const saved: { world: WorldState } = JSON.parse(original.serialize(savedAt));
    const party = saved.world.parties.US_DEM!;
    saved.world.player.partyId = party.id;
    saved.world.player.partyInfluence = 10;
    saved.world.player.policies = { economic: party.economicPosition, social: party.socialPosition };
    saved.world.player.stats = { energy: 10 };
    saved.world.player.actions = 248;
    const session = new GameSession();
    session.load(JSON.stringify(saved));
    // Energy 10: cap250, threshold125, base4 cancels hoard4, party3 caps at250.
    expect(session.view().resources.actions).toMatchObject({ cap: 250, threshold: 125, next: 250, party: 3 });
    expect(session.profile().standing.actionGain).toBe(2);
    session.advance();
    expect(session.view().player.actions).toBe(250);
    expect(session.profile().standing.partyInfluence).toBe(12.6);
  });

  it('uses zero old clout for the first pool and policy distance for later grants', () => {
    const original = new GameSession(); original.create(options);
    const saved: { world: WorldState } = JSON.parse(original.serialize(savedAt));
    const party = saved.world.parties.US_DEM!;
    saved.world.player.partyId = party.id;
    saved.world.player.policies = { economic: party.economicPosition, social: party.socialPosition };
    saved.world.player.actions = 0;
    const session = new GameSession(); session.load(JSON.stringify(saved));
    // Missing party influence is zero: gain3, but the old pool grants no AP.
    session.advance();
    expect(session.profile().standing.partyInfluence).toBe(3);
    expect(session.view().player.actions).toBe(4);
    session.advance();
    expect(session.profile().standing.partyInfluence).toBe(5.88);
    expect(session.view().player.actions).toBe(11);

    // Opposite corners have distance sqrt(200), hence zero policy closeness.
    saved.world.parties.US_DEM!.economicPosition = 5;
    saved.world.parties.US_DEM!.socialPosition = 5;
    saved.world.player.policies = { economic: -5, social: -5 };
    saved.world.player.partyInfluence = 10;
    const opposite = new GameSession(); opposite.load(JSON.stringify(saved));
    opposite.advance();
    expect(opposite.profile().standing.partyInfluence).toBe(9.6);
    expect(opposite.view().player.actions).toBe(4);
  });

  it('rejects invalid party and policy inputs without changing the open session', () => {
    const session = new GameSession();
    session.create(options);
    const before = session.serialize(savedAt);
    for (const invalid of [
      { partyInfluence: -1 }, { partyInfluence: '10' }, { partyInfluence: null },
      { policies: null }, { policies: { economic: 6, social: 0 } },
      { policies: { economic: 0, social: '0' } }, { stats: { energy: null } },
      { stats: { energy: 11 } },
    ]) {
      const broken = JSON.parse(before);
      Object.assign(broken.world.player, invalid);
      expect(() => session.load(JSON.stringify(broken))).toThrow(/party influence|policies|energy/i);
      expect(session.serialize(savedAt)).toBe(before);
    }
  });

  it('campaigns for state influence without spending or fabricating party clout', () => {
    const original = new GameSession(); original.create(options);
    const saved: { world: WorldState } = JSON.parse(original.serialize(savedAt));
    saved.world.player.partyId = 'US_DEM';
    saved.world.player.partyInfluence = 25;
    saved.world.player.actions = 20;
    saved.world.player.funds = 100_000;
    const session = new GameSession(); session.load(JSON.stringify(saved));
    expect(session.act('campaign').ok).toBe(true);
    expect(session.profile().standing).toMatchObject({ politicalInfluence: 1, partyInfluence: 25 });
    const before = session.serialize(savedAt);
    const rejected = session.act('investInfluence');
    expect(rejected.ok).toBe(false);
    if (rejected.ok) throw new Error('Game has no clout-to-AP exchange');
    expect(rejected.error).toMatch(/no.*reference|not.*reference/i);
    expect(session.serialize(savedAt)).toBe(before);
  });

});
