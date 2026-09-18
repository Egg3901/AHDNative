import { describe, expect, it } from "vitest";
import { GameSession, gameChoices } from "./session";

/**
 * First actionable state from world creation (#243/#240, follow-up to #447).
 *
 * The merged no-CF test pins the 250,000 CF / donor-floor bootstrap; this file
 * pins the remaining creation-flow gap it left open: the session projection
 * advertised debatePrep as available on the statless quick-create path
 * (era/country/name/seed, no character-creation stats block) while the
 * authoritative engine gate in executeAction unconditionally refuses it
 * ("Allocate your stats before training Debate (missing Debate stat)"). The
 * hub promised a first-turn action that could never execute.
 *
 * Source backing: packages/engine/src/actions/execute.ts debatePrep
 * preflight (`world.player.stats?.debate === undefined`) and the catalog
 * description ("Requires an allocated Debate stat"). The projection mirrors
 * the gate; executeAction stays authoritative.
 */

const stamp = "2026-09-17T00:00:00.000Z";

const OWNER_STATS = {
  charisma: 4,
  debate: 4,
  energy: 4,
  fundraising: 4,
  businessAcumen: 4,
  statecraft: 4,
  intellect: 4,
} as const;

function ownerCreation() {
  return {
    name: "Alex",
    partyId: null,
    policies: { economic: 0, social: 0 },
    demographics: {
      race: "white",
      gender: "male",
      education: "college",
      wealth: "high",
    } as const,
    stats: { ...OWNER_STATS },
  };
}

describe("first actionable state from world creation", () => {
  it("marks debatePrep unavailable with an explicit reason on the statless quick-create path", () => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "first-turn-statless", playerName: "Alex" });

    const entry = session.view().actions.find((action) => action.id === "debatePrep");
    expect(entry).toBeDefined();
    expect(entry!.available).toBe(false);
    expect(entry!.disabledReason).toBe("Allocate your stats before training Debate.");

    // The engine error stays the authority and names the same requirement.
    const result = session.act("debatePrep");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch("Allocate your stats before training Debate");
  });

  it("keeps debatePrep available and executable once stats are allocated", () => {
    const session = new GameSession();
    session.create({
      era: "1953",
      countryId: "US",
      seed: "first-turn-statted",
      playerName: "Alex",
      creation: ownerCreation(),
    });

    const entry = session.view().actions.find((action) => action.id === "debatePrep");
    expect(entry).toMatchObject({ available: true });
    expect(entry!.disabledReason).toBeUndefined();
    // 15% breakthrough chance either way; the contract is executability.
    expect(session.act("debatePrep").ok).toBe(true);
  });

  it("keeps the debatePrep gate consistent across save/reload on both paths", () => {
    const statless = new GameSession();
    statless.create({ era: "1953", countryId: "US", seed: "first-turn-reload-statless", playerName: "Alex" });
    const statlessReloaded = new GameSession();
    statlessReloaded.load(statless.serialize(stamp));
    expect(statlessReloaded.view().actions.find((action) => action.id === "debatePrep")).toMatchObject({
      available: false,
      disabledReason: "Allocate your stats before training Debate.",
    });
    expect(statlessReloaded.act("debatePrep").ok).toBe(false);

    const statted = new GameSession();
    statted.create({
      era: "1953",
      countryId: "US",
      seed: "first-turn-reload-statted",
      playerName: "Alex",
      creation: ownerCreation(),
    });
    const stattedReloaded = new GameSession();
    stattedReloaded.load(statted.serialize(stamp));
    expect(stattedReloaded.view().actions.find((action) => action.id === "debatePrep")).toMatchObject({
      available: true,
    });
    expect(stattedReloaded.act("debatePrep").ok).toBe(true);
  });

  it("reaches a first actionable state with no silent disables on every playable creation path", () => {
    for (const era of gameChoices()) {
      for (const country of era.countries) {
        for (const mode of [undefined, "hos"] as const) {
          const session = new GameSession();
          const view = session.create({
            era: era.id,
            countryId: country.id,
            seed: `first-turn-${era.id}-${country.id}-${mode ?? "career"}`,
            playerName: "Alex",
            ...(mode ? { mode } : {}),
          });
          // No silent disables: every unavailable action names its blocker.
          for (const action of view.actions) {
            expect(
              action.available || action.disabledReason !== undefined,
              `${era.id}/${country.id}/${mode ?? "career"}: ${action.id} disabled without a reason`,
            ).toBe(true);
          }
          // First actionable state: at least one action is actually reachable.
          expect(
            view.actions.some((action) => action.available),
            `${era.id}/${country.id}/${mode ?? "career"}: zero available actions at Turn 0`,
          ).toBe(true);
        }
        // Spectator boundary: worldsim offers no character actions, and the
        // refusal is explicit rather than a silent empty hub.
        const spectator = new GameSession();
        const spectatorView = spectator.create({
          era: era.id,
          countryId: country.id,
          seed: `first-turn-${era.id}-${country.id}-worldsim`,
          playerName: "Alex",
          mode: "worldsim",
        });
        expect(spectatorView.actions).toHaveLength(0);
        const refused = spectator.act("fundraise");
        expect(refused.ok).toBe(false);
        if (!refused.ok) expect(refused.error).toMatch("spectator");
      }
    }
  });
});
