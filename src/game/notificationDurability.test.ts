import { describe, expect, it } from 'vitest';
import { GameSession } from './session';
import { projectSaveToV42 } from './saveCompatibility';

const options = { era: '1953', countryId: 'US', seed: 'inbox-durability', playerName: 'Reader' };
const savedAt = '2026-09-10T00:00:00.000Z';

describe('notification save transaction', () => {
  it('prepares a save notice without claiming persistence before acknowledgement', () => {
    const session = new GameSession(); session.create(options);
    const before = session.serialize(savedAt);
    const prepared = session.serialize(savedAt, true);
    expect(JSON.parse(prepared).notifications.some((item: { key: string }) => item.key === 'save:0')).toBe(true);
    // Failed storage never acknowledges; the active session must remain unchanged.
    expect(session.serialize(savedAt) === before, "open session must remain unchanged").toBe(true);
    session.recordSave();
    expect(session.serialize(savedAt)).toBe(prepared);
    const loaded = new GameSession(); loaded.load(prepared);
    expect(loaded.serialize(savedAt)).toBe(prepared);
  });

  it('preserves full history beyond the reference fetch page through turns and reload', () => {
    const session = new GameSession(); session.create(options);
    const save = JSON.parse(session.serialize(savedAt));
    save.notifications = Array.from({ length: 125 }, (_, index) => ({
      ...save.notifications[0], id: `notice-${index}`, key: `notice-${index}`, actionRequired: true,
    }));
    session.load(JSON.stringify(save));
    session.advance();
    const loaded = new GameSession(); loaded.load(session.serialize(savedAt));
    expect(loaded.view().notifications.items.filter(item => item.key.startsWith('notice-'))).toHaveLength(125);
    expect(loaded.view().notifications.items.find(item => item.id === 'notice-124')?.unread).toBe(true);
  });

  it('rejects invalid metadata or a nonplayable world without replacing either state', () => {
    const session = new GameSession(); session.create(options);
    const before = session.serialize(savedAt);
    const unplayable = JSON.parse(before);
    unplayable.world.countries.US.playable = false;
    unplayable.notifications = [];
    expect(() => session.load(JSON.stringify(unplayable))).toThrow(/playable country/);
    expect(session.serialize(savedAt) === before, "open session must remain unchanged").toBe(true);
    const validNotice = JSON.parse(before).notifications[0];
    for (const notifications of [null, 'bad', [{}], [{ ...validNotice, unread: 'yes' }], [validNotice, validNotice]]) {
      const bad = JSON.parse(before); bad.notifications = notifications;
      expect(() => session.load(JSON.stringify(bad))).toThrow(/notifications/i);
      expect(session.serialize(savedAt) === before, "open session must remain unchanged").toBe(true);
    }
  });

  it('keeps app inbox metadata through the supported v42 projection', () => {
    const session = new GameSession(); session.create(options);
    session.markAllNotificationsRead();
    const projected = projectSaveToV42(session.serialize(savedAt));
    expect(projected.ok).toBe(true);
    if (!projected.ok) throw new Error(projected.error);
    const loaded = new GameSession(); loaded.load(projected.contents);
    expect(loaded.view().notifications).toEqual(session.view().notifications);
  });
});
