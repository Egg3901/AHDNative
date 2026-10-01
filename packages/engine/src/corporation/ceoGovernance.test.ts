import { describe, expect, it } from "vitest";
import { executeAction } from "../actions/execute.js";
import { createWorld } from "../world.js";
import { reconcileCeoAppointment } from "./ceoGovernance.js";
import { deserializeSave, serializeSave } from "../save.js";

describe("corporation CEO governance", () => {
  it("records the live shareholder weight, rejects unrelated actors, and blocks bondholders from accepting", () => {
    const world = createWorld({ era: "1953", countryId: "UK", homeRegionId: "LON", seed: "ceo-governance-51", playerName: "Alex" });
    const corp = world.corporations["UK-media"]!;
    corp.shareholders = [{ holder: "player", shares: 250 }];
    const otherActor = world.politicians[0]!.id;

    const unrelated = executeAction(world, otherActor, "voteCeo", { corpId: corp.id, candidateId: "player" });
    expect(unrelated).toMatchObject({ ok: false, error: "Only the player may manage this CEO relationship" });
    world.bonds["corp-bond"] = {
      id: "corp-bond",
      issuerType: "corporation",
      corporationId: corp.id,
      countryId: corp.countryId,
      issuerName: corp.tickerSymbol,
      faceValue: 1_000,
      couponRate: 5,
      maturityTurns: 48,
      issuedAtTurn: 0,
      maturityTurn: 48,
      marketPrice: 1,
      totalIssued: 1,
      publicFloat: 0,
      holders: [{ holderId: "player", units: 1 }],
      matured: false,
      defaulted: false,
      defaultedAtTurn: null,
      currencyCode: "USD",
      createdAt: world.meta.date,
      updatedAt: world.meta.date,
    };
    expect(executeAction(world, "player", "voteCeo", { corpId: corp.id, candidateId: "player" }).ok).toBe(true);
    expect(corp.ceoVotes).toEqual([{ voterId: "player", candidateId: "player", shares: 250 }]);
    expect(corp.pendingCeoId).toBeUndefined();
    expect(executeAction(world, "player", "acceptCeoAppointment", { corpId: corp.id })).toMatchObject({
      ok: false,
      error: "No CEO appointment is pending for you",
    });
    expect(corp.ceoId).toBeUndefined();
    delete world.bonds["corp-bond"];
    expect(executeAction(world, "player", "voteCeo", { corpId: corp.id, candidateId: "player" }).ok).toBe(true);
    expect(corp.pendingCeoId).toBe("player");
    expect(executeAction(world, "player", "acceptCeoAppointment", { corpId: corp.id }).ok).toBe(true);
    expect(corp.ceoId).toBe("player");
  });

  it("reweights opposition from the live register, protects incumbent ties, and clears stale offers", () => {
    const world = createWorld({ era: "1953", countryId: "UK", homeRegionId: "LON", seed: "ceo-governance-tally", playerName: "Alex" });
    const corp = world.corporations["UK-media"]!;
    corp.shareholders = [
      { holder: "player", shares: 50 },
      { holder: "npc", shares: 50 },
    ];
    corp.ceoType = "player";
    corp.ceoId = "player";
    corp.ceoVacant = false;
    corp.pendingCeoId = "challenger";
    corp.ceoVotes = [
      { voterId: "player", candidateId: "player", shares: 1_000 },
      { voterId: "npc", candidateId: "challenger", shares: 1 },
    ];
    expect(reconcileCeoAppointment(corp)).toBeNull();
    expect(corp.pendingCeoId).toBeUndefined();

    corp.shareholders = [{ holder: "npc", shares: 50 }];
    corp.pendingCeoId = "player";
    expect(reconcileCeoAppointment(corp)).toBe("challenger");
    expect(corp.pendingCeoId).toBe("challenger");

    corp.ceoVotes = [{ voterId: "player", candidateId: "player", shares: 50 }];
    expect(reconcileCeoAppointment(corp)).toBeNull();
    expect(corp.pendingCeoId).toBeUndefined();
  });

  it("clears a pending appointment when the shareholder sells the only recorded vote weight", () => {
    const world = createWorld({ era: "1953", countryId: "UK", homeRegionId: "LON", seed: "ceo-governance-sold", playerName: "Alex" });
    const corp = world.corporations["UK-media"]!;
    corp.shareholders = [{ holder: "player", shares: 1 }];
    corp.ceoVotes = [{ voterId: "player", candidateId: "player", shares: 1 }];
    corp.pendingCeoId = "player";
    expect(executeAction(world, "player", "sellShares", { corpId: corp.id, shares: 1 }).ok).toBe(true);
    expect(corp.shareholders.some((holder) => holder.holder === "player")).toBe(false);
    expect(corp.pendingCeoId).toBeUndefined();
  });

  it("migrates an old save only to its authored headquarters region", () => {
    const world = createWorld({ era: "1953", countryId: "UK", homeRegionId: "LON", seed: "ceo-hq-migration", playerName: "Alex" });
    const raw = JSON.parse(serializeSave(world, "2026-10-01T00:00:00.000Z"));
    raw.schemaVersion = 48;
    raw.world.meta.schemaVersion = 48;
    for (const corp of Object.values(raw.world.corporations) as Array<{ headquartersRegionId?: string }>) {
      delete corp.headquartersRegionId;
    }
    const migrated = deserializeSave(JSON.stringify(raw));
    expect(migrated.meta.schemaVersion).toBe(49);
    expect(migrated.corporations["UK-media"]?.headquartersRegionId).toBe("LON");
    expect(migrated.corporations["US-media"]?.headquartersRegionId).toBeUndefined();
  });
});
