import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GameSession } from "../game/session";
import type { ExecuteActionParams } from "@ahdclient/engine";

const RELEASED_ROWS = [
  { id: "ru.economy.stability.primary", countryId: "RU", era: "1953" },
  { id: "dd.economy.workerSecurity.primary", countryId: "DD", era: "1953" },
  { id: "dd.economy.workerSecurity.primary", countryId: "DD", era: "1953", region: true },
  { id: "us.defense.diplomacy.primary", countryId: "US", era: "1953" },
  { id: "us.defense.armedForces.primary", countryId: "US", era: "1953" },
  { id: "us.environment.conservation.primary", countryId: "US", era: "1953" },
  { id: "uk.defense.security.primary", countryId: "UK", era: "1953" },
  { id: "us.tax.tariffs", countryId: "US", era: "1953", taxRate: 1 },
  { id: "ie_corporate_tax_rate", countryId: "IE", era: "2019", taxRate: 15 },
  { id: "de_government_ethics", countryId: "DE", era: "2019" },
  { id: "ie_electoral_reform", countryId: "IE", era: "2019" },
  { id: "ie_gender_equality", countryId: "IE", era: "2019" },
  { id: "ie_government_ethics", countryId: "IE", era: "2019" },
] as const;

const SAVED_AT = "2026-10-03T00:00:00.000Z";

