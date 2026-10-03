import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

const savedAt = "2026-10-03T12:00:00.000Z";
const options = { era: "1953", countryId: "US", seed: "save-metadata-envelope", playerName: "Morgan" };

describe("serialized save envelope", () => {
  it("carries metadata for the exact unchanged bytes across save, reload, and continuation", () => {
    const session = new GameSession();
    session.create(options);
    const before = session.serialize(savedAt);
    const raw = session.serialize(savedAt, true);
    const envelope = session.serializeWithMetadata(savedAt, true);
    const parsed = JSON.parse(raw);

    expect(envelope.contents).toBe(raw);
    expect(session.serialize(savedAt)).toBe(before);
    expect(envelope.metadata).toEqual({
      savedAt: parsed.savedAt,
      schemaVersion: parsed.schemaVersion,
      turn: parsed.world.meta.turn,
      countryId: parsed.world.player.countryId,
      playerName: parsed.world.player.name,
    });

    const resumed = new GameSession();
    resumed.load(envelope.contents);
    expect(resumed.serialize(savedAt)).toBe(raw);

    const twin = new GameSession();
    twin.load(raw);
    const resumedView = resumed.advance();
    const twinView = twin.advance();
    expect(resumedView).toEqual(twinView);
    expect(resumed.serialize(savedAt)).toBe(twin.serialize(savedAt));
  });
});
