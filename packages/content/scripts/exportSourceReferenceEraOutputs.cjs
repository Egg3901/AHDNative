/**
 * Export the actual AHDGame source producers for unshipped 1999/2007/2023
 * reference presets without pretending their 2020 seat fallback is historical.
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
require(path.join(sourceRoot, 'node_modules/tsconfig-paths')).register({
  baseUrl: sourceRoot,
  paths: { '@/*': ['src/*'], '@shared/*': ['shared/*'] },
});
const { getPresetSeats } = require(path.join(sourceRoot, 'src/lib/constants/historicalSeats.ts'));
const { getNationalBudgetSeedConfigsForPreset } = require(path.join(sourceRoot, 'src/lib/seeds/reference/budgets.ts'));
const { tierFor } = require(path.join(sourceRoot, 'src/lib/world/eraRoster.ts'));
const { COUNTRY_ORDER } = require(path.join(sourceRoot, 'src/lib/constants/countries.ts'));
const { states2023 } = require(path.join(sourceRoot, 'src/lib/seeds/reference/states2023.ts'));
const { stateCensusData2023 } = require(path.join(sourceRoot, 'src/lib/countries/us/data/usStateCensusData2023.ts'));
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

const artifact = {
  provenance: {
    sourceRepository: 'Egg3901/AHDGame',
    sourceCommit: EXPECTED_SOURCE_REVISION,
    sourceFiles: [
      'src/lib/constants/historicalSeats.ts#getPresetSeats',
      'src/lib/seeds/reference/budgets.ts#getNationalBudgetSeedConfigsForPreset',
      'src/lib/world/eraRoster.ts#tierFor',
    ],
    nativeExportScope: 'Source-returned preset roster and budget outputs plus explicit 2020 seat fallback; not complete playable packs.',
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
  },
  eras,
};
fs.writeFileSync(nativeOutput, `${JSON.stringify(artifact)}\n`);
console.log(JSON.stringify({
  output: nativeOutput,
  eras: eras.map(({ year, playerCountries, historicalSeatOutput, budgetOutput }) => ({
    year, playerCountries, seatRows: historicalSeatOutput.rowCount,
    seatHash: historicalSeatOutput.sha256, seatFallbacks: historicalSeatOutput.recordedFallbacks,
    budgetRows: budgetOutput.rowCount, budgetHash: budgetOutput.sha256,
  })),
  sharedSeatHash,
  us2023Regions: states2023.length,
  us2023DemographicStates: Object.keys(stateCensusData2023).length,
}, null, 2));
