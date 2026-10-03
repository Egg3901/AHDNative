import type { BudgetSeed, PartySeed, SeedPack, StateSeed } from "../types.js";
import sourceOutputs from "./sourceReferenceEraOutputs.json" with { type: "json" };
import { pack2019 } from "./2019.js";
import { ROSTER_2019_PARTIES, ROSTER_2019_STATES } from "./roster2019.js";
import { ukRegions2019 } from "./ukRegions2019.js";
import { usStates2019 } from "./usStates2019.js";
import { US_CORPORATION_HEADQUARTERS_REGIONS } from "./corporationHeadquarters.js";
import { BUDGETS_1999 } from "./budgets1999.js";
import { BUDGETS_2007 } from "./budgets2007.js";
import { BUDGETS_2023 } from "./budgets2023.js";

interface SourceEraOutput {
  year: number;
  preset: string;
  initialExchangeRates: Record<string, number>;
  budgetOutput: { rows: Array<{ countryId: string; sourceFiscalYear?: number }> };
}

interface SourceEraExport {
  provenance: { sourceRepository: string; sourceCommit: string };
  eras: SourceEraOutput[];
  us2023StateContent: { playablePackOutput: { rows: StateSeed[] } };
  sourcePlayerPartyRosters: {
    presets: Array<{
      year: number;
      countries: Array<{ countryId: string; rows: PartySeed[] }>;
    }>;
  };
}

const SOURCE = sourceOutputs as unknown as SourceEraExport;

function sourceEra(year: 1999 | 2007 | 2023): SourceEraOutput {
  const output = SOURCE.eras.find((row) => row.year === year);
  if (!output || output.preset !== `${year}-default`) {
    throw new Error(`Missing pinned AHDGame source output for ${year}-default`);
  }
  return output;
}

function playerParties(year: number): PartySeed[] {
  const preset = SOURCE.sourcePlayerPartyRosters.presets.find((row) => row.year === year);
  if (!preset) throw new Error(`Missing source party roster for ${year}-default`);
  return preset.countries.flatMap((country) => country.rows);
}

function budgetsBySourceEconomy(pack: SeedPack, budgets: BudgetSeed[], year: 1999 | 2007 | 2023): void {
  const rates = sourceEra(year).initialExchangeRates;
  for (const country of pack.countries) {
    const budget = budgets.find((row) => row.countryId === country.id);
    const rate = rates[country.id];
    if (!budget || rate === undefined || !Number.isFinite(rate) || rate <= 0) {
      throw new Error(`Missing source budget/FX output for ${year}/${country.id}`);
    }
    country.economy = {
      ...country.economy,
      gdp: budget.gdp / rate / 1_000_000,
      growthRate: budget.economicFactors.gdpGrowth / 100,
      inflationRate: budget.economicFactors.inflationRate / 100,
    };
  }
}

function buildEraPack(
  year: 1999 | 2007 | 2023,
  budgets: BudgetSeed[],
): SeedPack {
  const pack = structuredClone(pack2019);
  const source = sourceEra(year);
  pack.era = {
    id: String(year),
    label: `${year} Start Date - Default Parties`,
    startDate: `${year}-01-01`,
  };
  pack.sourceProvenance = {
    sourceRepository: SOURCE.provenance.sourceRepository,
    sourceCommit: SOURCE.provenance.sourceCommit,
    sourcePreset: source.preset,
    lanes: {
      countryRoster: "Native's bounded 2019 country/economy roster; no broader AHDGame country manifest is claimed.",
      countryEconomy: "Source preset national-budget rows and getInitialRatesForYear; unemployment retains the documented 2019 Native baseline because the source budget schema has no unemployment field.",
      budgets: "Source getNationalBudgetSeedConfigsForPreset output; BudgetSeed.sourceFiscalYear preserves inherited source rows.",
      parties: "Source partySeedsForPreset filtered directly for this preset; US and UK use source-returned rows.",
      legislature: "Source getPresetSeats fallback is the 2020 historical seat roster for these presets.",
      states: year === 2023
        ? "US uses source states2023 and source buildAllRegistrationSeeds default lane; UK and non-player regional lanes retain the 2019 Native bundle."
        : "Source preset selector falls back to 2019-default for missing regional/state bundles; Native retains that exact lane and identifies it as fallback.",
      cycle: `Source preset starts in ${year}; Native meta.startingYear and 48-turn year clock use the same year anchor.`,
      demographics: year === 2023
        ? "US Layer-1 rows are generated from source stateCensusData2023; UK/non-US rows retain their declared 2019 fallback."
        : "Source preset selector falls back to 2019-default for missing demographic bundles.",
    },
  };
  pack.budgets = structuredClone(budgets);
  pack.parties = [
    ...ROSTER_2019_PARTIES.filter((party) => party.countryId !== "US" && party.countryId !== "UK"),
    ...playerParties(year),
  ];
  if (year === 2023) {
    const sourceStates = SOURCE.us2023StateContent.playablePackOutput.rows;
    pack.states = [
      ...ROSTER_2019_STATES.filter((state) => state.countryId !== "US" && state.countryId !== "UK"),
      ...structuredClone(sourceStates),
      ...structuredClone(ukRegions2019),
    ];
  } else {
    pack.states = [...ROSTER_2019_STATES, ...usStates2019, ...ukRegions2019];
  }
  pack.corporationHeadquartersRegions = [...US_CORPORATION_HEADQUARTERS_REGIONS];
  budgetsBySourceEconomy(pack, budgets, year);
  return pack;
}

export const pack1999 = buildEraPack(1999, BUDGETS_1999);
export const pack2007 = buildEraPack(2007, BUDGETS_2007);
export const pack2023 = buildEraPack(2023, BUDGETS_2023);
