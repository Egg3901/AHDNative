import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { GameSession } from './session';
const savedAt = '2026-09-10T00:00:00.000Z';

it('sponsors a selected tax rate from a genuine elected save and retains its bill details on reload', () => {
  const session = new GameSession();
  session.load(gunzipSync(readFileSync(new URL('../../fixtures/career-elected-1953-US.save.json.gz', import.meta.url))).toString('utf8'));
  // This real save retains sponsorship cooldown until turn 99.
  expect(session.legislation().proposals[0].sponsorAvailable).toBe(false);
  session.advance();
  expect(session.legislation().playerChamberKey).toBe("house");
  const proposal = session.legislation().proposals.find(p => p.id === 'us.tax.incomeTax')!;
  expect(proposal.sponsorAvailable).toBe(true);
  const response = session.act('sponsorBill', { catalogId: proposal.id, taxRate: 38 });
  expect(response.ok).toBe(true);
  const bill = session.legislation().chambers.flatMap(c => c.active).find(b => b.sponsorName === 'Muse' && b.title.includes('Income'))!;
  expect(bill).toBeDefined();
  expect(session.legislation({ billId: bill.id }).selectedBill).toMatchObject({ selectedRate: 38 });
  const loaded = new GameSession();
  loaded.load(session.serialize(savedAt));
  expect(loaded.legislation({ billId: bill.id }).selectedBill).toEqual(session.legislation({ billId: bill.id }).selectedBill);
});
