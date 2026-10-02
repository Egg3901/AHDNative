import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

const SAVE_AT = "2026-10-01T00:00:00.000Z";

function savedWorld(session: GameSession) {
  return JSON.parse(session.serialize(SAVE_AT)) as {
    world: {
      meta: { turn: number };
      player: { mode: string; countryId: string; currentOffice?: { type: string; countryId: string } };
      politicians: Array<{ id: string; countryId: string }>;
      executives: Record<string, { presidentId: string | null; termStartTurn: number | null }>;
      governments: Record<string, {
        status: string;
        pmPoliticianId: string | null;
        governingPartyId: string | null;
        formationType: string | null;
        seatsByParty: Record<string, number>;
        totalSeatsSupporting: number;
      }>;
      elections: Array<{ countryId: string; electionType: string; winners?: string[] }>;
      corporations: Record<string, { id: string; countryId: string; sectorType: string; insolventSinceTurn?: number; revenue: number; foundingRevenue: number; currentGrowthCost: number; ownershipState?: string }>;
      corporateSectors: Record<string, { id: string; corporationId: string; owner: string; revenue?: number }>;
      unownedSectors: Record<string, unknown>;
    };
  };
}

describe("source-backed singleplayer head-of-government authority", () => {
  it("seats a fresh US HoS in the canonical executive record and can use nationalization and cabinet powers", () => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "hos-authority-us", playerName: "Alex", mode: "hos", homeRegionId: "NY" });

    const initial = savedWorld(session).world;
    expect(initial.player).toMatchObject({ mode: "hos", countryId: "US", currentOffice: { type: "president", countryId: "US" } });
    expect(initial.executives.US).toMatchObject({ presidentId: "player", termStartTurn: 0 });
    expect(initial.elections.some((election) => election.countryId === "US" && election.electionType === "president" && election.winners?.includes("player"))).toBe(false);

    const nomineeId = initial.politicians.find((politician) => politician.countryId === "US")!.id;
    expect(session.view().legislature.cabinetSponsor?.available).toBe(true);
    expect(session.act("sponsorCabinetNomination", { countryId: "US", positionId: "secretary_of_state", nomineeId }).ok).toBe(true);

    const fixture = JSON.parse(session.serialize(SAVE_AT)) as ReturnType<typeof savedWorld>;
    const issuer = fixture.world.corporations["US-media"]!;
    issuer.insolventSinceTurn = fixture.world.meta.turn;
    session.load(JSON.stringify(fixture));
    expect(session.view().actions.find((action) => action.id === "nationalizeCorporation")).toMatchObject({ available: true });

    const beforeForeignTarget = session.serialize(SAVE_AT);
    expect(session.act("nationalizeCorporation", { corporationId: "UK-media", tier: "seizure" }).ok).toBe(false);
    expect(session.serialize(SAVE_AT)).toBe(beforeForeignTarget);

    const unownedKey = `${issuer.countryId}:${issuer.sectorType}`;
    const poolBefore = structuredClone(fixture.world.unownedSectors[unownedKey]);
    expect(session.act("nationalizeCorporation", { corporationId: "US-media", tier: "seizure" }).ok).toBe(true);
    const settled = savedWorld(session).world;
    expect(settled.corporations["US-media"]).toBeUndefined();
    expect(settled.corporations["NAT-US-media"]?.ownershipState).toBe("stateOwned");
    expect(Object.values(settled.corporateSectors).some((asset) => asset.corporationId === "NAT-US-media" && asset.owner === "corporation")).toBe(true);
    expect(settled.unownedSectors[unownedKey]).toEqual(poolBefore);

    const resumed = new GameSession();
    resumed.load(session.serialize(SAVE_AT));
    const afterReload = savedWorld(resumed).world;
    expect(afterReload.corporations["NAT-US-media"]?.ownershipState).toBe("stateOwned");
    expect(Object.values(afterReload.corporateSectors).some((asset) => asset.corporationId === "NAT-US-media" && asset.owner === "corporation")).toBe(true);
    expect(afterReload.unownedSectors[unownedKey]).toEqual(poolBefore);

    session.advance();
    resumed.advance();
    const afterTakingTurn = savedWorld(session).world;
    expect(afterTakingTurn.executives.US?.presidentId).toBe("player");
    expect(afterTakingTurn.corporations["NAT-US-media"]?.ownershipState).toBe("stateOwned");
    const afterReloadedTurn = savedWorld(resumed).world;
    expect(afterReloadedTurn.executives.US).toMatchObject({ presidentId: "player" });
    expect(afterReloadedTurn.corporations["NAT-US-media"]?.ownershipState).toBe("stateOwned");
    expect(Object.values(afterReloadedTurn.corporateSectors).some((asset) => asset.corporationId === "NAT-US-media" && asset.owner === "corporation")).toBe(true);
    expect(afterReloadedTurn.unownedSectors[unownedKey]).toEqual(afterTakingTurn.unownedSectors[unownedKey]);
  });

  it("seats a supported parliamentary HoS as the recorded government leader through turn and save/reload", () => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "UK", seed: "hos-authority-uk", playerName: "Alex", mode: "hos", homeRegionId: "EMI", initialization: "historical" });

    const initial = savedWorld(session).world;
    expect(initial.player).toMatchObject({ mode: "hos", countryId: "UK", currentOffice: { type: "primeMinister", countryId: "UK" } });
    expect(initial.governments.UK).toMatchObject({ status: "formed", pmPoliticianId: "player" });
    expect(initial.elections.some((election) => election.countryId === "UK" && election.winners?.includes("player"))).toBe(false);

    const fixture = JSON.parse(session.serialize(SAVE_AT)) as ReturnType<typeof savedWorld>;
    const issuer = fixture.world.corporations["UK-media"]!;
    issuer.insolventSinceTurn = fixture.world.meta.turn;
    session.load(JSON.stringify(fixture));
    expect(session.view().actions.find((action) => action.id === "nationalizeCorporation")).toMatchObject({ available: true });
    expect(session.act("nationalizeCorporation", { corporationId: "UK-media", tier: "seizure" }).ok).toBe(true);
    expect(savedWorld(session).world.corporations["UK-media"]).toBeUndefined();
    expect(savedWorld(session).world.corporations["NAT-UK-media"]?.ownershipState).toBe("stateOwned");

    session.advance();
    const afterTurn = savedWorld(session).world;
    expect(afterTurn.governments.UK).toMatchObject({ status: "formed", pmPoliticianId: "player" });

    const resumed = new GameSession();
    resumed.load(session.serialize(SAVE_AT));
    resumed.advance();
    expect(savedWorld(resumed).world.governments.UK).toMatchObject({ status: "formed", pmPoliticianId: "player" });
    expect(savedWorld(resumed).world.player).toMatchObject({ mode: "hos", countryId: "UK", currentOffice: { type: "primeMinister", countryId: "UK" } });

    const career = new GameSession();
    career.create({ era: "1953", countryId: "UK", seed: "hos-authority-career", playerName: "Alex" });
    career.advance();
    expect(savedWorld(career).world.governments.UK?.pmPoliticianId).not.toBe("player");

  });
});
