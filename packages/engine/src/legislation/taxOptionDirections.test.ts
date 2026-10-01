import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getLaw } from "./catalog.js";
import { createWorld } from "../world.js";
import { executeAction } from "../actions/execute.js";

const proof = JSON.parse(readFileSync(new URL("../../../../fixtures/tax-option-directions-source.json", import.meta.url), "utf8")) as {
  sourceRevision: string;
  rows: Array<{ id: string; rate: number; economic: number; social: number; effectDirection: number }>;
};

describe("immutable Game tax-option direction vectors", () => {
  it("preserves every source political direction independently of numeric rates", () => {
    expect(proof.sourceRevision).toBe("01797b27082b098fdf3929bb498215c94c8dda24");
    expect(proof.rows).toHaveLength(83);
    for (const row of proof.rows) {
      const lawId = row.id.replace(/_opt_\d+$/, "");
      expect(getLaw(lawId)?.taxPolicy?.options?.find(option => option.id === row.id), row.id)
        .toMatchObject({ rate: row.rate, economic: row.economic, social: row.social, effectDirection: row.effectDirection });
    }
  });

  it("proposes a higher China corporate rate with the source left political effect", () => {
    const world = createWorld({ countryId: "CN", era: "2019", seed: "cn-authored-tax-direction", playerName: "Player" });
    world.player.mode = "hos";
    world.player.actions = 100;
    world.player.nationalInfluence = 5;
    expect(executeAction(world, "player", "sponsorBill", { catalogId: "cn_enterprise_income_tax", taxRate: 28 }).ok).toBe(true);
    expect(world.bills.at(-1)).toMatchObject({ selectedRate: 28, effectDirection: -1,
      provisions: [expect.objectContaining({ policyOptionId: "cn_enterprise_income_tax_opt_6", effectDirection: -1 })] });
  });
});
