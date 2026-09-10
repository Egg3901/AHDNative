import { describe, expect, it } from 'vitest';
import { GameSession } from './session';

const options = { era: '1953', countryId: 'US', seed: 'resource-details', playerName: 'Resource Player' };
describe('resource details through the session contract', () => {
  it('explains the actual local action and campaign income rules', () => {
    const session = new GameSession();
    session.create(options);
    expect(session.view().resources.actions).toMatchObject({ base: 4, office: 0, penalty: 0, threshold: 100, cap: 200, next: 29 });
    expect(session.view().resources.funds).toMatchObject({ base: 10000, donor: 0, office: 0, tax: 0, regularNet: 10000 });
    expect(session.act('joinParty', { partyId: 'US_DEM' }).ok).toBe(true);
    expect(session.view().resources.funds).toMatchObject({ tax: 500, regularNet: 9500 });
    const loaded = new GameSession();
    loaded.load(session.serialize('2026-09-10T00:00:00.000Z'));
    expect(loaded.view().resources).toEqual(session.view().resources);
  });
});

it('does not promise campaign income when economy phases are disabled', () => {
  const session = new GameSession();
  session.create(options);
  const save = JSON.parse(session.serialize('2026-09-10T00:00:00.000Z'));
  save.world.featureFlags.economy = false;
  session.load(JSON.stringify(save));
  expect(session.view().resources.funds).toMatchObject({ enabled: false, base: 0, donor: 0, tax: 0, regularNet: 0 });
});
