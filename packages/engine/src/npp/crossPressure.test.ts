import { describe, expect, it } from "vitest";
import {
  computeCrossPressureForces,
  computeOppositionVoteForce,
  computePartyLineForce,
  computeWhipForce,
  verdictFromForces,
} from "./crossPressure.js";
import type { Bill } from "../legislation/types.js";
import type { CatalogEntry } from "../legislation/catalog.js";

const voter = {
  partyId: "CN_CCP",
  ideology: { economic: -3, social: 0 },
  donorBaseLevel: 3,
  personality: { loyalty: 80, stubbornness: 20, ambition: 50 },
} as const;

const bill: Pick<Bill, "countryId" | "sponsorPartyId" | "legislationTypeId" | "effectDirection" | "provisions" | "category"> = {
  countryId: "CN",
  category: "economic",
  sponsorPartyId: "CN_OTHER",
  legislationTypeId: "cn_value_added_tax",
  effectDirection: 1,
  provisions: [{
    type: "policy",
    legislationTypeId: "cn_value_added_tax",
    policyOptionId: "cn_value_added_tax_opt_8",
    effectDirection: 1,
    economic: 3,
    social: 0,
  }],
};

const selectedLaw: Pick<CatalogEntry, "taxPolicy"> = {
  taxPolicy: {
    options: [{ id: "cn_value_added_tax_opt_8", rate: 19, effectDirection: 1, economic: 3, social: 0 }],
  },
};

describe("source NPP bill cross-pressure", () => {
  it("matches the pinned Game tax-vector force and verdict", () => {
    // Executed from AHDGame cb66acdf: ideology -60, whip 0, district 0,
    // donors -36, and verdict against for this exact CN VAT option vector.
    const result = computeCrossPressureForces(voter, bill, selectedLaw, {
      homeStateDemographics: null,
      partyWhip: null,
    });

    expect(result.forces).toEqual({ ideology: -60, whip: 0, district: 0, donors: -36 });
    expect(result.verdict).toBe("against");
    expect(verdictFromForces({ ideology: 5, whip: 0, district: 0, donors: 0 })).toBe("abstain");
    expect(verdictFromForces({ ideology: 5.01, whip: 0, district: 0, donors: 0 })).toBe("for");
  });

  it("uses source compliance for hard/soft whips, party line, and opposition", () => {
    expect(computeWhipForce(voter, { direction: "against", mode: "soft" })).toBeCloseTo(-24);
    expect(computeWhipForce(voter, { direction: "for", mode: "hard" })).toBeCloseTo(48);
    expect(computePartyLineForce(voter, "CN_CCP")).toBeCloseTo(16);
    expect(computePartyLineForce(voter, "CN_OTHER")).toBe(0);
    expect(computeOppositionVoteForce(voter, "CN_OTHER", {
      governingPartyId: "CN_OTHER",
      oppositionPartyId: "CN_CCP",
      coordination: 1,
    })).toBeCloseTo(-16);
  });

  it("still applies a recorded source whip when a federal bill has no policy provision", () => {
    const result = computeCrossPressureForces(voter, {
      sponsorPartyId: null,
      legislationTypeId: null,
      effectDirection: 0,
      provisions: [],
      category: "economic",
    }, {}, {
      homeStateDemographics: null,
      partyWhip: { direction: "against", mode: "hard" },
    });
    expect(result.forces.ideology).toBe(0);
    expect(result.forces.whip).toBeCloseTo(-48);
    expect(result.forces.district).toBe(0);
    expect(result.forces.donors).toBe(0);
    expect(result.verdict).toBe("against");
  });

  it("matches the source population-weighted option approvals and uses zero when absent", () => {
    const approvalLaw = {
      taxPolicy: {
        options: [{
          id: "cn_value_added_tax_opt_8",
          rate: 19,
          effectDirection: 1,
          economic: 3,
          social: 0,
          archetypeApprovals: { rural_workers: -40, urban_professionals: 30 },
        }],
      },
    } as const;
    const demographics = {
      groups: {
        rural_workers: { population: 25 },
        urban_professionals: { population: 75 },
      },
    };
    expect(computeCrossPressureForces(voter, bill, approvalLaw, {
      homeStateDemographics: demographics,
      partyWhip: null,
    }).forces.district).toBe(12.5);
    expect(computeCrossPressureForces(voter, bill, selectedLaw, {
      homeStateDemographics: demographics,
      partyWhip: null,
    }).forces.district).toBe(0);
  });
});
