import { describe, expect, it } from "vitest";
import { createWorld, SCHEMA_VERSION } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { executeAction } from "../actions/execute.js";
import { launchProspectingSurvey } from "./prospecting.js";
import { issueContractOffer } from "./contracts.js";
import { getResourceContractAuthority, isNationalExtractionIssuer, resolveExtractionContractIssuer } from "./authority.js";
import { prospectCostAnchor, prospectDurationTurns } from "./constants.js";
import { corporateSectorAssets } from "../corporation/corporateSectorAssets.js";
import { EXTRACTION_STARTER_BUILD_TURNS, EXTRACTION_STARTER_UNITS } from "./operations.js";

const OPTS = { seed: "w11-extraction-seed", playerName: "Tester", countryId: "US", era: "1953", homeRegionId: "DC" } as const;
const seatNationalIssuer = (w: ReturnType<typeof createWorld>) => {
  w.executives.US = { countryId: "US", presidentId: "player", presidentParty: null, termStartTurn: 0, vicePresidentId: null, vicePresidentParty: null };
};
const seatPlayerExtractionCeo = (w: ReturnType<typeof createWorld>) => {
  const corporation = w.corporations[`${w.player.countryId}-extraction`]!;
  expect(executeAction(w, "player", "buyShares", { corpId: corporation.id, shares: 1 }).ok).toBe(true);
  expect(executeAction(w, "player", "voteCeo", { corpId: corporation.id, candidateId: "player" }).ok).toBe(true);
  expect(corporation.pendingCeoId).toBe("player");
  expect(executeAction(w, "player", "acceptCeoAppointment", { corpId: corporation.id }).ok).toBe(true);
  return corporation;
};
const addRegionalExtractionOperation = (w: ReturnType<typeof createWorld>, regionId = "TX") => {
  const corporation = seatPlayerExtractionCeo(w);
  const result = executeAction(w, "player", "expandRegionalExtraction", { regionId });
  expect(result.ok).toBe(true);
  return corporation;
};

describe("source extraction issuer authority", () => {
  it("defaults federal, prefers a qualified national issuer under concurrent licensing, and requires the recorded governor under state-only licensing", () => {
    const w = createWorld(OPTS);
    w.executives.US = { countryId: "US", presidentId: "player", presidentParty: null, termStartTurn: 0, vicePresidentId: null, vicePresidentParty: null };
    w.governors.TX = { stateId: "TX", countryId: "US", governorId: "player", governorParty: null, governorName: "Tester", termStartTurn: 0, gubernatorialActions: 4, lastActionGrantedTurn: 0, lastAddressTurn: null };
    expect(getResourceContractAuthority(w, "US")).toBe("national");
    expect(resolveExtractionContractIssuer(w, "US", "TX")).toBe("national");

    w.enactedLaws.push({ id: "resource_extraction_authority", countryId: "US", billId: "concurrent", enactedAtTurn: 1, level: 1, scope: "national", expiresAtTurn: null });
    expect(getResourceContractAuthority(w, "US")).toBe("both");
    expect(resolveExtractionContractIssuer(w, "US", "TX")).toBe("national");

    w.executives.US!.presidentId = "npc-president";
    w.enactedLaws.push({ id: "resource_extraction_authority", countryId: "US", billId: "state-only", enactedAtTurn: 2, level: 2, scope: "national", expiresAtTurn: null });
    expect(getResourceContractAuthority(w, "US")).toBe("state");
    expect(resolveExtractionContractIssuer(w, "US", "TX")).toBe("state");
    expect(resolveExtractionContractIssuer(w, "US", "PA")).toBeNull();
  });

  it("keeps non-US content national-only when the source act is absent", () => {
    const w = createWorld({ ...OPTS, countryId: "UK", homeRegionId: "SCO" });
    expect(getResourceContractAuthority(w, "UK")).toBe("national");
    expect(resolveExtractionContractIssuer(w, "UK", "SCO")).toBeNull();
    w.governments.UK = {
      countryId: "UK", chamberKey: "commons", status: "formed", formationType: "majority",
      governingPartyId: null, coalitionPartyIds: null, pmPoliticianId: "player",
      totalSeatsSupporting: 1, majorityThreshold: 1, totalSeats: 1, seatsByParty: {},
      lostMajority: false, formedTurn: 0, pmVacancyDeadlineTurn: null,
      snapElectionsUsed: 0, lastSnapElectionTurn: null, confidence: 75,
    };
    expect(isNationalExtractionIssuer(w, "UK")).toBe(true);
  });
});

