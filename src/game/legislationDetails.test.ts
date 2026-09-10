import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  createWorld,
  deserializeSave,
  executeAction,
  serializeSave,
  type WorldState,
} from "@ahdclient/engine";
import {
  ACTIVE_BILL_STATUSES,
  COMPLETED_BILL_STATUSES,
  buildLegislationDetails,
  sponsorParamsForLegislation,
} from "./legislationDetails";

const options = { era: "1953", countryId: "US", seed: "native-legislation-depth-v1", playerName: "Alex" };
const savedAt = "2026-09-10T00:00:00.000Z";

function hosWorld(): WorldState {
  return deserializeSave(serializeSave(createWorld({ ...options, mode: "hos" }), savedAt));
}

describe("legislationDetails query (detached, bounded)", () => {
  it("groups bills by chamber into active and completed partitions", () => {
    const query = buildLegislationDetails(hosWorld());
    const keys = query.chambers.map((c) => c.chamberKey);
    expect(keys).toContain("house");
    expect(keys).toContain("senate");
    for (const chamber of query.chambers) {
      for (const bill of [...chamber.active, ...chamber.completed]) {
        expect(bill.chamberKey).toBe(chamber.chamberKey);
      }
      expect(chamber.active.every((b) => ACTIVE_BILL_STATUSES.has(b.status))).toBe(true);
      expect(chamber.completed.every((b) => COMPLETED_BILL_STATUSES.has(b.status))).toBe(true);
    }
  });

  it("exposes catalog proposal details with source-only levels and effects", () => {
    const query = buildLegislationDetails(hosWorld());
    const proposal = query.proposals.find((p) => p.id === "us.economy.workerSecurity.primary");
    expect(proposal).toMatchObject({
      title: "Fair Labor Standards and Employment Security Act",
      kind: "primary",
      category: "economy",
      allowedScope: "both",
      baselineLevel: 1,
    });
    expect(proposal?.levels).toHaveLength(5);
    expect(proposal?.levels?.[1]).toMatchObject({ name: "Basic Standards" });
    expect(proposal?.effect).toMatchObject({ economy: { unemploymentRate: -0.002 } });
  });

  it("marks legal-level choice as unsupported and tax-rate choice as supported", () => {
    const query = buildLegislationDetails(hosWorld());
    expect(query.sponsorSupportsLevelChoice).toBe(false);
    expect(query.sponsorSupportsTaxRateChoice).toBe(true);
    expect(query.levelChoiceNote).toMatch(/unavailable in this single-player version/i);
    expect(query.levelChoiceNote).not.toMatch(/sponsorBill|catalogId|effectDirection/i);
    const tax = query.proposals.find((p) => p.id === "us.tax.incomeTax");
    expect(tax?.taxPolicy).toMatchObject({ minRate: 0, maxRate: 60, step: 1, baselineRate: 35 });
  });

  it("snaps and clamps sponsor tax rates to the catalog ladder, and ignores rates for non-tax entries", () => {
    expect(sponsorParamsForLegislation("us.tax.incomeTax")).toEqual({ catalogId: "us.tax.incomeTax", taxRate: 35 });
    expect(sponsorParamsForLegislation("us.tax.incomeTax", { taxRate: 35.7 })).toEqual({
      catalogId: "us.tax.incomeTax", taxRate: 36,
    });
    expect(sponsorParamsForLegislation("us.tax.incomeTax", { taxRate: 999 })).toEqual({
      catalogId: "us.tax.incomeTax", taxRate: 60,
    });
    expect(sponsorParamsForLegislation("us.economy.workerSecurity.primary", { taxRate: 50 })).toEqual({
      catalogId: "us.economy.workerSecurity.primary",
    });
  });

  it("shows a sponsored bill in its origin-chamber active partition with selected-bill details", () => {
    const world = hosWorld();
    expect(executeAction(world, "player", "sponsorBill", {
      catalogId: "us.economy.workerSecurity.primary",
    }).ok).toBe(true);
    const sponsored = world.bills[world.bills.length - 1];
    const billId = sponsored.id;
    const query = buildLegislationDetails(world, { billId });
    const origin = query.chambers.find((c) => c.chamberKey === sponsored.currentChamber)!;
    expect(origin).toBeDefined();
    expect(origin.active.some((b) => b.id === billId)).toBe(true);
    expect(query.selectedBill).toMatchObject({
      id: billId,
      legislationTypeId: "us.economy.workerSecurity.primary",
      category: "economy",
    });
    expect(query.selectedBill?.catalogLevels).toHaveLength(5);
  });

  it("reads the genuine t95 fixture without mutating it, with the completed Senate bill in place", () => {
    const raw = gunzipSync(readFileSync(new URL("../../fixtures/career-t95-1953-US.save.json.gz", import.meta.url))).toString("utf8");
    const world = deserializeSave(raw);
    const before = serializeSave(world, savedAt);
    const query = buildLegislationDetails(world);
    const senate = query.chambers.find((c) => c.chamberKey === "senate")!;
    expect(senate.completed.find((b) => b.id === "bill-79-6-us.economy.stability.primary")).toMatchObject({
      votesFor: 52, votesAgainst: 27, votesAbstain: 16,
    });
    expect(serializeSave(world, savedAt)).toBe(before);
  });

  it("detaches nested effect objects from the global catalog against caller mutation", () => {
    const world = hosWorld();
    const first = buildLegislationDetails(world);
    const proposal = first.proposals.find((p) => p.effect?.economy) ?? first.proposals[0];
    const proposalId = proposal.id;
    const before = JSON.stringify(proposal.effect);
    expect(before).toBeDefined();
    if (proposal.effect?.economy) {
      for (const key of Object.keys(proposal.effect.economy)) {
        (proposal.effect.economy as Record<string, number>)[key] = 999;
      }
    }
    if (proposal.effect?.partySupport) {
      for (const key of Object.keys(proposal.effect.partySupport)) {
        (proposal.effect.partySupport as Record<string, number>)[key] = 999;
      }
    }
    const second = buildLegislationDetails(world);
    const again = second.proposals.find((p) => p.id === proposalId);
    expect(JSON.stringify(again?.effect)).toBe(before);
    expect(again?.effect?.economy).not.toBe(proposal.effect?.economy);
  });

  it("returns a bounded DTO with no raw world reference", () => {
    const query = buildLegislationDetails(hosWorld());
    expect("world" in query).toBe(false);
    expect(JSON.stringify(query).length).toBeLessThan(256 * 1024);
  });
});