describe("released law player controls through saved GameSession (#285)", () => {
  for (const row of RELEASED_ROWS) {
    it(`${row.id}${"region" in row && row.region ? " regional scope" : ""} is selectable, enacted, saved, and continued`, async () => {
      const user = userEvent.setup();
      let session = new GameSession();
      session.create({
        era: row.era,
        countryId: row.countryId,
        seed: `law-285-phone-${row.id}-${"region" in row && row.region ? "regional" : "national"}`,
        playerName: "Policy Chair",
        mode: "hos",
        autonomyLevel: "off",
      });
      const initialProposal = session.legislation().proposals.find((entry) => entry.id === row.id);
      expect(initialProposal, `${row.id} must be in the actual player proposal list`).toBeDefined();
      if (row.id === "us.tax.tariffs") expect(initialProposal?.sponsorNpiCost).toBe(0);
      else expect(initialProposal?.sponsorNpiCost).toBeGreaterThan(0);
      expect(initialProposal?.sponsorAvailable).toBe(false);

      const { LegislationDetailsPanel } = await import("./LegislationDetailsPanel");
      let actionResult: ReturnType<GameSession["act"]> | undefined;
      const onAction = (actionId: string, params?: Record<string, string | number>) => {
        actionResult = session.act(actionId, (params ?? {}) as ExecuteActionParams);
      };
      const { rerender } = render(<LegislationDetailsPanel query={session.legislation()} busy={false} onAction={onAction} />);
      await user.selectOptions(screen.getByLabelText("Available legislation"), row.id);
      expect(screen.getByRole("button", { name: "Sponsor bill" })).toBeDisabled();

      // HoS authority is created through the supported game mode. National
      // influence and action points come from real ordinary refresh phases;
      // no office, electorate, vote, or resource balance is injected.
      let accrualTurns = 0;
      let proposal = session.legislation().proposals.find((entry) => entry.id === row.id);
      while (!proposal?.sponsorAvailable && accrualTurns < 8) {
        session.advance();
        accrualTurns += 1;
        proposal = session.legislation().proposals.find((entry) => entry.id === row.id);
      }
      expect(accrualTurns).toBeGreaterThan(0);
      expect(session.view().resources.nationalInfluence.current).toBeGreaterThanOrEqual(proposal!.sponsorNpiCost);
      expect(proposal?.sponsorAvailable).toBe(true);
      rerender(<LegislationDetailsPanel query={session.legislation()} busy={false} onAction={onAction} />);
      expect(screen.getByRole("button", { name: "Sponsor bill" })).toBeEnabled();

      let expectedLevel: number | undefined;
      let expectedRegionId: string | undefined;
      let firstRate: number | undefined;
      if (proposal!.taxPolicy) {
        const input = screen.getByLabelText("Tax rate");
        const rate = "taxRate" in row ? row.taxRate : proposal!.taxPolicy!.baselineRate + proposal!.taxPolicy!.step;
        firstRate = rate;
        if (proposal!.taxPolicy.options?.length) {
          await user.selectOptions(input, String(rate));
        } else {
          await user.clear(input);
          await user.type(input, String(rate));
        }
      } else {
        const level = proposal!.levels!.find((entry) => entry.index !== proposal!.baselineLevel)!;
        expectedLevel = level.index;
        await user.selectOptions(screen.getByLabelText("Policy level"), `l${level.index}`);
      }

      if ("region" in row && row.region) {
        const region = proposal!.regions![0]!;
        expectedRegionId = region.id;
        await user.selectOptions(screen.getByLabelText("Legislation scope"), `region:${region.id}`);
      }

      await user.click(screen.getByRole("button", { name: "Sponsor bill" }));
      expect(actionResult?.ok, actionResult && !actionResult.ok ? actionResult.error : undefined).toBe(true);
      const enacted = session.legislation().enactedLaws?.find((law) => law.id === row.id);
      expect(enacted).toMatchObject({
        id: row.id,
        ...(expectedLevel === undefined ? {} : { level: expectedLevel }),
        ...(expectedRegionId ? { scope: "regional", regionId: expectedRegionId } : { scope: "national" }),
      });

      const resumed = new GameSession();
      resumed.load(session.serialize(SAVED_AT));
      expect(resumed.legislation().enactedLaws?.find((law) => law.id === row.id)).toEqual(enacted);
      session = resumed;
      const afterFirstSaveTurn = session.view().turn;
      session.advance();
      expect(session.view().turn).toBe(afterFirstSaveTurn + 1);
      let replacementProposal = session.legislation().proposals.find((entry) => entry.id === row.id);
      let replacementTurns = 0;
      while (!replacementProposal?.sponsorAvailable && replacementTurns < 8) {
        session.advance();
        replacementTurns += 1;
        replacementProposal = session.legislation().proposals.find((entry) => entry.id === row.id);
      }
      expect(replacementTurns).toBeLessThan(8);
      expect(replacementProposal?.sponsorAvailable).toBe(true);
      expect(session.view().resources.nationalInfluence.current).toBeGreaterThanOrEqual(replacementProposal!.sponsorNpiCost);
      rerender(<LegislationDetailsPanel query={session.legislation()} busy={false} onAction={onAction} />);

      let replacementLevel: number | undefined;
      let replacementRate: number | undefined;
      if (replacementProposal!.taxPolicy) {
        const input = screen.getByLabelText("Tax rate");
        const options = replacementProposal!.taxPolicy!.options ?? [];
        replacementRate = options.find((option) => option.rate !== firstRate)?.rate;
        if (replacementRate === undefined) {
          const baseline = replacementProposal!.taxPolicy!.baselineRate;
          replacementRate = baseline !== firstRate ? baseline : baseline + replacementProposal!.taxPolicy!.step;
        }
        expect(replacementRate).not.toBe(firstRate);
        if (options.length) await user.selectOptions(input, String(replacementRate));
        else {
          await user.clear(input);
          await user.type(input, String(replacementRate));
        }
      } else {
        const level = replacementProposal!.levels!.find((entry) => entry.index !== expectedLevel)!;
        replacementLevel = level.index;
        await user.selectOptions(screen.getByLabelText("Policy level"), `l${level.index}`);
      }
      await user.click(screen.getByRole("button", { name: "Sponsor bill" }));
      expect(actionResult?.ok, actionResult && !actionResult.ok ? actionResult.error : undefined).toBe(true);
      const currentQuery = session.legislation();
      const activeRows = currentQuery.enactedLaws?.filter((law) => law.id === row.id) ?? [];
      expect(activeRows).toHaveLength(1);
      expect(activeRows[0]).toMatchObject({
        id: row.id,
        ...(replacementLevel === undefined ? {} : { level: replacementLevel }),
        ...(expectedRegionId ? { scope: "regional", regionId: expectedRegionId } : { scope: "national" }),
      });
      if (replacementRate !== undefined) {
        const replacementBill = currentQuery.bills?.filter((bill) => bill.legislationTypeId === row.id).at(-1);
        expect(replacementBill?.selectedRate).toBe(replacementRate);
      }

      const replacedSave = new GameSession();
      replacedSave.load(session.serialize(SAVED_AT));
      expect(replacedSave.legislation().enactedLaws?.filter((law) => law.id === row.id))
        .toEqual(activeRows);
      const beforeReplacementAdvance = replacedSave.view().turn;
      replacedSave.advance();
      expect(replacedSave.view().turn).toBe(beforeReplacementAdvance + 1);
      expect(replacedSave.legislation().enactedLaws?.filter((law) => law.id === row.id))
        .toEqual(activeRows);
    });
  }
});
