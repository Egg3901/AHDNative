import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GameSession } from "../game/session";
import { LegislationDetailsPanel } from "./LegislationDetailsPanel";

type JapanLawWorld = {
  meta: { turn: number };
  player: { countryId: string; mode: string; permanentHeadOfState?: boolean; currentOffice?: { type: string }; nationalInfluence?: number };
  budgets: Record<string, { taxRates: Record<string, number>; taxRatePhaseIn?: Record<string, number> }>;
  bills: Array<{
    countryId: string;
    legislationTypeId?: string;
    selectedRate?: number;
    status: string;
    enactedAtTurn?: number;
    provisions: Array<{ policyOptionId?: string }>;
  }>;
};

function japanWorld(session: GameSession): JapanLawWorld {
  return JSON.parse(session.serialize("2026-10-04T00:00:00.000Z")).world as JapanLawWorld;
}

describe("Japan public consumption-tax law journey (#283)", () => {
  it("shows the public JP proposal, enacts through source HoS authority, then replaces and repeals across saves", async () => {
    const user = userEvent.setup();
    const session = new GameSession();
    const view = session.create({
      era: "1991",
      countryId: "JP",
      seed: "jp-public-consumption-tax-1991",
      playerName: "Japan PM",
      mode: "hos",
    });
    expect(view.player).toMatchObject({ mode: "hos" });
    expect(japanWorld(session).player.countryId).toBe("JP");
    expect(view.legislature.sponsor.available).toBe(true);

    let query = session.legislation({ catalogId: "jp_consumption_tax" });
    expect(query.office).toBe("Head of state");
    expect(query.selectedProposal).toMatchObject({
      id: "jp_consumption_tax",
      sponsorAvailable: false,
      sponsorNpiCost: 5,
      taxPolicy: { taxType: "salesTax", baselineRate: 10 },
    });
    expect(query.selectedProposal?.taxPolicy?.options)
      .toContainEqual(expect.objectContaining({ id: "jp_consumption_tax_opt_2", rate: 5 }));
    expect(japanWorld(session).budgets.JP?.taxRates.salesTax).toBe(3);

    // The public HoS position accrues source national influence at ordinary
    // turn refresh. Build the bill only after the live sponsorship gate opens.
    session.advance();
    session.advance();
    expect(japanWorld(session).player.nationalInfluence).toBeGreaterThanOrEqual(5);
    query = session.legislation({ catalogId: "jp_consumption_tax" });
    expect(query.selectedProposal?.sponsorAvailable).toBe(true);
    const outcomes: unknown[] = [];
    render(<LegislationDetailsPanel query={query} busy={false} onAction={(id, params) => {
      outcomes.push(session.act(id, params));
    }} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Tax rate" }), "5");
    await user.click(screen.getByRole("button", { name: /sponsor bill/i }));
    expect(outcomes).toEqual([expect.objectContaining({ ok: true })]);

    // Game's national HoS command invokes enactSingleplayerDecree immediately;
    // this is the source sovereign path, not a parliamentary ballot.
    let saved = japanWorld(session);
    expect(saved.bills.at(-1)).toMatchObject({
      countryId: "JP",
      legislationTypeId: "jp_consumption_tax",
      selectedRate: 5,
      status: "signed",
      enactedAtTurn: 2,
      provisions: [expect.objectContaining({ policyOptionId: "jp_consumption_tax_opt_2" })],
    });
    expect(saved.budgets.JP?.taxRates.salesTax).toBe(4);
    expect(saved.budgets.JP?.taxRatePhaseIn?.salesTax).toBe(5);

    const reloaded = new GameSession();
    reloaded.load(session.serialize("2026-10-04T00:00:00.000Z"));
    reloaded.advance();
    saved = japanWorld(reloaded);
    expect(saved.budgets.JP?.taxRates.salesTax).toBe(5);
    expect(saved.budgets.JP?.taxRatePhaseIn?.salesTax).toBeUndefined();

    expect(reloaded.act("sponsorBill", { catalogId: "jp_consumption_tax", taxRate: 13 }).ok).toBe(true);
    saved = japanWorld(reloaded);
    expect(saved.bills.at(-1)).toMatchObject({ selectedRate: 13, status: "signed" });
    expect(saved.budgets.JP?.taxRates.salesTax).toBe(6);
    expect(saved.budgets.JP?.taxRatePhaseIn?.salesTax).toBe(13);

    const replacementReload = new GameSession();
    replacementReload.load(reloaded.serialize("2026-10-04T00:00:00.000Z"));
    replacementReload.advance();
    expect(japanWorld(replacementReload).budgets.JP?.taxRates.salesTax).toBe(7);

    // The separate source HoS repeal action returns the tax to the authored
    // 10% preset baseline using the same one-point-per-turn source ladder.
    expect(replacementReload.act("repealLaw", { catalogId: "jp_consumption_tax" }).ok).toBe(true);
    saved = japanWorld(replacementReload);
    expect(saved.bills.at(-1)).toMatchObject({
      countryId: "JP",
      legislationTypeId: "jp_consumption_tax",
      status: "signed",
      enactedAtTurn: 4,
    });
    expect(saved.budgets.JP?.taxRates.salesTax).toBe(8);
    expect(saved.budgets.JP?.taxRatePhaseIn?.salesTax).toBe(10);

    const repealReload = new GameSession();
    repealReload.load(replacementReload.serialize("2026-10-04T00:00:00.000Z"));
    repealReload.advance();
    expect(japanWorld(repealReload).budgets.JP?.taxRates.salesTax).toBe(9);
    repealReload.advance();
    expect(japanWorld(repealReload).budgets.JP?.taxRates.salesTax).toBe(10);
  });
});
