import { expect, it } from 'vitest';
import { GameSession } from './session';

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
