const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const suppliedRoot = process.argv[2];
if (!suppliedRoot) throw new Error("Usage: node scripts/export-eastern-layer1.cjs <immutable-AHDGame-source-directory>");
const root = path.resolve(suppliedRoot);
const sourceRoot = path.join(root, "src");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith("@/")) request = path.join(sourceRoot, request.slice(2));
  if (request.startsWith("@shared/")) request = path.join(root, "shared", request.slice(8));
  return resolveFilename.call(this, request, parent, isMain, options);
};
require.extensions[".ts"] = function (module, filename) {
  const input = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(input, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  module._compile(output, filename);
};

const { getCountryLayer1Model, buildModelRegionDemographics } = require(path.join(sourceRoot, "lib/seeds/international/index.ts"));
const countries = ["PL", "CS", "HU", "RO", "BG", "YU", "UKR", "BLR", "BAL"];
const result = {};
for (const era of ["1953", "1979"]) {
  for (const country of countries) {
    const model = getCountryLayer1Model(country, era);
    if (!model) throw new Error(`Missing source model ${country} ${era}`);
    result[`${era}:${country}`] = buildModelRegionDemographics(model).map(
      ({ _id, countryId, categoryWeights, groups }) => ({ _id, countryId, categoryWeights, groups }),
    );
  }
}
process.stdout.write(JSON.stringify(result));
