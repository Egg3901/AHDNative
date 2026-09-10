import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { executeAction } from "../actions/execute.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";

const HOS_OPTIONS = {
  seed: "policy-level-seed",
  playerName: "Policy Tester",
  countryId: "US",
  era: "1953",
  mode: "hos" as const,
};

describe("program law policy levels", () => {
  it("sponsors the exact selected catalog option and records its source direction ladder", () => {
    const world = createWorld(HOS_OPTIONS);

    const result = executeAction(world, "player", "sponsorBill", {
      catalogId: "us.economy.workerSecurity.primary",
      policyOptionId: "l3",
    });

    expect(result).toEqual({ ok: true, message: expect.stringContaining("Sponsored bill") });
    expect(world.bills[0]?.provisions[0]).toMatchObject({
      policyOptionId: "l3",
      effectDirection: 1,
    });
    expect(world.bills[0]?.effectDirection).toBe(1);
  });

  it("rejects an option that is absent from the catalog without changing the world", () => {
    const world = createWorld(HOS_OPTIONS);
    const before = structuredClone(world);

    const result = executeAction(world, "player", "sponsorBill", {
      catalogId: "us.economy.workerSecurity.primary",
      policyOptionId: "l5",
    });

    expect(result).toEqual({ ok: false, error: "Unknown policy option l5 for us.economy.workerSecurity.primary" });
    expect(world).toEqual(before);
  });

  it("rejects program option ids for tax sliders without changing the world", () => {
    const world = createWorld(HOS_OPTIONS);
    const before = structuredClone(world);

    const result = executeAction(world, "player", "sponsorBill", {
      catalogId: "us.tax.incomeTax",
      policyOptionId: "l3",
    });

    expect(result).toEqual({
      ok: false,
      error: "policyOptionId is only valid for catalog laws with discrete levels",
    });
    expect(world).toEqual(before);
  });

  it("rejects a valid option when the catalog law belongs to another sponsor country", () => {
    const world = createWorld(HOS_OPTIONS);
    const before = structuredClone(world);

    const result = executeAction(world, "player", "sponsorBill", {
      catalogId: "uk.economy.workerSecurity.primary",
      sponsorCountryId: "US",
      policyOptionId: "l3",
    });

    expect(result).toEqual({
      ok: false,
      error: "Catalog entry uk.economy.workerSecurity.primary belongs to UK, not US",
    });
    expect(world).toEqual(before);
  });

  it("keeps the existing default sponsorship shape when no level is selected", () => {
    const world = createWorld(HOS_OPTIONS);

    const result = executeAction(world, "player", "sponsorBill", {
      catalogId: "us.economy.workerSecurity.primary",
    });

    expect(result.ok).toBe(true);
    expect(world.bills[0]?.provisions[0]).not.toHaveProperty("policyOptionId");
    expect(world.bills[0]?.provisions[0]?.effectDirection).toBe(1);
    expect(world.bills[0]?.effectDirection).toBe(1);
  });

  it("maps each source-generated option id to its authored direction", () => {
    const expectedDirections = [-1, -1, 0, 1, 1];
    for (let index = 0; index < expectedDirections.length; index++) {
      const world = createWorld({ ...HOS_OPTIONS, seed: `policy-level-${index}` });
      const result = executeAction(world, "player", "sponsorBill", {
        catalogId: "us.economy.workerSecurity.primary",
        policyOptionId: `l${index}`,
      });

      expect(result.ok).toBe(true);
      expect(world.bills[0]?.provisions[0]?.effectDirection).toBe(expectedDirections[index]);
    }
  });

  it("carries the selected option through enactment and save reload", () => {
    const world = createWorld(HOS_OPTIONS);
    const legislature = world.legislatures.US!;
    legislature.bicameral = false;
    legislature.chambers = [legislature.chambers[0]!];

    const result = executeAction(world, "player", "sponsorBill", {
      catalogId: "us.economy.workerSecurity.primary",
      policyOptionId: "l3",
    });
    expect(result.ok).toBe(true);

    advanceTurn(world);
    const bill = world.bills[0]!;
    for (const politician of world.politicians) {
      if (politician.countryId === "US" && politician.chamberKey === bill.currentChamber) {
        bill.votes[politician.id] = "for";
      }
    }
    for (let i = 0; i < 4 && bill.status !== "signed"; i++) advanceTurn(world);

    expect(bill.status).toBe("signed");
    expect(bill.enactedLevel).toBe(3);
    expect(world.enactedLaws[0]).toMatchObject({ billId: bill.id, level: 3 });
    expect(world.policyLedger[bill.id]).toMatchObject({
      policyOptionId: "3",
      effectDirection: 1,
    });

    const restored = deserializeSave(serializeSave(world, "2026-09-10T00:00:00.000Z"));
    expect(restored.bills[0]?.provisions[0]).toMatchObject({ policyOptionId: "l3" });
    expect(restored.bills[0]?.enactedLevel).toBe(3);
    expect(restored.policyLedger[bill.id]).toMatchObject({ policyOptionId: "3", effectDirection: 1 });
    expect(restored.enactedLaws[0]).toMatchObject({ billId: bill.id, level: 3 });
  });

  it("keeps source program levels out of legacy instant effects while recording policy direction", () => {
    const enact = (policyOptionId: "l2" | "l3") => {
      const world = createWorld(HOS_OPTIONS);
      const legislature = world.legislatures.US!;
      legislature.bicameral = false;
      legislature.chambers = [legislature.chambers[0]!];
      const result = executeAction(world, "player", "sponsorBill", {
        catalogId: "us.economy.workerSecurity.primary",
        policyOptionId,
      });
      expect(result.ok).toBe(true);

      advanceTurn(world);
      const bill = world.bills[0]!;
      for (const politician of world.politicians) {
        if (politician.countryId === "US" && politician.chamberKey === bill.currentChamber) {
          bill.votes[politician.id] = "for";
        }
      }
      let unemploymentBeforeEnactment: number | undefined;
      let unemploymentAfterEnactment: number | undefined;
      for (let i = 0; i < 4 && bill.status !== "signed"; i++) {
        advanceTurn(world, {
          afterPhase: (phase) => {
            if (phase === "nppActionProcessing" && bill.status === "enrolled") {
              unemploymentBeforeEnactment = world.countries.US!.economy.unemploymentRate;
            }
            if (phase === "billLifecycle" && bill.status === "signed") {
              unemploymentAfterEnactment = world.countries.US!.economy.unemploymentRate;
            }
          },
        });
      }
      return {
        world,
        unemploymentBeforeEnactment,
        unemploymentAfterEnactment,
        metric: world.nationalMetrics.US?.["economy.workerSecurity"]?.value,
      };
    };

    const center = enact("l2");
    const strong = enact("l3");
    expect(center.unemploymentAfterEnactment).toBe(center.unemploymentBeforeEnactment);
    expect(strong.unemploymentAfterEnactment).toBe(strong.unemploymentBeforeEnactment);
    expect(center.metric).toBe(50);
    expect(strong.metric).toBe(50.018);
  });
});
