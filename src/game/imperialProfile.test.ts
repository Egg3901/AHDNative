import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

const setup = { era: "1953", countryId: "UK", seed: "native-imperial-gate", playerName: "Alex" } as const;
const stamp = "2026-09-15T00:00:00.000Z";

const imperialRecord = {
  id: "IMP-1",
  sequentialId: 7,
  name: "George",
  countryId: "UK",
  gender: "male",
  royalHouse: "Windsor",
  homeState: "London",
  bio: "Ceremonial head of state.",
};

/** An imperial save is an ordinary serialized save carrying the persisted marker and record. */
function imperialSaveText(session: GameSession): string {
  const parsed = JSON.parse(session.serialize(stamp)) as {
    world: Record<string, unknown>;
  };
  const world = parsed.world;
  const player = world["player"] as Record<string, unknown>;
  player["activeCharacterType"] = "imperial";
  player["activeImperialCharacterId"] = "IMP-1";
  world["imperialCharacters"] = { "IMP-1": imperialRecord };
  return JSON.stringify(parsed);
}

describe("imperial profile gate at the session boundary (#54)", () => {
  it("keeps the ordinary profile as the default for non-imperial saves", () => {
    const session = new GameSession();
    session.create({ ...setup });
    expect(session.profileDestination()).toBe("profile");
    expect(session.imperialProfile()).toBeNull();
  });

  it("stays ordinary when the marker is set but no record resolves", () => {
    const session = new GameSession();
    session.create({ ...setup });
    const parsed = JSON.parse(session.serialize(stamp)) as {
      world: Record<string, unknown>;
    };
    (parsed.world["player"] as Record<string, unknown>)["activeCharacterType"] = "imperial";
    (parsed.world["player"] as Record<string, unknown>)["activeImperialCharacterId"] = "IMP-1";
    const loaded = new GameSession();
    loaded.load(JSON.stringify(parsed));
    expect(loaded.profileDestination()).toBe("profile");
    expect(loaded.imperialProfile()).toBeNull();
  });

  it("stays ordinary when a record exists but the marker is absent", () => {
    const session = new GameSession();
    session.create({ ...setup });
    const parsed = JSON.parse(session.serialize(stamp)) as {
      world: Record<string, unknown>;
    };
    parsed.world["imperialCharacters"] = { "IMP-1": imperialRecord };
    const loaded = new GameSession();
    loaded.load(JSON.stringify(parsed));
    expect(loaded.profileDestination()).toBe("profile");
    expect(loaded.imperialProfile()).toBeNull();
  });

  it("projects the persisted imperial identity only when marker and record resolve", () => {
    const session = new GameSession();
    session.create({ ...setup });
    const loaded = new GameSession();
    loaded.load(imperialSaveText(session));
    expect(loaded.profileDestination()).toBe("imperial");
    expect(loaded.imperialProfile()).toMatchObject({
      id: "IMP-1",
      sequentialId: 7,
      name: "George",
      fullName: "King George",
      title: "King",
      royalHouse: "Windsor",
      country: { id: "UK" },
    });
  });

  it("survives save, close and relaunch without claiming admin creation", () => {
    const session = new GameSession();
    session.create({ ...setup });
    const reloaded = new GameSession();
    reloaded.load(imperialSaveText(session));
    const closed = new GameSession();
    closed.load(reloaded.serialize(stamp));
    expect(closed.profileDestination()).toBe("imperial");
    const imperial = closed.imperialProfile();
    expect(imperial?.fullName).toBe("King George");
    expect(imperial?.notice).toMatch(/administrator/i);
    expect(closed.profile().name).toBe("Alex");
  });

  it("keeps ordinary saves ordinary through save, close and relaunch", () => {
    const session = new GameSession();
    session.create({ ...setup });
    const reloaded = new GameSession();
    reloaded.load(session.serialize(stamp));
    expect(reloaded.profileDestination()).toBe("profile");
    expect(reloaded.imperialProfile()).toBeNull();
  });
});