describe("stateResourceCapacities seeding", () => {
  it("seeds real per-state US capacity with headroom applied", () => {
    const w = createWorld(OPTS);
    // Source: US:TX oil 450000 x headroom 3 = 1,350,000; natural_gas 2,250,000 x3 = 6,750,000; coal 15,000 x2 = 30,000
    expect(w.stateResourceCapacities["TX"]?.resources.oil).toBe(1_350_000);
    expect(w.stateResourceCapacities["TX"]?.resources.natural_gas).toBe(6_750_000);
    expect(w.stateResourceCapacities["TX"]?.resources.coal).toBe(30_000);
    // A state with no authored entry (e.g. AK is authored; pick one with only timber, e.g. CT)
    expect(w.stateResourceCapacities["CT"]?.resources.timber).toBe(9_000); // 3000 x3
  });

  it("seeds real per-region UK/RU/DD capacity (W39 real subdivisions, not opaque)", () => {
    const w = createWorld(OPTS);
    const ukRegions = ["LON", "SEE", "SWE", "EAE", "EMI", "WMI", "YHU", "NWE", "NEE", "SCO", "WAL", "NIR"];
    // 1953 era strips UK:SCO oil/natural_gas (North Sea, pre-1969): national
    // total timber 90750x3=272250, coal 97500x2=195000, iron 45000x7=315000.
    let totalCoal = 0;
    for (const r of ukRegions) totalCoal += w.stateResourceCapacities[r]?.resources.coal ?? 0;
    expect(totalCoal).toBe(97_500 * 2);
    // No UK oil in 1953 (SCO stripped, was the only source)
    for (const r of ukRegions) expect(w.stateResourceCapacities[r]?.resources.oil ?? 0).toBe(0);
    // Per-region spot check: NEE coal 30000 x2 headroom = 60000
    expect(w.stateResourceCapacities["NEE"]?.resources.coal).toBe(60_000);
    // RU:WSB oil/natural_gas also stripped pre-1960 (Tyumen, discovered 1960)
    expect(w.stateResourceCapacities["WSB"]?.resources.oil ?? 0).toBe(0);
    expect(w.stateResourceCapacities["URA"]?.resources.iron).toBe(216_000 * 7);
    // DD:BEO (East Berlin) has no mainline entry -> empty resources, not evenly split
    expect(w.stateResourceCapacities["BEO"]?.resources).toEqual({});
    expect(w.stateResourceCapacities["SN"]?.resources.coal).toBe(55_000 * 2);
  });

  it("is deterministic across identical seeds", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    expect(a.stateResourceCapacities).toEqual(b.stateResourceCapacities);
  });
});

