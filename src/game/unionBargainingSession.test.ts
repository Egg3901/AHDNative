import { describe, expect, it } from "vitest";
import { corporateSectorAssets, createWorld, deserializeSave, serializeSave } from "@ahdclient/engine";
import { GameSession } from "./session";

const SAVED_AT = "2026-09-15T00:00:00.000Z";
const OPTIONS = { era: "1953", countryId: "US", seed: "union-bargaining-session", playerName: "Alex" } as const;
const TERMS = { wageLevel: 1.1, agreementDurationTurns: 48, noStrikeTurns: 24 };

describe("#322 bargaining through the public GameSession seam", () => {
  it("calls against represented locals, receives the turn employer response, and reloads", () => {
    const world = createWorld(OPTIONS);
    const union = world.unions["US-manufacturing"]!;
    union.ownerType = "player";
    union.ownerId = "player";
    union.unionization = 70;
    for (const asset of Object.values(corporateSectorAssets(world))) {
      if (asset.representingUnionId === union.id) asset.unionization = 70;
    }
    const startingSave = serializeSave(world, SAVED_AT);
    const control = new GameSession();
    control.load(startingSave);
    const session = new GameSession();
    session.load(startingSave);

    expect(() => session.callUnionBargaining("US-media", "US-media", TERMS)).toThrow(/player-led union president/i);
    expect(() => session.callUnionBargaining(union.id, "US-media", TERMS)).toThrow(/recorded local/i);
    const campaign = session.callUnionBargaining(union.id, "US-manufacturing", TERMS);
    expect(campaign.status).toBe("negotiating");
    session.advance();
    session.advance();
    expect(session.unionBargaining().campaigns[0]?.currentOffer.proposedBy).toBe("employer");
    session.advance();
    session.moveUnionBargaining(campaign.id, "accept");
    session.advance();

    const beforeReload = session.unionBargaining();
    expect(beforeReload.campaigns[0]?.status).toBe("settled");
    const security = deserializeSave(session.serialize(SAVED_AT)).nationalMetrics.US?.["economy.workerSecurity"]?.value;
    for (let turn = 0; turn < 4; turn++) control.advance();
    expect(security).toBe(deserializeSave(control.serialize(SAVED_AT)).nationalMetrics.US?.["economy.workerSecurity"]?.value);

    const reloaded = new GameSession();
    reloaded.load(session.serialize(SAVED_AT));
    expect(reloaded.unionBargaining()).toEqual(beforeReload);
    expect(deserializeSave(reloaded.serialize(SAVED_AT)).nationalMetrics.US?.["economy.workerSecurity"]?.value)
      .toBe(security);
  });

  it("organizes recorded union strength and applies a leader's drive to the selected sector asset", () => {
    const world = createWorld(OPTIONS);
    const union = world.unions["US-manufacturing"]!;
    const asset = Object.values(corporateSectorAssets(world)).find((row) => row.representingUnionId === union.id)!;
    union.ownerType = "player";
    union.ownerId = "player";
    union.approval = 80;
    union.treasury = 50_000;
    asset.unionization = 20;
    world.player.actions = 10;
    const session = new GameSession();
    session.load(serializeSave(world, SAVED_AT));

    const drive = session.organizeUnion(union.id);
    expect(drive).toEqual({ strength: 10, organizerStrength: 10 });
    expect(session.view().player.actions).toBe(5);
    const sectorDrive = session.organizeUnionSector(union.id, asset.id);
    expect(sectorDrive).toMatchObject({ applied: true, wasRaid: false, won: true, unionization: 24, representingUnionId: union.id, treasurySpent: 8_000 });
    const reloaded = new GameSession();
    reloaded.load(session.serialize(SAVED_AT));
    expect(reloaded.unionBargaining().campaigns).toEqual([]);
    expect(reloaded.view().player.actions).toBe(4);
    const restored = deserializeSave(session.serialize(SAVED_AT));
    expect(restored.corporateSectors?.[asset.id]?.unionization).toBe(24);
    expect(restored.corporateSectors?.[asset.id]?.representingUnionId).toBe(union.id);
    expect(restored.unions[union.id]?.treasury).toBe(42_000);
    expect(restored.unionOrganizers?.[`${union.id}:player`]?.strength).toBe(10);
  });
});
