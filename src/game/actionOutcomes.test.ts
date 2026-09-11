import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

const options = { era: "1953", countryId: "US", seed: "action-outcomes", playerName: "Alex" };
const savedAt = "2026-09-11T00:00:00.000Z";

describe("action outcomes through the session boundary", () => {
  it("returns changed resources, influence, target and follow-up effects", () => {
    const session = new GameSession();
    const before = session.create(options);
    const region = before.regions[0];
    expect(session.act("convertCash", { amount: 10_000 }).ok).toBe(true);
    expect(session.act("buildDonorBase").ok).toBe(true);
    expect(session.act("fundraise").ok).toBe(true);
    expect(session.act("fundraise").ok).toBe(true);
    const result = session.act("campaign", { regionId: region.id });
    expect(result).toMatchObject({
      ok: true,
      outcome: {
        actionId: "campaign",
        target: { kind: "region", id: region.id, label: region.name },
      },
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.outcome.changes.map((change) => change.field)).toEqual(
      expect.arrayContaining(["actions", "funds", "politicalInfluence"]),
    );
    expect(result.outcome.followUps).toEqual(expect.arrayContaining([expect.stringMatching(/available again|no cooldown/i)]));
  });

  it("persists actionable result history across turns and save reload", () => {
    const session = new GameSession(); session.create(options);
    expect(session.act("convertCash", { amount: 10_000 }).ok).toBe(true);
    const result = session.act("buildDonorBase");
    expect(result.ok).toBe(true);
    expect(session.view().actionHistory?.[0]).toMatchObject({ actionId: "buildDonorBase", turn: 0,
      destination: { route: "portfolio" } });
    session.advance();
    const loaded = new GameSession(); loaded.load(session.serialize(savedAt));
    expect(loaded.view().actionHistory?.[0]).toMatchObject({ actionId: "buildDonorBase", turn: 0,
      changes: expect.arrayContaining([expect.objectContaining({ field: "donorBaseLevel" })]) });
  });

  it("returns prerequisite failures without partial spend or history", () => {
    const session = new GameSession(); session.create(options);
    const before = session.view();
    const failed = session.act("campaign", {});
    expect(failed).toMatchObject({ ok: false });
    expect(session.view().player).toEqual(before.player);
    expect(session.view().actionHistory).toEqual([]);
  });
});
