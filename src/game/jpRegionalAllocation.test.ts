import { describe, expect, it } from "vitest";
import { createWorld, deserializeSave, projectSaveToV42, serializeSave } from "@ahdclient/engine";
import { GameSession } from "./session";

const SAVED_AT = "2026-10-03T00:00:00.000Z";
const IDS = ["HOK", "TOH", "KAN", "CHU", "KNS", "CGK", "SHI", "KYU"] as const;

function recordedJapaneseOfficeSave(): string {
  const world = createWorld({ seed: "jp-regional-allocation-recorded", playerName: "Aki", countryId: "US", era: "2019" });
  // This recorded consumer fixture isolates an eligible office continuation.
  // It is not an authentic historical Native writer or an earned appointment.
  // New JP character creation stays unavailable.
  world.player.countryId = "JP";
  world.player.homeRegionId = "HOK";
  world.cabinetMembers.push({
    countryId: "JP",
    positionId: "JP_internal_affairs_minister",
    characterId: "player",
    characterName: "Aki",
    partyId: null,
    appointedBy: null,
    appointedAtTurn: world.meta.turn,
    confirmedAtTurn: world.meta.turn,
  });
  return serializeSave(world, SAVED_AT);
}

describe("Japan regional grant allocation on recorded office saves", () => {
  it("uses the cabinet command, persists the reviewed shares, and applies them next turn", () => {
    const session = new GameSession();
    session.load(recordedJapaneseOfficeSave());
    const shares = { HOK: 30, TOH: 0, KAN: 7.5, CHU: 12.5, KNS: 12.5, CGK: 12.5, SHI: 12.5, KYU: 12.5 };

    const saved = session.setJPRegionalAllocation({ allocationPercents: shares });
    expect(saved.result).toEqual({ ok: true });
    expect(session.cabinetOffice().jpRegionalAllocation).toMatchObject({ canEdit: true, percentages: shares });
    expect(session.setJPRegionalAllocation({ allocationPercents: shares }).result).toMatchObject({ ok: false, error: expect.stringContaining("once per turn") });

    const savedContents = session.serialize(SAVED_AT);
    expect(projectSaveToV42(savedContents)).toMatchObject({
      ok: false,
      error: expect.stringContaining("source 48-turn election clock"),
    });
    // A recorded document without the modern clock isolates the additional
    // allocation refusal. The complete modern save remains intact for reload.
    const legacyClockDocument = JSON.parse(savedContents);
    delete legacyClockDocument.world.meta.startingYear;
    expect(projectSaveToV42(JSON.stringify(legacyClockDocument))).toMatchObject({
      ok: false,
      error: expect.stringContaining("Japan regional allocation state cannot be projected"),
    });
    const reloaded = new GameSession();
    reloaded.load(savedContents);
    expect(reloaded.cabinetOffice().jpRegionalAllocation).toMatchObject({ canEdit: true, percentages: shares });
    const nextTurn = reloaded.advance();
    const savedWorld = deserializeSave(reloaded.serialize(SAVED_AT));
    const jpBudgets = Object.values(savedWorld.regionalBudgets).filter((row) => row.countryId === "JP");
    expect(nextTurn.turn).toBe(savedWorld.meta.turn);
    expect(jpBudgets).toHaveLength(8);
    expect(savedWorld.regionalBudgets.HOK?.revenue.grant).toBeGreaterThan(0);
    expect(savedWorld.regionalBudgets.HOK?.revenue.grant).toBeGreaterThan(savedWorld.regionalBudgets.TOH?.revenue.grant ?? 0);
    expect(IDS.every((id) => jpBudgets.some((row) => row.regionId === id))).toBe(true);
  });
});
