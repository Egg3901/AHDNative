import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { corporateSectorAssets } from "../corporation/corporateSectorAssets.js";
import { openBargainingCampaignAction, answerBargainingCampaignAsEmployer } from "./actions.js";
import { labourNudgesForTurn } from "./labourRelationsTurn.js";
import { politicalCabinetResidualPhase } from "../politicalMetrics/phases.js";
import { deserializeSave, serializeSave } from "../save.js";

const OPTIONS = { seed: "union-political-feedback", playerName: "Tester", countryId: "US", era: "1953" } as const;
const TERMS = { wageLevel: 1.1, agreementDurationTurns: 48, noStrikeTurns: 24 };

describe("#322 labor political feedback source boundary", () => {
  it("feeds a live dispute into the regional board once, without charging economic output again", () => {
    const initial = createWorld(OPTIONS);
    const union = initial.unions["US-manufacturing"]!;
    union.unionization = 70;
    for (const asset of Object.values(corporateSectorAssets(initial))) {
      if (asset.representingUnionId === union.id) asset.unionization = 70;
    }
    const treated = structuredClone(initial);
    const control = structuredClone(initial);
    const opened = openBargainingCampaignAction(treated, {
      unionId: union.id,
      employerCorporationId: "US-manufacturing",
      terms: TERMS,
      turn: 0,
    });
    answerBargainingCampaignAsEmployer(treated, { campaignId: opened.id, action: "reject", turn: 1 });
    treated.meta.turn = 2;
    control.meta.turn = 2;

    const sourceNudges = labourNudgesForTurn(treated, treated.meta.turn).get("US");
    // Independently pinned by AHDGame labourRelationsPoliticalProvider: a
    // first-turn dispute at severity `none` has age one and starts at -0.675/-0.36.
    expect(sourceNudges?.get("economy.workerSecurity")).toBeCloseTo(-0.675, 10);
    expect(sourceNudges?.get("society.civicLife")).toBeCloseTo(-0.36, 10);

    const corpsBefore = structuredClone(treated.corporations);
    const sectorsBefore = structuredClone(treated.corporateSectors);
    politicalCabinetResidualPhase.run(control, null as never);
    politicalCabinetResidualPhase.run(treated, null as never);
    treated.meta.turn++;
    control.meta.turn++;
    politicalCabinetResidualPhase.run(control, null as never);
    politicalCabinetResidualPhase.run(treated, null as never);

    const treatedBoard = treated.regionalPoliticalMetrics?.CA;
    const controlBoard = control.regionalPoliticalMetrics?.CA;
    expect(treatedBoard?.labourResiduals).toEqual({
      "economy.workerSecurity": -0.6075,
      "society.civicLife": -0.324,
    });
    expect(treatedBoard?.values["economy.workerSecurity"])
      .toBeLessThan(controlBoard?.values["economy.workerSecurity"] ?? Infinity);
    expect(treatedBoard?.values["society.civicLife"])
      .toBeLessThan(controlBoard?.values["society.civicLife"] ?? Infinity);
    expect(treated.corporations).toEqual(corpsBefore);
    expect(treated.corporateSectors).toEqual(sectorsBefore);

    const resumed = deserializeSave(serializeSave(treated, "2026-10-02T00:00:00.000Z"));
    expect(resumed.regionalPoliticalMetrics?.CA?.labourResiduals).toEqual(treatedBoard?.labourResiduals);
  });
});
