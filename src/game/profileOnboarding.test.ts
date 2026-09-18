import { describe, expect, it } from 'vitest';
import { GameSession } from './session';

const options = { era: '1953', countryId: 'US', seed: 'native-profile-onboarding', playerName: 'Alex' };
const savedAt = '2026-09-10T00:00:00.000Z';

describe('profile onboarding and guided-tour lifecycle through the saved game session', () => {
  it('shows both prompts on a fresh save until each reaches a terminal state', () => {
    const session = new GameSession();
    session.create(options);
    expect(session.profile()).toMatchObject({
      onboarding: { dismissed: false, showPrompt: true },
      tutorial: { completed: false, dismissed: false, showPrompt: true },
    });
  });

  it('persists onboarding dismissal through serialize, load, and a turn advance', () => {
    const session = new GameSession();
    session.create(options);
    const before = JSON.parse(session.serialize(savedAt));
    session.updateProfile({ onboardingDismissed: true });
    const after = JSON.parse(session.serialize(savedAt));
    // Only the prompt flag changes; nothing else in the save moves.
    expect(after).toEqual({
      ...before,
      world: { ...before.world, player: { ...before.world.player, onboardingDismissed: true } },
    });
    expect(session.profile()).toMatchObject({ onboarding: { dismissed: true, showPrompt: false } });

    const loaded = new GameSession();
    loaded.load(session.serialize(savedAt));
    expect(loaded.profile()).toMatchObject({ onboarding: { dismissed: true, showPrompt: false } });

    loaded.advance();
    const resumed = new GameSession();
    resumed.load(loaded.serialize(savedAt));
    expect(resumed.profile()).toMatchObject({ onboarding: { dismissed: true, showPrompt: false } });
  });

  it('persists guided-tour completion and dismissal independently through reload', () => {
    const completed = new GameSession();
    completed.create(options);
    completed.updateProfile({ tutorialCompleted: true });
    expect(completed.profile()).toMatchObject({
      tutorial: { completed: true, dismissed: false, showPrompt: false },
      onboarding: { dismissed: false, showPrompt: true },
    });
    const reloadedComplete = new GameSession();
    reloadedComplete.load(completed.serialize(savedAt));
    expect(reloadedComplete.profile()).toMatchObject({
      tutorial: { completed: true, dismissed: false, showPrompt: false },
    });

    const dismissed = new GameSession();
    dismissed.create(options);
    dismissed.updateProfile({ tutorialDismissed: true });
    const reloadedDismissed = new GameSession();
    reloadedDismissed.load(dismissed.serialize(savedAt));
    expect(reloadedDismissed.profile()).toMatchObject({
      tutorial: { completed: false, dismissed: true, showPrompt: false },
    });
  });

  it('reopens getting started from the guided tour without resolving the tour', () => {
    const session = new GameSession();
    session.create(options);
    session.updateProfile({ onboardingDismissed: true });
    expect(session.profile().onboarding?.showPrompt).toBe(false);

    // The replay path clears the dismissal; the tour itself stays open.
    session.updateProfile({ onboardingDismissed: false });
    expect(session.profile()).toMatchObject({
      onboarding: { dismissed: false, showPrompt: true },
      tutorial: { completed: false, dismissed: false, showPrompt: true },
    });
    const loaded = new GameSession();
    loaded.load(session.serialize(savedAt));
    expect(loaded.profile().onboarding?.showPrompt).toBe(true);
  });

  it('rejects non-boolean prompt flags atomically', () => {
    const session = new GameSession();
    session.create(options);
    const before = session.serialize(savedAt);
    for (const patch of [
      { onboardingDismissed: 'yes' },
      { tutorialCompleted: 1 },
      { tutorialDismissed: null },
      { onboardingDismissed: true, bio: 'x'.repeat(501) },
    ]) {
      expect(() => session.updateProfile(patch as never)).toThrow();
      expect(session.serialize(savedAt)).toBe(before);
    }
  });

  it('rejects corrupt persisted prompt flags at load instead of coercing them', () => {
    const session = new GameSession();
    session.create(options);
    for (const field of ['onboardingDismissed', 'tutorialCompleted', 'tutorialDismissed'] as const) {
      const raw = JSON.parse(session.serialize(savedAt));
      raw.world.player[field] = 'yes';
      const loaded = new GameSession();
      expect(() => loaded.load(JSON.stringify(raw))).toThrow(`invalid player ${field}`);
    }
  });

  it('treats legacy saves without prompt fields as unresolved prompts', () => {
    const session = new GameSession();
    session.create(options);
    const raw = JSON.parse(session.serialize(savedAt));
    delete raw.world.player.onboardingDismissed;
    delete raw.world.player.tutorialCompleted;
    delete raw.world.player.tutorialDismissed;
    const loaded = new GameSession();
    loaded.load(JSON.stringify(raw));
    expect(loaded.profile()).toMatchObject({
      onboarding: { dismissed: false, showPrompt: true },
      tutorial: { completed: false, dismissed: false, showPrompt: true },
    });
  });
});