describe("prospecting", () => {
  it("launchProspectingSurvey requires HoS mode", () => {
    const w = createWorld(OPTS);
    w.player.actions = 10;
    const res = executeAction(w, "player", "launchProspect", { regionId: "TX", resource: "oil" });
    expect(res.ok).toBe(false);
  });

  it("launches and charges treasury; resolves after era-scaled duration", () => {
    const w = createWorld(OPTS);
    w.player.mode = "hos";
    w.executives.US = { countryId: "US", presidentId: "player", presidentParty: null, termStartTurn: 0, vicePresidentId: null, vicePresidentParty: null };
    w.player.actions = 10;
    const budgetBefore = w.budgets["US"]!.treasuryBalance;
    const res = executeAction(w, "player", "launchProspect", { regionId: "TX", resource: "oil" });
    expect(res.ok).toBe(true);
    expect(w.prospectingSurveys).toHaveLength(1);
    const survey = w.prospectingSurveys[0]!;
    expect(survey.status).toBe("active");
    expect(survey.costAnchor).toBe(prospectCostAnchor(0));
    expect(w.budgets["US"]!.treasuryBalance).toBe(budgetBefore - prospectCostAnchor(0));
    expect(survey.completesTurn).toBe(prospectDurationTurns(1953));

    for (let i = 0; i < survey.completesTurn; i++) advanceTurn(w);
    const resolved = w.prospectingSurveys[0]!;
    expect(["succeeded", "failed"]).toContain(resolved.status);
    expect(resolved.resolvedTurn).toBe(survey.completesTurn);
  });

  it("rejects a resource with no deposit in the region", () => {
    const w = createWorld(OPTS);
    seatNationalIssuer(w);
    const res = launchProspectingSurvey(w, { countryId: "US", regionId: "RI", resource: "oil" });
    expect(res.ok).toBe(false);
  });

  it("caps active surveys per government at 3", () => {
    const w = createWorld(OPTS);
    seatNationalIssuer(w);
    const regions: Array<[string, "oil" | "natural_gas" | "coal"]> = [
      ["TX", "oil"],
      ["TX", "natural_gas"],
      ["TX", "coal"],
    ];
    for (const [regionId, resource] of regions) {
      const r = launchProspectingSurvey(w, { countryId: "US", regionId, resource });
      expect(r.ok).toBe(true);
    }
    const fourth = launchProspectingSurvey(w, { countryId: "US", regionId: "PA", resource: "coal" });
    expect(fourth.ok).toBe(false);
  });

  it("determinism: identical seeds resolve identically", () => {
    const mk = () => {
      const w = createWorld({ seed: "prospect-det", playerName: "P", countryId: "US", era: "1953" });
      seatNationalIssuer(w);
      launchProspectingSurvey(w, { countryId: "US", regionId: "TX", resource: "oil" });
      return w;
    };
    const a = mk();
    const b = mk();
    const completesTurn = a.prospectingSurveys[0]!.completesTurn;
    for (let i = 0; i < completesTurn; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(a.prospectingSurveys[0]!.status).toBe(b.prospectingSurveys[0]!.status);
    expect(a.prospectingSurveys[0]!.capacityGained).toBe(b.prospectingSurveys[0]!.capacityGained);
    expect(a.stateResourceCapacities).toEqual(b.stateResourceCapacities);
  });
});

describe("extraction contract issuance + NPC acceptance", () => {
  it("issues an offer to the country's extraction corp and it auto-accepts when affordable", () => {
    // Counterfactual pattern (not a bare before/after delta across a full
    // advanceTurn): a full turn also runs corporationTurn and every other
    // economic phase, which moves corp.liquidCapital and the treasury for
    // reasons unrelated to the signing fee. Isolate the signing-fee effect
    // by diffing two identically-seeded worlds, one with the offer issued
    // and one without, across the same single turn.
    const mkWorld = () => createWorld(OPTS);
    const withOffer = mkWorld();
    seatNationalIssuer(withOffer);
    addRegionalExtractionOperation(withOffer);
    withOffer.player.actions = 10;
    const corp = withOffer.corporations["US-extraction"]!;
    expect(corp).toBeDefined();
    const res = executeAction(withOffer, "player", "issueExtractionContract", {
      regionId: "TX",
      resource: "oil",
      share: 0.1,
      royaltyRatePerTurn: 0.01,
      termTurns: 24,
      signingFeeAnchor: 1000,
    });
    expect(res.ok).toBe(true);
    const contract = withOffer.extractionContracts[0]!;
    expect(contract.status).toBe("offered");
    expect(contract.corporationId).toBe("US-extraction");

    const without = mkWorld();
    addRegionalExtractionOperation(without);
    withOffer.corporations["US-extraction"]!.ceoId = null;
    withOffer.corporations["US-extraction"]!.ceoType = "npp";
    without.corporations["US-extraction"]!.ceoId = null;
    without.corporations["US-extraction"]!.ceoType = "npp";

    advanceTurn(withOffer);
    advanceTurn(without);

    const after = withOffer.extractionContracts[0]!;
    expect(after.status).toBe("active");
    expect(after.expiresTurn).toBe(after.activatedTurn! + 24);

    const corpDelta = withOffer.corporations["US-extraction"]!.liquidCapital - without.corporations["US-extraction"]!.liquidCapital;
    const treasuryDelta = withOffer.budgets["US"]!.treasuryBalance - without.budgets["US"]!.treasuryBalance;
    expect(corpDelta).toBe(-1000);
    expect(treasuryDelta).toBe(1000);
  });

  it("holds a player-CEO offer open until the CEO accepts through the public action contract", () => {
    const w = createWorld(OPTS);
    seatNationalIssuer(w);
    const corp = addRegionalExtractionOperation(w);
    w.player.actions = 100;
    const offered = executeAction(w, "player", "issueExtractionContract", {
      regionId: "TX", resource: "oil", share: 0.1, royaltyRatePerTurn: 0.01, termTurns: 24, signingFeeAnchor: 100,
    });
    expect(offered.ok).toBe(true);
    const contract = w.extractionContracts[0]!;

    advanceTurn(w);
    expect(contract.status).toBe("offered");
    const cashBefore = corp.liquidCapital;
    const accepted = executeAction(w, "player", "acceptExtractionContract", { contractId: contract.id });

    expect(accepted.ok).toBe(true);
    expect(contract.status).toBe("active");
    expect(corp.liquidCapital).toBe(cashBefore - 100);
    expect(contract.activatedTurn).toBe(w.meta.turn);
    expect(contract.expiresTurn).toBe(w.meta.turn + 24);
  });

  it("runs a state-issued prospect, CEO contract, starter build, production, royalties, and save reload", () => {
    const w = createWorld(OPTS);
    w.enactedLaws.push({ id: "resource_extraction_authority", countryId: "US", billId: "state-only", enactedAtTurn: 0, level: 2, scope: "national", expiresAtTurn: null });
    w.governors.TX = { stateId: "TX", countryId: "US", governorId: "player", governorParty: null, governorName: "Tester", termStartTurn: 0, gubernatorialActions: 4, lastActionGrantedTurn: 0, lastAddressTurn: null };
    const corp = addRegionalExtractionOperation(w);
    const operation = Object.values(corporateSectorAssets(w)).find((asset) => asset.corporationId === corp.id && asset.stateId === "TX")!;
    w.player.actions = 100;

    const survey = executeAction(w, "player", "launchProspect", { regionId: "TX", resource: "oil", issuerLevel: "state" });
    expect(survey.ok).toBe(true);
    expect(w.governors.TX.gubernatorialActions).toBe(3);
    expect(w.regionalBudgets.TX!.spending.resourceProspecting).toBeGreaterThan(0);
    const offer = executeAction(w, "player", "issueExtractionContract", {
      regionId: "TX", resource: "oil", share: 0.1, royaltyRatePerTurn: 0.01, termTurns: 120, signingFeeAnchor: 100,
    });
    expect(offer.ok).toBe(true);
    const contract = w.extractionContracts[0]!;
    expect(contract.grantedByLevel).toBe("state");

    expect(executeAction(w, "player", "acceptExtractionContract", { contractId: contract.id }).ok).toBe(true);
    expect(contract.status).toBe("active");
    const capacity = w.stateResourceCapacities.TX!.resources.oil!;
    advanceTurn(w);

    const expectedRoyalty = 0.01 * 0.1 * capacity * w.commodityPrices.oil!.globalPrice;
    expect(operation.capitalStock).toBeGreaterThan(0);
    expect(operation.producedUnits).toBeGreaterThan(0);
    expect(operation.soldByCommodity).toMatchObject({ iron: 0, rare_earth: 0, timber: 0 });
    expect(operation.buildQueue?.[0]?.onlineTurn).toBeGreaterThan(w.meta.turn);
    expect(operation.realizedRevenue).toBeGreaterThan(0);
    expect(contract.lastSettlementTurn).toBe(w.meta.turn);
    expect(w.regionalBudgets.TX!.revenue.resourceRoyalties).toBeCloseTo(100 + expectedRoyalty, 6);
    expect(w.regionalBudgets.TX!.revenue.total).toBeGreaterThan(w.regionalBudgets.TX!.revenue.councilTax + w.regionalBudgets.TX!.revenue.businessRates + w.regionalBudgets.TX!.revenue.grant);
    const firstTurnRoyaltyBudget = w.regionalBudgets.TX!.revenue.resourceRoyalties;
    for (let i = 0; i < EXTRACTION_STARTER_BUILD_TURNS - 1; i += 1) advanceTurn(w);
    expect(w.prospectingSurveys[0]!.status).toMatch(/succeeded|failed/);
    expect(operation.buildQueue).toEqual([]);
    expect(operation.constructionInProgressAnchor).toBe(0);
    expect(operation.capitalStock).toBeGreaterThan(EXTRACTION_STARTER_UNITS * 0.8);
    expect(operation.capacityBookAnchor).toBeGreaterThan(0);
    expect(operation.producedUnits).toBeGreaterThan(0);
    expect(operation.realizedRevenue).toBeGreaterThan(0);
    expect(w.regionalBudgets.TX!.revenue.resourceRoyalties).toBeGreaterThan(firstTurnRoyaltyBudget ?? 0);
    const restored = deserializeSave(serializeSave(w, "2026-10-01T00:00:00.000Z"));
    expect(Object.values(corporateSectorAssets(restored))).toContainEqual(expect.objectContaining({
      id: operation.id,
      capitalStock: operation.capitalStock,
      capacityBookAnchor: operation.capacityBookAnchor,
      producedUnits: operation.producedUnits,
      realizedRevenue: operation.realizedRevenue,
      buildQueue: operation.buildQueue,
    }));
    expect(restored.extractionContracts.find((item) => item.id === contract.id)).toMatchObject({ status: "active", grantedByLevel: "state", lastSettlementTurn: w.meta.turn });
    expect(restored.regionalBudgets.TX!.revenue.resourceRoyalties).toBe(w.regionalBudgets.TX!.revenue.resourceRoyalties);
    expect(restored.regionalBudgets.TX!.spending.resourceProspecting).toBe(w.regionalBudgets.TX!.spending.resourceProspecting);
  }, 600_000);

  it("lets the CEO decline an offer and the recorded issuer revoke an accepted contract", () => {
    const w = createWorld(OPTS);
    seatNationalIssuer(w);
    const corp = addRegionalExtractionOperation(w);
    const issue = () => executeAction(w, "player", "issueExtractionContract", {
      regionId: "TX", resource: "oil", share: 0.1, royaltyRatePerTurn: 0.01, termTurns: 24, signingFeeAnchor: 0,
    });

    expect(issue().ok).toBe(true);
    const declined = w.extractionContracts[0]!;
    expect(executeAction(w, "player", "declineExtractionContract", { contractId: declined.id }).ok).toBe(true);
    expect(declined.status).toBe("declined");
    expect(declined.revokedTurn).toBe(w.meta.turn);

    expect(issue().ok).toBe(true);
    const revoked = w.extractionContracts[1]!;
    expect(executeAction(w, "player", "acceptExtractionContract", { contractId: revoked.id }).ok).toBe(true);
    expect(executeAction(w, "player", "revokeExtractionContract", { contractId: revoked.id }).ok).toBe(true);
    const royaltiesBefore = w.budgets.US!.revenue.other;
    advanceTurn(w);
    expect(revoked.revokedTurn).toBe(0);
    expect(revoked.lastSettlementTurn).not.toBe(w.meta.turn);
    expect(w.budgets.US!.revenue.other).toBe(royaltiesBefore);
  });

  it("enforces the 75% total-contracted-share cap", () => {
    const w = createWorld(OPTS);
    seatNationalIssuer(w);
    addRegionalExtractionOperation(w);
    const first = issueContractOffer(w, {
      countryId: "US",
      regionId: "TX",
      resource: "oil",
      share: 0.6,
      royaltyRatePerTurn: 0.01,
      termTurns: 24,
      signingFeeAnchor: 0,
    });
    expect(first.ok).toBe(true);
    const second = issueContractOffer(w, {
      countryId: "US",
      regionId: "TX",
      resource: "oil",
      share: 0.3,
      royaltyRatePerTurn: 0.01,
      termTurns: 24,
      signingFeeAnchor: 0,
    });
    expect(second.ok).toBe(false);
  });

  it("real capacity feeds contract settlement royalties (replacing the notional stub)", () => {
    const w = createWorld(OPTS);
    w.extractionContracts.push({
      id: "real-cap-1",
      stateId: "TX",
      countryId: "US",
      resource: "oil",
      share: 0.5,
      royaltyRatePerTurn: 0.01,
      status: "active",
      grantedTurn: 0,
      grantedByLevel: "national",
      missedPayments: 0,
      lastSettlementTurn: null,
      corporationId: null,
    });
    advanceTurn(w);
    const cap = w.stateResourceCapacities["TX"]!;
    expect(cap.extractedUnits?.oil).toBeGreaterThan(0);
    // extracted volume this turn = share * depleted capacity (initially the full seeded ceiling)
    expect(cap.extractedUnits?.oil).toBe(0.5 * cap.resources.oil!);
  });
});

describe("W11 schema", () => {
  it("bumps SCHEMA_VERSION to 36 and round-trips through save/load", () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(36);
    const w = createWorld(OPTS);
    seatNationalIssuer(w);
    launchProspectingSurvey(w, { countryId: "US", regionId: "TX", resource: "oil" });
    const raw = serializeSave(w, "2026-01-01T00:00:00.000Z");
    const loaded = deserializeSave(raw);
    expect(loaded.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.prospectingSurveys).toHaveLength(1);
    expect(loaded.stateResourceCapacities["TX"]?.resources.oil).toBe(w.stateResourceCapacities["TX"]?.resources.oil);
  });

  it("migrates a pre-v36 save (v33) with backfilled defaults", () => {
    const w = createWorld(OPTS);
    const raw = JSON.parse(serializeSave(w, "2026-01-01T00:00:00.000Z"));
    raw.schemaVersion = 33;
    delete raw.world.prospectingSurveys;
    delete raw.world.stateResourceCapacities;
    delete raw.world.achievementsEarned;
    delete raw.world.player.actionCounts;
    delete raw.world.player.wireQuotaUsedAnchor;
    delete raw.world.player.wireQuotaWindowStartTurn;
    for (const pol of raw.world.politicians) delete pol.cash;
    raw.world.meta.schemaVersion = 33;
    const loaded = deserializeSave(JSON.stringify(raw));
    expect(loaded.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.prospectingSurveys).toEqual([]);
    expect(loaded.achievementsEarned).toEqual([]);
    expect(loaded.stateResourceCapacities["TX"]?.resources.oil).toBe(1_350_000);
    expect(loaded.player.actionCounts).toEqual({});
    expect(loaded.player.wireQuotaUsedAnchor).toBe(0);
    expect(loaded.player.wireQuotaWindowStartTurn).toBeNull();
    for (const pol of loaded.politicians) expect(pol.cash).toBe(0);
  });
});
