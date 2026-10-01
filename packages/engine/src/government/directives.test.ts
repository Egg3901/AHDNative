import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { serializeSave, deserializeSave } from "../save.js";
import { rngFromSeed } from "../rng.js";
import { nppBillSponsorshipPhase } from "../npp/nppBillSponsorship.js";
import { TURN_PHASES } from "../phases/registry.js";
import {
  computeFiscalStance,
  computeGoverningAgenda,
  nppGovernmentDirectivesPhase,
  refreshIrishNpcGovernmentDirectives,
} from "./directives.js";

function formNpcGovernment(world: ReturnType<typeof createWorld>): string {
  const government = world.governments.IE!;
  const chamber = world.legislatures.IE!.chambers.find(
    (entry) => entry.key === "dail",
  )!;
  const [partyId] = Object.entries(chamber.composition.seatsByParty).sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  )[0]!;
  const pm = world.politicians.find(
    (person) =>
      person.countryId === "IE" &&
      person.chamberKey === "dail" &&
      person.partyId === partyId,
  )!;
  Object.assign(government, {
    status: "formed",
    formationType: "minority",
    governingPartyId: partyId,
    coalitionPartyIds: null,
    pmPoliticianId: pm.id,
    totalSeatsSupporting: chamber.composition.seatsByParty[partyId] ?? 0,
    majorityThreshold: Math.floor(chamber.seats / 2) + 1,
    totalSeats: chamber.seats,
    seatsByParty: { ...chamber.composition.seatsByParty },
    lostMajority: false,
    formedTurn: world.meta.turn,
    pmVacancyDeadlineTurn: null,
    confidence: 75,
  });
  pm.personality = { loyalty: 50, ambition: 50, stubbornness: 25 };
  world.parties[partyId]!.economicPosition = -5;
  world.parties[partyId]!.socialPosition = -2;
  return pm.id;
}

