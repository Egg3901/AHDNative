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

  it("projects campaign results through Profile, party, notifications, save/reload, and the next turn", () => {
    const session = new GameSession();
    const initial = session.create(options);
    const raw = JSON.parse(session.serialize(savedAt));
    raw.world.player.partyId = "US_DEM";
    raw.world.player.actions = 20;
    raw.world.player.funds = 100_000;
    session.load(JSON.stringify(raw));
    const beforeParty = session.politics().parties.find((party) => party.id === "US_DEM")!;
    const result = session.act("campaign", { regionId: initial.regions[0]!.id });
    expect(result).toMatchObject({ ok: true, outcome: { actionId: "campaign" } });
    expect(session.profile().standing.politicalInfluence).toBeGreaterThan(0);
    expect(session.profile().standing.partyInfluence).toBe(0);
    expect(session.politics().parties.find((party) => party.id === "US_DEM")).toEqual(beforeParty);
    expect(session.view().notifications.items[0]).toMatchObject({
      category: "standing", actionOutcome: { actionId: "campaign" },
    });
    expect(session.view().actionHistory?.[0]).toMatchObject({ actionId: "campaign" });

    const resumed = new GameSession();
    resumed.load(session.serialize(savedAt));
    expect(resumed.profile().standing.politicalInfluence).toBe(session.profile().standing.politicalInfluence);
    expect(resumed.view().notifications.items[0]).toMatchObject({ actionOutcome: { actionId: "campaign" } });
    expect(resumed.view().actionHistory?.[0]).toMatchObject({ actionId: "campaign" });
    resumed.advance();
    expect(resumed.profile().standing.partyInfluence).toBeGreaterThanOrEqual(0);
  });

  it("returns prerequisite failures without partial spend or history", () => {
    const seeded = new GameSession(); seeded.create(options);
    const envelope = JSON.parse(seeded.serialize(savedAt)) as { world: { player: { funds: number } } };
    envelope.world.player.funds = 0;
    const session = new GameSession(); session.load(JSON.stringify(envelope));
    const before = session.view();
    const failed = session.act("campaign", {});
    expect(failed).toMatchObject({ ok: false });
    expect(session.view().player).toEqual(before.player);
    expect(session.view().actionHistory).toEqual([]);
  });
});
