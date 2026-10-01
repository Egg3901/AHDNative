import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { deserializeSave, serializeSave, type WorldState } from '@ahdclient/engine';
import { GameSession } from './session';

const SAVED_AT = '2026-09-10T00:00:00.000Z';
const ELECTED = new URL('../../fixtures/career-elected-1953-US.save.json.gz', import.meta.url);

function electedWorld(): WorldState {
  return deserializeSave(gunzipSync(readFileSync(ELECTED)).toString('utf8'));
}

it('keeps world browsing detached from the player and routine turn data', () => {
  const session = new GameSession();
  session.create({ era: '1953', countryId: 'US', playerName: 'Alex', seed: 'world-browser' });
  const before = session.serialize('2026-09-10T00:00:00.000Z');
  const view = session.worldOverview();
  expect(view.playerCountryId).toBe('US');
  expect(view.homeRegion?.id).toBe('AL');
  expect(view.nations.some(nation => !nation.playable)).toBe(true);
  expect(session.view()).not.toHaveProperty('worldOverview');
  view.nations.length = 0;
  if (view.homeRegion) view.homeRegion.name = 'Changed display';
  expect(session.serialize('2026-09-10T00:00:00.000Z')).toBe(before);
});

it('projects role-gated home-region rows and the regional economy across the session boundary', () => {
  const world = electedWorld();
  const held = structuredClone(world);
  held.governors.AL.governorId = 'player';
  held.governors.AL.governorName = 'Muse';
  held.governors.AL.governorParty = 'US_DEM';
  const race = held.elections.find((election) => election.id === 'house:US:AL:c2')!;
  race.candidates.push({ id: 'player', name: 'Muse', partyId: 'US_DEM', isNPP: false, incumbent: false });

  const session = new GameSession();
  session.load(serializeSave(held, SAVED_AT));
  const before = session.serialize(SAVED_AT);
  const view = session.worldOverview();
  const home = view.homeRegion;
  expect(home?.id).toBe('AL');
  expect(home?.viewer.governorOffice).toEqual({
    kind: 'governor',
    label: 'Governor',
    termStartTurn: 96,
    availableActions: 3,
    lastAddressTurn: null,
    destination: { route: 'regions', id: 'AL' },
  });
  expect(home?.viewer.myElection).toEqual({
    id: 'house:US:AL:c2',
    electionType: 'house',
    chamberKey: 'house',
    chamberName: 'House of Representatives',
    status: 'active',
    phase: 'primary',
    scope: 'region',
    destination: { route: 'electionDetails', id: 'house:US:AL:c2' },
  });
  expect(home?.viewer.myOffice).toEqual({
    kind: 'legislature',
    label: 'House of Representatives',
    detail: 'United States',
    destination: { route: 'legislature', id: 'house' },
  });
  expect(home?.capitalStockMillions).toBeCloseTo(13371.22, 1);
  expect(home?.laborForce).toBe(1_146_349);
  expect(home?.macro?.unemploymentRate).toBeCloseTo(0.0103, 4);
  expect(home?.budget?.revenue.total).toBeGreaterThan(0);
  expect(home?.sectors.length).toBeGreaterThan(0);

  // Detached: clearing the rows on the DTO never touches the session bytes.
  home!.viewer = { governorOffice: null, myElection: null, myOffice: null };
  expect(session.serialize(SAVED_AT)).toBe(before);

  const resumed = new GameSession();
  resumed.load(session.serialize(SAVED_AT));
  const reloaded = resumed.worldOverview();
  expect(reloaded.homeRegion?.viewer.myElection?.id).toBe('house:US:AL:c2');
  expect(reloaded.homeRegion?.viewer.governorOffice?.availableActions).toBe(3);
});

it('projects the source administrative fallback formation without narrowing its saved value', () => {
  const session = new GameSession();
  session.create({
    era: '1953',
    countryId: 'UK',
    playerName: 'Alex',
    seed: 'world-browser-admin-formation',
    mode: 'hos',
    homeRegionId: 'EMI',
    initialization: 'historical',
  });
  const save = JSON.parse(session.serialize(SAVED_AT)) as {
    world: { governments: Record<string, { formationType: string | null }> };
  };
  save.world.governments.UK!.formationType = 'admin';
  session.load(JSON.stringify(save));

  expect(session.worldOverview().nations.find((nation) => nation.id === 'UK')?.government.formationType).toBe('admin');
});

it('carries recorded race and leader links on every nation (#73)', () => {
  const session = new GameSession();
  session.load(serializeSave(electedWorld(), SAVED_AT));
  const view = session.worldOverview();

  for (const nation of view.nations) {
    expect(nation.races.length).toBeLessThanOrEqual(3);
    for (const race of nation.races) {
      expect(race.id.length).toBeGreaterThan(0);
      expect(race.label.length).toBeGreaterThan(0);
    }
    if (nation.leader) {
      expect(nation.leader.id.length).toBeGreaterThan(0);
      expect(nation.leader.name.length).toBeGreaterThan(0);
    }
  }
  const playerNation = view.nations.find((nation) => nation.id === 'US')!;
  expect(playerNation.races.length).toBeGreaterThan(0);
});
