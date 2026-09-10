import { describe, expect, it } from "vitest";
import { createWorld, serializeSave } from "@ahdclient/engine";
import { GameSession } from "./session";

const options = { era: "1953", countryId: "US", seed: "shared-fundraise", playerName: "Alex" };
const savedAt = "2026-09-10T00:00:00.000Z";

describe("shared Fundraise through the saved game session", () => {
  it("explains the donor prerequisite before an action can be taken", () => {
    const session = new GameSession();
    session.create(options);
    const before = session.serialize(savedAt);
    expect(session.view().actions.find(action => action.id === "fundraise")).toMatchObject({
      cost: 3, available: false, disabledReason: "No donor base. Use Build Donor Network first.",
    });
    expect(session.act("fundraise").ok).toBe(false);
    expect(session.serialize(savedAt)).toBe(before);
  });

  it("quotes the credited amount and pays the same AP cost after saving and reloading", () => {
    // AHDGame's established neutral-stat L50/50% quote is 225,000 for 3 AP.
    const world = createWorld(options);
    Object.assign(world.player, { donorBaseLevel: 50, politicalInfluence: 50, actions: 10, funds: 100_000 });
    const session = new GameSession();
    session.load(serializeSave(world, savedAt));
    expect(session.view().actions.find(action => action.id === "fundraise")).toMatchObject({
      cost: 3, fundsGain: 225_000, available: true,
    });
    expect(session.act("fundraise").ok).toBe(true);
    expect(session.view().player).toMatchObject({ actions: 7, funds: 325_000 });
    const resumed = new GameSession();
    resumed.load(session.serialize(savedAt));
    expect(resumed.act("fundraise").ok).toBe(true);
    expect(resumed.view().player).toMatchObject({ actions: 4, funds: 550_000 });
  });

});
