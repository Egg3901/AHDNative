/**
 * Cabinet membership projection (#510). Pins the authoritative GameView seat
 * signal through the `projectCabinetMembership` boundary: the player's
 * validated seat, or null. Provenance: AHDGame `resolveCabinetOfficeNavEntry`
 * over the unified `cabinetMembers` collection
 * (`src/lib/navigation/cabinetOfficeNavEntry.ts`, served through
 * `src/app/api/client-nav/route.ts`).
 */
import { describe, expect, it } from "vitest";
import type { WorldState } from "@ahdclient/engine";
import { projectCabinetMembership } from "./cabinetSeat";

const POSITION = "secretary_of_treasury";
const POSITION_NAME = "Secretary of the Treasury";

function world(members: unknown): WorldState {
  return {
    player: { countryId: "US" },
    cabinetMembers: members,
  } as unknown as WorldState;
}

function holder(overrides: Record<string, unknown> = {}) {
  return {
    countryId: "US",
    positionId: POSITION,
    characterId: "player",
    characterName: "Alex",
    partyId: "US_DEM",
    appointedBy: null,
    appointedAtTurn: 0,
    confirmedAtTurn: 0,
    ministerialActions: 4,
    lastMinisterialActionRefillTurn: 0,
    ...overrides,
  };
}

describe("cabinet membership projection", () => {
  it("projects null when the player holds no seat", () => {
    expect(projectCabinetMembership(world([]))).toBeNull();
  });

  it("projects the player's validated seat with the engine position name", () => {
    expect(projectCabinetMembership(world([holder()]))).toEqual({
      positionId: POSITION,
      positionName: POSITION_NAME,
    });
  });

  it("projects null for a stale position id outside the country's list", () => {
    expect(
      projectCabinetMembership(world([holder({ positionId: "minister_of_silly_walks" })])),
    ).toBeNull();
  });

  it("projects null for a country with no position list", () => {
    expect(
      projectCabinetMembership(
        { player: { countryId: "BR" }, cabinetMembers: [holder({ countryId: "BR" })] } as unknown as WorldState,
      ),
    ).toBeNull();
  });

  it("ignores seats held by others and seats in other countries", () => {
    expect(
      projectCabinetMembership(
        world([
          holder({ characterId: "npc-treasurer", characterName: "Npc Treasurer" }),
          holder({ characterId: "player", countryId: "UK", positionId: "chancellor" }),
        ]),
      ),
    ).toBeNull();
  });

  it("never infers membership from unrelated rows", () => {
    const withoutMembers = { player: { countryId: "US" } } as unknown as WorldState;
    expect(projectCabinetMembership(withoutMembers)).toBeNull();
    expect(projectCabinetMembership(world("cabinetMembers" as unknown as never))).toBeNull();
  });
});
