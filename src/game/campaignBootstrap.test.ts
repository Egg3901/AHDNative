import { describe, expect, it } from "vitest";
import { GameSession, gameChoices } from "./session";

/**
 * Campaign bootstrap from actual new-character creation (#447 follow-up).
 *
 * The owner path: create a character, enter Turn 0, open Actions. The prior
 * donor-level fix seeded donorBaseLevel 1 but left creation campaign funds at
 * $0, while the authoritative AHDGame creation contract endows every new
 * character (wealth touches personal cash only):
 * - gameConfig seed (seeds/reference/gameConfig.ts, admin/config/init):
 *   startingFunds 250_000, startingActions 25, startingDonorBaseLevel 1.
 * - character route: funds = gameConfig.startingFunds flat; donor level is
 *   max(configured, MIN_STARTING_DONOR_BASE_LEVEL = 1).
 * - actions gate: fundraise requires a nonzero donor level; buildDonorBase
 *   costs real campaign funds ($3K + $1.5K/level before scaling).
 */

const stamp = "2026-09-17T00:00:00.000Z";

function zeroFundsThroughSave(session: GameSession): GameSession {
  const raw = JSON.parse(session.serialize(stamp)) as { world: { player: { funds: number } } };
  raw.world.player.funds = 0;
  const broke = new GameSession();
  broke.load(JSON.stringify(raw));
  return broke;
}

describe("campaign bootstrap from new-character creation (#447)", () => {
  it("seeds the reference starting endowment on every supported career path", () => {
    for (const era of gameChoices()) {
      for (const country of era.countries) {
        const session = new GameSession();
        const view = session.create({
          era: era.id,
          countryId: country.id,
          seed: `bootstrap-${era.id}-${country.id}`,
          playerName: "Alex",
        });
        expect(view.player.funds).toBe(250_000);
        expect(view.player.actions).toBe(25);
        expect(session.profile()).toMatchObject({ finances: { donorBaseLevel: 1 } });
      }
    }
  });

  it("keeps fundraise visible, enabled and executable at $0 CF with consistent accounting", () => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "bootstrap-owner-path", playerName: "Alex" });

    // The exact owner state: a $0-CF Turn 0 save through the public save string.
    const broke = zeroFundsThroughSave(session);
    expect(broke.view().player.funds).toBe(0);

    const entry = broke.view().actions.find((action) => action.id === "fundraise");
    expect(entry).toBeDefined();
    expect(entry!.available).toBe(true);
    expect(entry!.disabledReason).toBeUndefined();
    const quote = entry!.fundsGain ?? 0;
    expect(quote).toBeGreaterThan(0);

    const before = broke.view().player;
    expect(broke.act("fundraise").ok).toBe(true);
    const after = broke.view().player;
    expect(after.funds - before.funds).toBe(quote);
    expect(before.actions - after.actions).toBe(entry!.cost);

    // The bootstrap survives save/reload and stays executable afterwards.
    const loaded = new GameSession();
    loaded.load(broke.serialize(stamp));
    expect(loaded.view().actions.find((action) => action.id === "fundraise")).toMatchObject({ available: true });
    expect(loaded.act("fundraise").ok).toBe(true);
  });

  it("leaves no supported creation path deadlocked on campaign funds", () => {
    for (const era of gameChoices()) {
      for (const country of era.countries) {
        // Career: even at $0 CF, fundraise stays reachable and executable.
        const career = new GameSession();
        career.create({
          era: era.id,
          countryId: country.id,
          seed: `bootstrap-deadlock-${era.id}-${country.id}`,
          playerName: "Alex",
        });
        const broke = zeroFundsThroughSave(career);
        expect(broke.view().actions.find((action) => action.id === "fundraise")).toMatchObject({ available: true });
        expect(broke.act("fundraise").ok).toBe(true);

        // Head of State: the hub carries no fundraising actions and no hub
        // action spends campaign funds, so there is nothing to lock out.
        const hos = new GameSession();
        const hosView = hos.create({
          era: era.id,
          countryId: country.id,
          seed: `bootstrap-hos-${era.id}-${country.id}`,
          playerName: "Alex",
          mode: "hos",
        });
        expect(hosView.actions.some((action) => action.id === "fundraise")).toBe(false);
        for (const action of hosView.actions) expect(action.fundCost).toBe(0);
      }
    }
  });
});
