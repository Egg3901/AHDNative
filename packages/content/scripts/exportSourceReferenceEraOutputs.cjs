/**
 * Export actual AHDGame producer outputs used to build Native's 1999/2007/2023
 * packs, while preserving the source's 2019 and 2020 fallback identities.
 *
 * Run from a clean AHDGame checkout pinned to the provenance revision:
 *   node --require ./node_modules/tsx/dist/cjs/index.cjs \
 *     /path/to/AHDNative/packages/content/scripts/exportSourceReferenceEraOutputs.cjs \
 *     "$(git rev-parse HEAD)"
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const EXPECTED_SOURCE_REVISION = 'c35bcd86cbdbb877e73a0e9a45b0726605bdbc7a';
const sourceRoot = process.cwd();
const suppliedRevision = process.argv[2];
if (suppliedRevision !== EXPECTED_SOURCE_REVISION) {
  throw new Error(`Expected AHDGame ${EXPECTED_SOURCE_REVISION}; received ${String(suppliedRevision)}`);
}
const nativeOutput = path.resolve(__dirname, '../src/packs/sourceReferenceEraOutputs.json');
const nativeDemographicsOutput = path.resolve(__dirname, '../../engine/src/demographics/usStateDemographics2023.ts');
require(path.join(sourceRoot, 'node_modules/tsconfig-paths')).register({
  baseUrl: sourceRoot,
  paths: { '@/*': ['src/*'], '@shared/*': ['shared/*'] },
});
const { getPresetSeats } = require(path.join(sourceRoot, 'src/lib/constants/historicalSeats.ts'));
const { getNationalBudgetSeedConfigsForPreset } = require(path.join(sourceRoot, 'src/lib/seeds/reference/budgets.ts'));
const { tierFor } = require(path.join(sourceRoot, 'src/lib/world/eraRoster.ts'));
const { partySeedsForPreset } = require(path.join(sourceRoot, 'src/lib/seeds/partySeedRegistry.ts'));
const { getInitialRatesForYear } = require(path.join(sourceRoot, 'src/lib/constants/currencies.ts'));
const { COUNTRY_ORDER } = require(path.join(sourceRoot, 'src/lib/constants/countries.ts'));
const { SENATE_CLASSES_BY_STATE } = require(path.join(sourceRoot, 'src/lib/constants/states.ts'));
const { states2023 } = require(path.join(sourceRoot, 'src/lib/seeds/reference/states2023.ts'));
const { stateCensusData2023 } = require(path.join(sourceRoot, 'src/lib/countries/us/data/usStateCensusData2023.ts'));
const jpRegionsByYear = Object.fromEntries([1999, 2007, 2023].map((year) => {
  const module = require(path.join(sourceRoot, `src/lib/countries/jp/data/jpRegions${year}.ts`));
  const rows = module[`jpRegions${year}`];
  if (!Array.isArray(rows) || rows.length !== 8) throw new Error(`Expected eight source JP regions for ${year}`);
  return [year, rows.map((row) => ({
    id: row._id,
    name: row.name,
    countryId: row.countryId,
    population: row.population,
    gdp: row.gdp,
    houseSeats: row.houseDistricts,
    senateSeats: row.stateSenateSeats,
    region: row.region,
    votingSystem: row.votingSystem,
  }))];
}));
const { buildAllRegistrationSeeds } = require(path.join(sourceRoot, 'src/lib/seeds/registration/registrationLanes.ts'));
const { generateStateDemographicsForTest } = require(path.join(sourceRoot, 'src/lib/seeds/stateDemographics.ts'));
const { getPresetFallbacks, resetPresetFallbacks } = require(path.join(sourceRoot, 'src/lib/seeds/presetSelector.ts'));
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

const years = [1999, 2007, 2023];
let sharedSeatRoster;
let sharedSeatHash;
const eras = years.map((year) => {
  const preset = `${year}-default`;
  resetPresetFallbacks();
  const seats = getPresetSeats(preset);
  const seatFallbacks = getPresetFallbacks();
  if (sharedSeatRoster && hash(seats) !== sharedSeatHash) throw new Error(`${preset} seat fallback changed`);
  if (!sharedSeatRoster) {
    sharedSeatRoster = seats;
    sharedSeatHash = hash(seats);
  }
  // The source resolver returns records backed by shared mutable tables;
  // freeze this preset's actual output before requesting the next preset.
  const budgets = JSON.parse(JSON.stringify(getNationalBudgetSeedConfigsForPreset(preset).map((row) => ({
    ...row,
    economicFactors: {
      ...row.economicFactors,
      lastUpdated: row.economicFactors.lastUpdated instanceof Date && row.economicFactors.lastUpdated.getTime() !== 0
        ? '<runtime-generated-at-source-seed>'
        : row.economicFactors.lastUpdated,
    },
  }))));
  return {
    year,
    preset,
    playerCountries: COUNTRY_ORDER.filter((id) => tierFor(preset, id) === 'player'),
    sourceYearElectorateAnchor: year,
    initialExchangeRates: year === 1999 || year === 2007 || year === 2023
      ? getInitialRatesForYear(year)
      : undefined,
    historicalSeatOutput: {
      sharedDataKey: 'historicalSeatRoster2020Fallback',
      rowCount: seats.length,
      sha256: hash(seats),
      recordedFallbacks: seatFallbacks,
    },
    budgetOutput: {
      rowCount: budgets.length,
      sha256: hash(budgets),
      rows: budgets,
    },
  };
});

const registrationByState = new Map(buildAllRegistrationSeeds()
  .filter((row) => row.countryId === 'US')
  .map((row) => [row.stateId, row]));
const us2023StatePack = states2023.map((state) => {
  const registration = registrationByState.get(state._id);
  if (!registration) throw new Error(`2023 US state has no source registration lane: ${state._id}`);
  return {
    id: state._id,
    name: state.name,
    countryId: state.countryId,
    population: state.population,
    gdp: state.gdp,
    houseSeats: state.houseDistricts,
    senateSeats: state.stateSenateSeats,
    region: state.region,
    // DC has no state Senate class; [1, 2] is the pack's existing neutral
    // placeholder convention for non-staggered jurisdictions.
    senateClasses: SENATE_CLASSES_BY_STATE[state._id] ?? [1, 2],
    registration: {
      parties: registration.parties.map(({ abbr, org, reg }) => ({ abbr, org, reg })),
      independent: registration.independent,
      unregistered: registration.unregistered,
      unaffiliatedOrg: registration.unaffiliatedOrg,
    },
  };
});
const us2023Demographics = Object.entries(stateCensusData2023).map(([stateId, config]) =>
  (({ categoryWeights, groups }) => ({ stateId, categoryWeights, groups }))(
    generateStateDemographicsForTest(stateId, config, '2023', { layer1Positions: false })
  )
);
const sourcePartyRosters = years.map((year) => {
  const preset = `${year}-default`;
  return {
    year,
    preset,
    countries: ['US', 'UK'].map((countryId) => ({
      countryId,
      rows: partySeedsForPreset(countryId, preset).map((party) => ({
        id: `${countryId}_${party.abbreviation}`,
        name: party.name,
        countryId,
        abbreviation: party.abbreviation,
        color: party.color,
        economicPosition: party.economicPosition,
        socialPosition: party.socialPosition,
      })),
    })),
  };
});

const artifact = {
  provenance: {
    sourceRepository: 'Egg3901/AHDGame',
    sourceCommit: EXPECTED_SOURCE_REVISION,
    sourceFiles: [
      'src/lib/constants/historicalSeats.ts#getPresetSeats',
      'src/lib/seeds/reference/budgets.ts#getNationalBudgetSeedConfigsForPreset',
      'src/lib/world/eraRoster.ts#tierFor',
      'src/lib/constants/currencies.ts#getInitialRatesForYear',
      'src/lib/seeds/partySeedRegistry.ts#partySeedsForPreset',
      'src/lib/seeds/registration/registrationLanes.ts#buildAllRegistrationSeeds',
      'src/lib/seeds/stateDemographics.ts#generateStateDemographicsForTest',
      ...[1999, 2007, 2023].map((year) => `src/lib/countries/jp/data/jpRegions${year}.ts#jpRegions${year}`),
    ],
    nativeExportScope: 'Source-returned preset roster, budget, party, exchange-rate, 2023 state/demographic outputs plus explicit 2020 seat fallback; playable SeedPack assembly and unsupported system disclosure remain separate.',
    normalizedRuntimeFields: ['budgetOutput.rows[].economicFactors.lastUpdated: source assigns current seed time; non-epoch Date values use a stable marker.'],
  },
  historicalSeatRoster2020Fallback: {
    sourceProducer: 'getPresetSeats(unknown preset) -> seatGroupsFor default 2020 composition',
    rowCount: sharedSeatRoster.length,
    sha256: sharedSeatHash,
    rows: sharedSeatRoster,
  },
  us2023StateContent: {
    sourceFiles: [
      'src/lib/seeds/reference/states2023.ts#states2023',
      'src/lib/countries/us/data/usStateCensusData2023.ts#stateCensusData2023',
    ],
    regionOutput: { rowCount: states2023.length, sha256: hash(states2023), rows: states2023 },
    demographicOutput: { stateCount: Object.keys(stateCensusData2023).length, sha256: hash(stateCensusData2023), states: stateCensusData2023 },
    playablePackOutput: { rowCount: us2023StatePack.length, sha256: hash(us2023StatePack), rows: us2023StatePack },
    generatedDemographics: { rowCount: us2023Demographics.length, sha256: hash(us2023Demographics), rows: us2023Demographics },
    registrationSource: 'buildAllRegistrationSeeds current/default lane (the source has no 2023-specific registration builder)',
    senateClassSource: 'SENATE_CLASSES_BY_STATE; non-state DC uses the existing neutral [1,2] placeholder convention',
  },
  jpRegionalContent: {
    sourceFiles: [1999, 2007, 2023].map((year) => `src/lib/countries/jp/data/jpRegions${year}.ts#jpRegions${year}`),
    presets: Object.entries(jpRegionsByYear).map(([year, rows]) => ({
      year: Number(year), rowCount: rows.length, sha256: hash(rows), rows,
    })),
    registrationSource: 'Native retains its existing 2019 StateSeed registration estimates by stable JP region id; AHDGame JP region bundles author geography/economy/seats, not StateSeed registration fields.',
  },
  sourcePlayerPartyRosters: {
    sourceFile: 'src/lib/seeds/partySeedRegistry.ts#partySeedsForPreset',
    presets: sourcePartyRosters,
    sha256: hash(sourcePartyRosters),
  },
  eras,
};
fs.writeFileSync(nativeOutput, `${JSON.stringify(artifact)}\n`);
const typeScriptDemographics = [
  'import type { StateDemographicsSeed } from "./usStateDemographics1953.js";',
  '/**',
  ' * US state demographics for 2023. Generated from current AHDGame source. Do not edit by hand.',
  ` * Source: ${EXPECTED_SOURCE_REVISION} src/lib/countries/us/data/usStateCensusData2023.ts + src/lib/seeds/stateDemographics.ts#generateStateDemographicsForTest.`,
  ' * Uses the source default registration lane and Layer-1 positions disabled, matching the public 2023 preset producer.',
  ' */',
  'export const US_STATE_DEMOGRAPHICS_2023: StateDemographicsSeed[] = [',
  ...us2023Demographics.map((row) => `  ${JSON.stringify(row)},`),
  '];',
  '',
].join('\n');
fs.writeFileSync(nativeDemographicsOutput, typeScriptDemographics);
console.log(JSON.stringify({
  output: nativeOutput,
  demographicsOutput: nativeDemographicsOutput,
  eras: eras.map(({ year, playerCountries, historicalSeatOutput, budgetOutput }) => ({
    year, playerCountries, seatRows: historicalSeatOutput.rowCount,
    seatHash: historicalSeatOutput.sha256, seatFallbacks: historicalSeatOutput.recordedFallbacks,
    budgetRows: budgetOutput.rowCount, budgetHash: budgetOutput.sha256,
  })),
  sharedSeatHash,
  us2023Regions: states2023.length,
  us2023DemographicStates: Object.keys(stateCensusData2023).length,
  us2023PackStates: us2023StatePack.length,
  us2023PackHash: hash(us2023StatePack),
  us2023GeneratedDemographics: us2023Demographics.length,
  partyRosterSha256: hash(sourcePartyRosters),
}, null, 2));
