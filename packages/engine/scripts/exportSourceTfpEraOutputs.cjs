/**
 * Export the exact six TFP leaves consumed from AHDGame US state-metric
 * bundles for the 1999, 2007, and 2023 presets, including metric-preset
 * overlays selected by the source seeder.
 *
 * Run from a clean, pinned AHDGame checkout:
 *   node --require ./node_modules/tsx/dist/cjs/index.cjs \
 *     /path/to/AHDNative/packages/engine/scripts/exportSourceTfpEraOutputs.cjs \
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
require(path.join(sourceRoot, 'node_modules/tsconfig-paths')).register({
  baseUrl: sourceRoot,
  paths: { '@/*': ['src/*'], '@shared/*': ['shared/*'] },
});
const { stateMetrics1999 } = require(path.join(sourceRoot, 'src/lib/countries/us/data/usStateMetrics1999.ts'));
const { stateMetrics2007 } = require(path.join(sourceRoot, 'src/lib/countries/us/data/usStateMetrics2007.ts'));
const { stateMetrics2023 } = require(path.join(sourceRoot, 'src/lib/countries/us/data/usStateMetrics2023.ts'));
const { getRegionMetricPresets, applyMetricPresetToMetrics } = require(path.join(sourceRoot, 'src/lib/seeds/metricPresets.ts'));
const { US_GEOGRAPHY } = require(path.join(sourceRoot, 'src/lib/countries/us/geography.ts'));
const fields = {
  rdIntensity: ['economic', 'rdIntensity'],
  workforceSkill: ['education', 'workforceSkill'],
  transportEfficiency: ['infrastructure', 'transportEfficiency'],
  broadbandAccess: ['infrastructure', 'broadbandAccess'],
  powerGridReliability: ['infrastructure', 'powerGridReliability'],
  urbanizationRate: ['population', 'urbanizationRate'],
};
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rows = [];
const availableMetricPresets = Object.keys(US_GEOGRAPHY.metricPresets);
const metricPresetResolution = {
  requestedPresets: [],
  selectedBundles: [],
  reason: 'getRegionMetricPresets selects the requested US metric bundle or its source 2019-default fallback.',
};
for (const [year, docs] of [[1999, stateMetrics1999], [2007, stateMetrics2007], [2023, stateMetrics2023]]) {
  const preset = `${year}-default`;
  const selectedBundle = availableMetricPresets.includes(preset) ? preset : '2019-default';
  if (!availableMetricPresets.includes(selectedBundle)) throw new Error(`Missing source US metric bundle: ${selectedBundle}`);
  metricPresetResolution.requestedPresets.push(preset);
  metricPresetResolution.selectedBundles.push(selectedBundle);
  const eraRows = docs.filter((doc) => doc.countryId === 'US').map((doc) => {
    const overlay = getRegionMetricPresets('US', String(doc._id), preset);
    const resolved = overlay ? applyMetricPresetToMetrics(doc, overlay) : doc;
    const metrics = {};
    for (const [key, [category, field]] of Object.entries(fields)) {
      const value = resolved[category]?.[field]?.value;
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`${preset}/${String(doc._id)} lacks ${category}.${field}`);
      }
      metrics[key] = value;
    }
    return { stateId: String(doc._id), metrics };
  }).sort((left, right) => left.stateId.localeCompare(right.stateId));
  rows.push({ year, preset, rowCount: eraRows.length, sha256: hash(eraRows), rows: eraRows });
}
const artifact = {
  provenance: {
    sourceRepository: 'Egg3901/AHDGame',
    sourceCommit: EXPECTED_SOURCE_REVISION,
    sourceFiles: [
      'src/lib/admin/seed/seedRegionMetrics.ts#seedRegionMetrics',
      'src/lib/countries/us/data/usStateMetrics1999.ts#stateMetrics1999',
      'src/lib/countries/us/data/usStateMetrics2007.ts#stateMetrics2007',
      'src/lib/countries/us/data/usStateMetrics2023.ts#stateMetrics2023',
      'src/lib/seeds/metricPresets.ts#getRegionMetricPresets',
      'src/lib/seeds/metricPresets.ts#applyMetricPresetToMetrics',
    ],
    nativeScope: 'The six regional TFP leaves used by the Native macro TFP basket. Source era state metrics are resolved through the same US metric-preset overlay lookup as seedRegionMetrics.',
    normalizedFields: [],
  },
  metricPresetResolution,
  eras: rows,
};
const output = path.resolve(__dirname, '../src/metrics/tfpSourceEraFixtures.json');
fs.writeFileSync(output, `${JSON.stringify(artifact)}\n`);
console.log(JSON.stringify({ output, eras: rows.map(({ year, rowCount, sha256 }) => ({ year, rowCount, sha256 })), metricPresetResolution: artifact.metricPresetResolution }, null, 2));
