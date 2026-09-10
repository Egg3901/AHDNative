import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { GameSession } from './session';

it('buys and partly sells sovereign units through the session and preserves holdings on reload', () => {
  const session = new GameSession();
  session.load(gunzipSync(readFileSync(new URL('../../fixtures/career-elected-1953-US.save.json.gz', import.meta.url))).toString('utf8'));
  const before = session.bondMarket();
  const issue = before.bonds.find(b => b.id === 'bond-60-US')!;
  // Recorded genuine fixture: 1000 face, par price, 3.75% coupon, maturity108.
  expect(issue).toMatchObject({ faceValue: 1000, marketPrice: 1, couponRate: 3.75, maturityTurn: 108, playerUnits: 0 });
  expect(session.act('buyBond', { bondId: issue.id, units: 2 }).ok).toBe(true);
  expect(session.bondMarket().playerCash).toBe(before.playerCash - 2000);
  expect(session.act('sellBond', { bondId: issue.id, units: 1 }).ok).toBe(true);
  const after = session.bondMarket();
  expect(after.playerCash).toBe(before.playerCash - 1000);
  expect(after.bonds.find(b => b.id === issue.id)!.playerUnits).toBe(1);
  const saved = session.serialize('2026-09-10T00:00:00.000Z');
  expect(session.act('buyBond', { bondId: issue.id, units: 1.5 }).ok).toBe(false);
  expect(session.serialize('2026-09-10T00:00:00.000Z')).toBe(saved);
  const resumed = new GameSession(); resumed.load(saved);
  expect(resumed.bondMarket()).toEqual(after);
  after.bonds[0]!.issuerName = 'Detached';
  expect(session.bondMarket().bonds[0]!.issuerName).not.toBe('Detached');
});