describe("source Ireland NPP governing directives", () => {
  it("is registered after government formation and before player PM appointments", () => {
    const phaseNames = TURN_PHASES.map((phase) => phase.name);
    expect(phaseNames.indexOf("governmentFormation")).toBeGreaterThanOrEqual(0);
    expect(phaseNames.indexOf("governmentFormation")).toBeLessThan(
      phaseNames.indexOf("nppGovernmentDirectives"),
    );
    expect(phaseNames.indexOf("nppGovernmentDirectives")).toBeLessThan(
      phaseNames.indexOf("pmAppointment"),
    );
  });

  it("matches independently executed Game agenda and fiscal stance vector", () => {
    const personality = { loyalty: 50, ambition: 50, stubbornness: 25 };
    const agenda = computeGoverningAgenda({
      conditions: {
        inflationRate: 8,
        weakDomains: { employment: 0.5 },
        strongDomains: {},
      },
      ideology: { economic: -5, social: -2 },
      personality,
      currentTurn: 40,
    });
    expect(agenda).toEqual({
      items: [
        {
          domain: "income_inequality",
          target: 65,
          direction: "raise",
          priority: 1,
        },
        { domain: "poverty", target: 65, direction: "raise", priority: 1 },
        { domain: "healthcare", target: 65, direction: "raise", priority: 0.8 },
        {
          domain: "employment",
          target: 65,
          direction: "raise",
          priority: 0.676470588235294,
        },
        { domain: "education", target: 65, direction: "raise", priority: 0.6 },
      ],
      archetype: "reformer",
      computedTurn: 40,
    });
    expect(
      computeFiscalStance({
        agenda: agenda.items,
        inflationRate: 8,
        targetInflationRate: 2,
        debtToGdpRatio: 0,
        personality,
        currentTurn: 40,
      }),
    ).toEqual({
      stance: "expansionary",
      direction: -1,
      intensity: 0.25,
      computedTurn: 40,
    });
  });

  it("matches source mandate, debt, crisis, and empty-agenda vectors", () => {
    const agenda = computeGoverningAgenda({
      conditions: {
        inflationRate: 8,
        weakDomains: { tax: 0.2, employment: 0.4 },
        strongDomains: { education: 0.5 },
      },
      ideology: { economic: 4, social: 3 },
      personality: { loyalty: 50, ambition: 25, stubbornness: 75 },
      mandate: { employment: -0.3, health: 0.8 },
      debtToGdpRatio: 1.1,
      crises: { health: 0.75 },
      currentTurn: 212,
    });
    expect(agenda).toEqual({
      items: [
        {
          domain: "health",
          target: 65,
          direction: "raise",
          priority: 1,
          crisis: true,
        },
        {
          domain: "employment",
          target: 65,
          direction: "raise",
          priority: 0.6533192834562697,
        },
        {
          domain: "economic_growth",
          target: 65,
          direction: "raise",
          priority: 0.5057955742887249,
        },
      ],
      archetype: "steward",
      computedTurn: 212,
    });
    expect(
      computeFiscalStance({
        agenda: agenda.items,
        inflationRate: 8,
        targetInflationRate: 2,
        debtToGdpRatio: 1.1,
        personality: { loyalty: 50, ambition: 25, stubbornness: 75 },
        currentTurn: 212,
      }),
    ).toEqual({
      stance: "austere",
      direction: 1,
      intensity: 1,
      computedTurn: 212,
    });

    expect(
      computeGoverningAgenda({
        conditions: { inflationRate: 2, weakDomains: {}, strongDomains: {} },
        ideology: { economic: 0, social: 0 },
        personality: { loyalty: 50, ambition: 10, stubbornness: 10 },
        currentTurn: 11,
      }),
    ).toEqual({ items: [], archetype: "technocrat", computedTurn: 11 });
  });

  it("persists only for a formed NPC head, consumes the saved fiscal direction, and resumes across save", () => {
    const world = createWorld({
      seed: "ie-directives-npc",
      playerName: "P",
      countryId: "US",
      era: "1991",
    });
    const pmId = formNpcGovernment(world);
    world.countries.IE!.economy.inflationRate = 0.08;
    world.nationalMetrics.IE = { "economic.unemploymentRate": { value: 20 } };
    nppGovernmentDirectivesPhase.run(world);
    expect(world.governments.IE).toMatchObject({
      directivesForPmId: pmId,
      governingAgenda: { archetype: "reformer", computedTurn: world.meta.turn },
      fiscalStance: { stance: "expansionary", direction: -1, intensity: 0.25 },
    });

    const restored = deserializeSave(
      serializeSave(world, "2026-10-01T00:00:00.000Z"),
    );
    expect(restored.governments.IE).toEqual(world.governments.IE);
    restored.meta.turn = 1;
    for (
      let i = 0;
      i < 10 &&
      !restored.bills.some(
        (bill) => bill.countryId === "IE" && bill.nppSponsored,
      );
      i += 1
    ) {
      nppBillSponsorshipPhase.run(restored, rngFromSeed("ie-directives-npc"));
      if (
        !restored.bills.some(
          (bill) => bill.countryId === "IE" && bill.nppSponsored,
        )
      )
        restored.meta.turn += 1;
    }
    const bill = restored.bills.find(
      (item) => item.countryId === "IE" && item.nppSponsored,
    );
    expect(bill).toMatchObject({
      legislationTypeId: "ie_vat_rate",
      selectedRate: 0,
      provisions: [
        expect.objectContaining({
          policyOptionId: "ie_vat_rate_opt_0",
          effectDirection: -1,
        }),
      ],
    });
  });

  it("does not synthesize or retain directives for a pending or player-headed government", () => {
    const world = createWorld({
      seed: "ie-directives-gates",
      playerName: "P",
      countryId: "IE",
      era: "2019",
    });
    expect(refreshIrishNpcGovernmentDirectives(world)).toBe(false);
    expect(world.governments.IE?.governingAgenda).toBeUndefined();
    const pmId = formNpcGovernment(world);
    expect(refreshIrishNpcGovernmentDirectives(world)).toBe(true);
    world.governments.IE!.pmPoliticianId = "player";
    expect(refreshIrishNpcGovernmentDirectives(world)).toBe(false);
    expect(world.governments.IE?.governingAgenda).toBeUndefined();
    expect(world.governments.IE?.directivesForPmId).toBeUndefined();
    expect(world.politicians.some((person) => person.id === pmId)).toBe(true);
  });

  it("rejects malformed persisted directive scalars and authority on reload", () => {
    const world = createWorld({
      seed: "ie-directives-validation",
      playerName: "P",
      countryId: "US",
      era: "1991",
    });
    formNpcGovernment(world);
    expect(refreshIrishNpcGovernmentDirectives(world)).toBe(true);
    const validSave = JSON.parse(
      serializeSave(world, "2026-10-01T00:00:00.000Z"),
    ) as Record<string, any>;
    validSave.world.governments.IE.fiscalStance.intensity = 1.01;
    expect(() => deserializeSave(JSON.stringify(validSave))).toThrow(
      /invalid fiscal stance/i,
    );

    const wrongAuthority = JSON.parse(
      serializeSave(world, "2026-10-01T00:00:00.000Z"),
    ) as Record<string, any>;
    wrongAuthority.world.governments.IE.pmPoliticianId = "player";
    expect(() => deserializeSave(JSON.stringify(wrongAuthority))).toThrow(
      /invalid NPC government directive authority/i,
    );
  });

  it("source pending-government freeze prevents NPP sponsorship before directives exist", () => {
    const world = createWorld({
      seed: "ie-directives-pending",
      playerName: "P",
      countryId: "US",
      era: "1991",
    });
    world.countries.IE!.economy.inflationRate = 0.08;
    world.meta.turn = 1;
    nppBillSponsorshipPhase.run(world, rngFromSeed("ie-directives-pending"));
    expect(
      world.bills.filter(
        (bill) => bill.countryId === "IE" && bill.nppSponsored,
      ),
    ).toEqual([]);
  });
});
