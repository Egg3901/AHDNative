import type { WorldState } from "@ahdclient/engine";
import type { ProfileView } from "./profileTypes";
import { findUkConstituency, getConstituenciesForUkRegion } from "./ukWestminster2024";

interface ResolvedConstituencyOffice {
  officeType: "commons" | "primeMinister";
  regionId: string;
}

/** One eligibility source for both Profile projection and the write command. */
function resolveConstituencyOffice(world: WorldState): ResolvedConstituencyOffice | null {
  const player = world.player;
  const commonsSeat = player.legislativeSeat?.countryId === "UK"
    && player.legislativeSeat.chamberKey === "commons"
    ? player.legislativeSeat
    : null;
  const primeMinisterOffice = player.currentOffice?.countryId === "UK"
    && player.currentOffice.type === "primeMinister"
    ? player.currentOffice
    : null;
  const office = primeMinisterOffice ?? commonsSeat;
  const regionId = office?.regionId
    ?? (primeMinisterOffice ? player.homeRegionId : null);
  if (!office || !regionId || world.regions[regionId]?.countryId !== "UK") return null;
  return { officeType: primeMinisterOffice ? "primeMinister" : "commons", regionId };
}

export function projectProfileConstituency(world: WorldState): ProfileView["constituency"] {
  const resolved = resolveConstituencyOffice(world);
  if (!resolved) {
    return {
      eligible: false,
      officeType: null,
      regionId: null,
      selected: null,
      options: [],
      unavailableReason: world.player.countryId === "UK"
        ? "Constituency selection is available after election to the Commons."
        : "Constituency selection is available only to sitting UK Commons members and Prime Ministers.",
    };
  }
  const { officeType, regionId } = resolved;
  const saved = world.player.constituency?.regionId === regionId
    ? world.player.constituency
    : null;
  return {
    eligible: true,
    officeType,
    regionId,
    selected: saved
      ? { id: saved.id, name: saved.name }
      : null,
    options: getConstituenciesForUkRegion(regionId),
    unavailableReason: null,
  };
}

export function applyProfileConstituency(world: WorldState, constituencyId: string): void {
  const resolved = resolveConstituencyOffice(world);
  if (!resolved) {
    throw new Error("Only sitting UK Commons members and Prime Ministers can choose a constituency.");
  }
  const constituency = findUkConstituency(resolved.regionId, constituencyId.trim());
  if (!constituency) throw new Error("That constituency is not in your current UK region.");
  const represented = world.politicians.some((politician) =>
    politician.countryId === "UK"
    && politician.chamberKey === "commons"
    && politician.constituencyId === constituency.id
  );
  if (represented) {
    throw new Error(`${constituency.name} is already represented by another player.`);
  }
  world.player.constituency = {
    id: constituency.id,
    name: constituency.name,
    regionId: resolved.regionId,
  };
}
