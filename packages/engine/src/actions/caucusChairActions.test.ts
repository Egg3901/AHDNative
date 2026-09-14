import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { executeAction } from "./execute.js";
import { CAUCUS_TAX_MAX } from "../caucus.js";

const SAVED_AT = "2026-09-14T00:00:00.000Z";
const OPTIONS = { era: "1953", countryId: "US", seed: "caucus-chair-actions-v1", playerName: "Ada" } as const;

/**
 * A funded party member with one caucus they chair, through the public
 * createCaucus action. Mirrors the reference founding flow so chair identity
 * comes from the same path a player uses.
 */
function chairedCaucus(taxRate = 2) {
  const world = createWorld({ ...OPTIONS });
  world.player.partyId = "US_DEM";
  world.player.funds = 100_000;
  world.player.actions = 20;
  const created = executeAction(world, "player", "createCaucus", { caucusName: "Blue Dog Caucus", caucusTaxRate: taxRate });
  expect(created.ok).toBe(true);
  const caucusId = world.caucuses[0]!.id;
  return { world, caucusId };
}

describe("setCaucusTaxRate through the public action (#60)", () => {
  it("lets the chair change the rate with no AP or fund charge and keeps it across save/reload", () => {
    const { world, caucusId } = chairedCaucus(2);
    const fundsBefore = world.player.funds;
    const actionsBefore = world.player.actions;

    const result = executeAction(world, "player", "setCaucusTaxRate", { caucusId, caucusTaxRate: 4.5 });
    expect(result.ok).toBe(true);
    expect(world.caucuses[0]!.taxRate).toBe(4.5);
    // The reference PATCH route charges neither action points nor funds.
    expect(world.player.actions).toBe(actionsBefore);
    expect(world.player.funds).toBe(fundsBefore);

    const revived = deserializeSave(serializeSave(world, SAVED_AT));
    expect(revived.caucuses[0]!.taxRate).toBe(4.5);
  });

  it.each([-1, CAUCUS_TAX_MAX + 1, NaN])("rejects out-of-range tax %s without changing the save", (tax) => {
    const { world, caucusId } = chairedCaucus(2);
    const before = serializeSave(world, SAVED_AT);
    const result = executeAction(world, "player", "setCaucusTaxRate", { caucusId, caucusTaxRate: tax });
    expect(result.ok).toBe(false);
    expect(serializeSave(world, SAVED_AT)).toBe(before);
  });

  it("rejects a non-chair member and an unknown caucus", () => {
    const { world, caucusId } = chairedCaucus(2);
    // Leaving vacates the chair, so the same player is no longer the chair.
    expect(executeAction(world, "player", "leaveCaucus", {}).ok).toBe(true);
    const notChair = executeAction(world, "player", "setCaucusTaxRate", { caucusId, caucusTaxRate: 3 });
    expect(notChair.ok).toBe(false);
    expect(notChair.ok ? "" : notChair.error).toMatch(/chair/i);
    const missing = executeAction(world, "player", "setCaucusTaxRate", { caucusId: "caucus-nope", caucusTaxRate: 3 });
    expect(missing.ok).toBe(false);
  });

  it("charges nothing on rejection and requires caucusId plus caucusTaxRate", () => {
    const { world, caucusId } = chairedCaucus(2);
    expect(executeAction(world, "player", "setCaucusTaxRate", { caucusTaxRate: 3 }).ok).toBe(false);
    const before = serializeSave(world, SAVED_AT);
    // caucusTaxRate absent must not fall through to 0.
    expect(executeAction(world, "player", "setCaucusTaxRate", { caucusId }).ok).toBe(false);
    expect(serializeSave(world, SAVED_AT)).toBe(before);
  });
});

describe("disbandCaucus through the public action (#60)", () => {
  it("soft-disbands for the chair, clears membership and stays disbanded across save/reload and a turn", () => {
    const { world, caucusId } = chairedCaucus(3);
    const fundsBefore = world.player.funds;
    const actionsBefore = world.player.actions;

    const result = executeAction(world, "player", "disbandCaucus", { caucusId });
    expect(result.ok).toBe(true);
    const caucus = world.caucuses.find((c) => c.id === caucusId)!;
    expect(caucus.disbandedAt).not.toBeNull();
    expect(caucus.memberIds).toEqual([]);
    expect(world.player.caucusId).toBeNull();
    // Reference DELETE charges neither AP nor funds.
    expect(world.player.actions).toBe(actionsBefore);
    expect(world.player.funds).toBe(fundsBefore);

    // Disbanded caucuses are excluded from the tax phase on later turns.
    const treasuryAfterDisband = caucus.treasury;
    advanceTurn(world);
    expect(caucus.treasury).toBe(treasuryAfterDisband);

    const revived = deserializeSave(serializeSave(world, SAVED_AT));
    expect(revived.caucuses.find((c) => c.id === caucusId)!.disbandedAt).not.toBeNull();
    expect(revived.player.caucusId).toBeNull();
  });

  it("rejects a non-chair and leaves the caucus intact", () => {
    const { world, caucusId } = chairedCaucus(2);
    expect(executeAction(world, "player", "leaveCaucus", {}).ok).toBe(true);
    const before = serializeSave(world, SAVED_AT);
    const result = executeAction(world, "player", "disbandCaucus", { caucusId });
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toMatch(/chair/i);
    expect(serializeSave(world, SAVED_AT)).toBe(before);
    expect(world.caucuses.find((c) => c.id === caucusId)!.disbandedAt).toBeNull();
  });

  it("requires a caucusId", () => {
    const { world } = chairedCaucus(2);
    const before = serializeSave(world, SAVED_AT);
    expect(executeAction(world, "player", "disbandCaucus", {}).ok).toBe(false);
    expect(serializeSave(world, SAVED_AT)).toBe(before);
  });
});
