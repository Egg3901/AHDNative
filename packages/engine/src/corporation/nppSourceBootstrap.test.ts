import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { getPackByEra } from "@ahdclient/content";
import { deserializeSave, serializeSave } from "../save.js";
import { getRateForCountry } from "../forex/conversion.js";
import { getEraNominalScale } from "../commodity/constants.js";
import { SOURCE_NPP_HQ_MARKET_SEED } from "./sourceNppHqMarketSeed.generated.js";
import { advanceTurn } from "../engine.js";
import { chooseFoundingActor, seedSourceNppCorporations } from "./nppSourceBootstrap.js";

describe("source NPP company bootstrap", () => {
  it("uses distinct active source NPP identities and balances free candidates by affiliation then influence", () => {
    const world = createWorld({ seed: "source-npp-ceo-selection", playerName: "Tester", countryId: "US", homeRegionId: "DC", era: "1953" });
    const parties = Object.values(world.parties).filter((party) => party.countryId === "US" && party.mergedIntoPartyId == null).sort((a, b) => a.id.localeCompare(b.id));
    expect(parties.length).toBeGreaterThanOrEqual(2);
    const [partyOne, partyTwo] = parties;
    const actor = (id: string, partyId: string, influence: number, sequentialId: number) => ({
      id, countryId: "US", homeRegionId: "DC", partyId, politicalInfluence: influence, sequentialId, retiredAtTurn: null,
    });
    world.corporateNppActors = {
      "npp:owned": actor("npp:owned", partyOne!.id, 95, 1),
      "npp:party-one": actor("npp:party-one", partyOne!.id, 70, 2),
      "npp:party-two": actor("npp:party-two", partyTwo!.id, 10, 3),
    };
    const template = Object.values(world.corporations)[0]!;
    world.corporations["source-ceo-selection-existing"] = { ...structuredClone(template), id: "source-ceo-selection-existing", countryId: "US", ceoId: "npp:owned", ceoType: "npp" };

    expect(chooseFoundingActor(world, "US", "DC").id).toBe("npp:party-two");
    delete world.corporations["source-ceo-selection-existing"];
    expect(chooseFoundingActor(world, "US", "DC").id).toBe("npp:owned");
  });

  it("creates a first-class independent source actor rather than aliasing a politician", () => {
    const world = createWorld({ seed: "source-npp-fallback-actor", playerName: "Tester", countryId: "US", homeRegionId: "DC", era: "1953" });
    world.corporateNppActors = {};
    const actor = chooseFoundingActor(world, "US", "DC");
    expect(actor).toMatchObject({ countryId: "US", homeRegionId: "DC", partyId: "independent", politicalInfluence: 0, sequentialId: 1, retiredAtTurn: null, generatedForFounding: true });
    expect(world.politicians.some((person) => person.id === actor.id)).toBe(false);
    expect(Object.keys(actor)).not.toContain("politicianId");
  });

  it("seeds source Nigeria regions, parties, governors, and CEOs from each authored era roster", () => {
    for (const era of ["1953", "1979", "1991", "1999", "2007", "2019", "2023"]) {
      const world = createWorld({ seed: `source-ng-npp-${era}`, playerName: "Tester", countryId: "US", homeRegionId: "DC", era });
      if (getPackByEra(era)?.budgets?.some((budget) => budget.countryId === "NG")) {
        expect(world.budgets.NG).toBeDefined();
      } else {
        expect(world.budgets.NG).toBeUndefined();
      }
      expect(Object.values(world.regionalBudgets).some((budget) => budget.countryId === "NG")).toBe(false);
      const actors = Object.values(world.corporateNppActors ?? {}).filter((actor) => actor.countryId === "NG");
      expect(actors.filter((actor) => actor.currentOffice?.type === "governor")).toHaveLength(6);
      for (const actor of actors.filter((row) => row.currentOffice?.type === "governor")) {
        expect(world.regions[actor.homeRegionId]).toMatchObject({ countryId: "NG", population: expect.any(Number), governorNppId: actor.id, sourceGdp: { amount: expect.any(Number), currencyCode: era === "1953" ? "USD" : "NGN", unit: "millions" } });
        expect(world.parties[actor.partyId]?.countryId === "NG" || actor.partyId === "independent").toBe(true);
      }
      const ngCorporations = Object.values(world.corporations).filter((corporation) => corporation.countryId === "NG" && corporation.ceoType === "npp");
      expect(ngCorporations.length).toBeGreaterThan(0);
      expect(ngCorporations.every((corporation) => Boolean(world.corporateNppActors?.[corporation.ceoId ?? ""]))).toBe(true);
      if (era === "2023") {
        const raw = serializeSave(world, "2026-10-03T12:00:00.000Z");
        const restored = deserializeSave(raw);
        expect(restored.regions.NORTH_WEST?.governorNppId).toBe(world.regions.NORTH_WEST?.governorNppId);
        expect(restored.corporateNppActors).toEqual(world.corporateNppActors);
        const malformed = JSON.parse(raw) as { world: { regions: Record<string, { governorNppId?: string }> } };
        malformed.world.regions.NORTH_WEST!.governorNppId = "missing:npp";
        expect(() => deserializeSave(JSON.stringify(malformed))).toThrow(/invalid source governor link/);
      }
    }
  });

  it("creates a named NPP-led HQ issuer, spends its local startup pool, and preserves the writer on reload", () => {
    const world = createWorld({ seed: "source-npp-boot", playerName: "Tester", countryId: "US", homeRegionId: "DC", era: "1953" });
    seedSourceNppCorporations(world);
    const sourcePool = SOURCE_NPP_HQ_MARKET_SEED.find((row) =>
      row.era === "1953" && row.countryId === "US" && row.stateId === "DC" && row.sectorType === "manufacturing")!;
    const sourceStartingRevenueAnchor = Math.max(Math.round(sourcePool.sourceRevenueAnchor * 0.25), 1_000_000);
    const corporation = world.corporations["US-manufacturing"]!;
    const asset = Object.values(world.corporateSectors ?? {}).find((row) => row.corporationId === corporation.id)!;
    const actor = world.corporateNppActors?.[corporation.ceoId ?? ""];
    const grant = world.corporateCashLedger?.find((row) => row.corporationId === corporation.id && row.type === "corp_starting_grant");

    expect(corporation.ceoType).toBe("npp");
    expect(actor).toMatchObject({ id: corporation.ceoId, countryId: "US", homeRegionId: expect.any(String), partyId: "independent", politicalInfluence: 0, sequentialId: expect.any(Number), retiredAtTurn: null });
    expect(Object.keys(actor ?? {})).not.toContain("politicianId");
    expect(Object.keys(actor ?? {})).not.toContain("personalBalance");
    expect(corporation.shareholders).toContainEqual(expect.objectContaining({ holder: "npc", nppId: actor!.id }));
    expect(asset.stateId).toBe("DC");
    expect(Object.values(world.corporateSectors ?? {}).some((row) => row.corporationId === corporation.id && row.stateId === null)).toBe(false);
    expect(world.unownedSectors["US:DC:manufacturing"]?.revenue).toBe(Math.max(0, sourcePool.sourceRevenueAnchor - sourceStartingRevenueAnchor));
    expect(corporation.revenue).toBe(Math.round(sourceStartingRevenueAnchor * getRateForCountry(world, "US")) / 24);
    expect(corporation.liquidCapital).toBe(Math.round(2_000_000 * getEraNominalScale("1953") * getRateForCountry(world, "US")));
    expect(grant).toMatchObject({ id: `starting-grant:${corporation.id}:t1`, turn: 1, amount: corporation.liquidCapital, currencyCode: corporation.liquidCurrencyCode, meta: { source: "npp_seed" } });

    const serialized = serializeSave(world, "2026-10-03T12:00:00.000Z");
    const direct = deserializeSave(serialized);
    const restored = deserializeSave(serialized);
    expect(restored.corporateNppActors).toEqual(world.corporateNppActors);
    expect(restored.corporations[corporation.id]?.ceoId).toBe(actor!.id);
    expect(restored.corporateSectors?.[asset.id]?.stateId).toBe("DC");
    expect(restored.corporateCashLedger).toEqual(world.corporateCashLedger);
    advanceTurn(direct);
    advanceTurn(restored);
    expect(serializeSave(restored, "2026-10-10T12:00:00.000Z")).toBe(serializeSave(direct, "2026-10-10T12:00:00.000Z"));
    expect(restored.corporateNppActors?.[actor!.id]).toEqual(actor);
  });
});
