import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CABINET_POSITIONS_BY_COUNTRY } from "../src/cabinet/constants.js";

const SOURCE_REVISION = "e364c04954ed628beef73a993a8e9e156650a31e";
const SOURCE_FILES = {
  US: "src/lib/constants/usCabinetOrders.ts",
  UK: "src/lib/constants/ukCabinetOrders.ts",
  DE: "src/lib/constants/deCabinetOrders.ts",
  IE: "src/lib/constants/ieCabinetOrders.ts",
  JP: "src/lib/constants/jpCabinetOrders.ts",
  CN: "src/lib/constants/cnCabinetOrders.ts",
} as const;
const EXPORTS = {
  US: "US_MINISTERIAL_ORDERS",
  UK: "UK_MINISTERIAL_ORDERS",
  DE: "DE_MINISTERIAL_ORDERS",
  IE: "IE_MINISTERIAL_ORDERS",
  JP: "JP_MINISTERIAL_ORDERS",
  CN: "CN_MINISTERIAL_ORDERS",
} as const;

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const sourceRoot = option("--source-root");
if (!sourceRoot) throw new Error("Usage: npx tsx packages/engine/scripts/generateMinisterialOrderCatalog.ts --source-root /path/to/AHDGame [--check]");
const absoluteSourceRoot = resolve(sourceRoot);
const revision = execFileSync("git", ["-C", absoluteSourceRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (revision !== SOURCE_REVISION) throw new Error(`AHDGame must be checked out at ${SOURCE_REVISION}; found ${revision}`);

const catalog: Record<string, unknown> = {};
for (const countryId of Object.keys(SOURCE_FILES) as Array<keyof typeof SOURCE_FILES>) {
  const modulePath = resolve(absoluteSourceRoot, SOURCE_FILES[countryId]);
  const sourceModule = await import(pathToFileURL(modulePath).href);
  catalog[countryId] = sourceModule[EXPORTS[countryId]];
}

const nativeProjection = Object.fromEntries(Object.entries(catalog).map(([countryId, positions]) => [
  countryId,
  Object.fromEntries(CABINET_POSITIONS_BY_COUNTRY[countryId]!.map((position) => [
    position.id,
    (positions as Record<string, unknown[]>)[position.id] ?? [],
  ])),
]));
const projectionHash = createHash("sha256").update(JSON.stringify(nativeProjection)).digest("hex");

const command = "npx tsx packages/engine/scripts/generateMinisterialOrderCatalog.ts --source-root /path/to/AHDGame";
const content = `/**\n * GENERATED FILE. DO NOT EDIT.\n * AHDGame revision: ${SOURCE_REVISION}\n * Native-position projection SHA-256: ${projectionHash}\n * Sources:\n${Object.values(SOURCE_FILES).map((path) => ` * - ${path}`).join("\n")}\n * Regenerate: ${command}\n */\nexport const AUTHORED_MINISTERIAL_ORDERS = ${JSON.stringify(catalog, null, 2)} as const;\n`;
const outputPath = fileURLToPath(new URL("../src/ministerialOrders/catalogData.ts", import.meta.url));

if (process.argv.includes("--check")) {
  if (readFileSync(outputPath, "utf8") !== content) throw new Error("catalogData.ts is stale; run the documented regeneration command");
} else {
  writeFileSync(outputPath, content);
}
