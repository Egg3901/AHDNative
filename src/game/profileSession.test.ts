import { describe, expect, it } from 'vitest';
import { GameSession } from './session';

const options = { era: '1953', countryId: 'US', seed: 'native-profile-port', playerName: 'Alex' };
const savedAt = '2026-09-10T00:00:00.000Z';
// A real 1px PNG, independent of the upload implementation.
const portrait = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';

describe('profile through the saved game session', () => {
  it('persists biography and picture without spending resources, changing time or RNG', () => {
    const session = new GameSession();
    session.create(options);
    const before = JSON.parse(session.serialize(savedAt));
    session.updateProfile({ bio: '  Organizing for our community.  ', avatarUrl: portrait });
    const after = JSON.parse(session.serialize(savedAt));
    expect(after).toEqual({ ...before, world: { ...before.world, player: {
      ...before.world.player, bio: 'Organizing for our community.', avatarUrl: portrait,
    } } });
    const loaded = new GameSession();
    loaded.load(session.serialize(savedAt));
    expect(loaded.profile()).toMatchObject({ bio: 'Organizing for our community.', avatarUrl: portrait });
    loaded.advance();
    const resumed = new GameSession();
    resumed.load(loaded.serialize(savedAt));
    expect(resumed.profile()).toMatchObject({ bio: 'Organizing for our community.', avatarUrl: portrait });
  });

  it('rejects invalid edits atomically and supports clearing the profile', () => {
    const session = new GameSession(); session.create(options);
    session.updateProfile({ bio: 'Original biography', avatarUrl: portrait });
    const before = session.serialize(savedAt);
    for (const patch of [
      { bio: 'x'.repeat(501) }, { avatarUrl: 'https://example.com/portrait.png' },
      { avatarUrl: 'data:image/svg+xml;base64,PHN2Zz4=' },
      { bio: 'Do not commit', avatarUrl: 'data:image/png;base64,bm90LWFuLWltYWdl' },
      { avatarUrl: 'data:image/png;base64,' + 'A'.repeat(3_000_000) },
    ]) {
      expect(() => session.updateProfile(patch)).toThrow();
      expect(session.serialize(savedAt)).toBe(before);
    }
    session.updateProfile({ bio: '', avatarUrl: null });
    expect(session.profile()).toMatchObject({ bio: '', avatarUrl: null });
    const loaded = new GameSession(); loaded.load(session.serialize(savedAt));
    expect(loaded.profile()).toMatchObject({ bio: '', avatarUrl: null });
  });

  it('opens older saves without fabricated profile metadata or unsupported stats', () => {
    const session = new GameSession(); session.create(options);
    const loaded = new GameSession(); loaded.load(session.serialize(savedAt));
    expect(loaded.profile()).toMatchObject({ name: 'Alex', bio: '', avatarUrl: null,
      standing: { nationalInfluence: 0, partyInfluence: 0, infamy: 0 },
      finances: { donorBaseLevel: 0 },
    });
  });

  it('normalizes, persists and clears the reference campaign song settings', () => {
    const session = new GameSession(); session.create(options);
    session.updateProfile({
      campaignSongUrl: ' https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share ',
      campaignSongAutoplay: true,
    });
    expect(session.profile()).toMatchObject({ campaignSongUrl: 'dQw4w9WgXcQ', campaignSongAutoplay: true });
    const loaded = new GameSession(); loaded.load(session.serialize(savedAt));
    expect(loaded.profile()).toMatchObject({ campaignSongUrl: 'dQw4w9WgXcQ', campaignSongAutoplay: true });

    loaded.updateProfile({ campaignSongUrl: '', campaignSongAutoplay: false });
    expect(loaded.profile()).toMatchObject({ campaignSongUrl: '', campaignSongAutoplay: false });
  });

  it('rejects invalid campaign song input atomically', () => {
    const session = new GameSession(); session.create(options);
    const before = session.serialize(savedAt);
    expect(() => session.updateProfile({ campaignSongUrl: 'https://example.com/not-youtube' })).toThrow(
      'Enter a valid YouTube URL or 11-character video ID.',
    );
    expect(session.serialize(savedAt)).toBe(before);
  });

  it('rebuilds the selected profile hierarchy from persisted engine state after reload', () => {
    const session = new GameSession(); session.create(options);
    const raw = JSON.parse(session.serialize(savedAt));
    raw.world.player.policies = { economic: -2, social: 3 };
    raw.world.player.stats = { energy: 8, debate: 6 };
    raw.world.achievementsEarned = ['turn_one'];
    const race = {
      id: 'house:US:US-NY:c1', electionType: 'house', countryId: 'US', state: 'US-NY',
      cycle: 1, status: 'resolved', startTurn: 1, primaryEndTurn: 3, endTurn: 5,
      totalSeats: 1, chamberKey: 'house', candidates: [
        { id: 'player', name: 'Alex', partyId: '1', isNPP: false, incumbent: false },
      ], tally: { player: 100 }, winners: ['player'], resolvedTurn: 5,
    };
    raw.world.elections = [race];

    const loaded = new GameSession(); loaded.load(JSON.stringify(raw));
    expect(loaded.profile()).toMatchObject({
      name: 'Alex',
      policies: { economic: -2, social: 3 },
      stats: { energy: 8, debate: 6 },
      achievements: [{ slug: 'turn_one', name: 'In at the Ground Floor' }],
      careerHistory: [{ id: race.id, result: 'Elected', turn: race.endTurn }],
    });

    const resumed = new GameSession(); resumed.load(loaded.serialize(savedAt));
    expect(resumed.profile()).toEqual(loaded.profile());
  });
});
