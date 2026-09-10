/** Read the pinned Game registry without evaluating it or changing its checkout. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const revision = 'd4baf899fd8bd529099f03d7410807143604e2e5';
const sourcePath = 'src/lib/constants/countries.ts';
const gameRoot = process.argv[2];
if (!gameRoot) throw new Error('Usage: node scripts/export-office-registry.mjs /path/to/AHDGame');
const source = execFileSync('git', ['-C', gameRoot, 'show', `${revision}:${sourcePath}`], { encoding: 'utf8' });
const file = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true);
let registry;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'COUNTRY_CONFIGS') registry = node.initializer;
  ts.forEachChild(node, visit);
}
visit(file);
if (!registry || !ts.isObjectLiteralExpression(registry)) throw new Error('COUNTRY_CONFIGS must be an object literal');
function properties(node) {
  if (!ts.isObjectLiteralExpression(node)) throw new Error('Expected a literal registry record');
  return Object.fromEntries(node.properties.map(property => {
    if (!ts.isPropertyAssignment(property)) throw new Error('Unexpected computed/spread registry property');
    return [property.name.getText(file).replace(/^['"]|['"]$/g, ''), property.initializer];
  }));
}
const entries = [];
const executives = {};
for (const [countryId, country] of Object.entries(properties(registry))) {
  const offices = properties(country).officeTypes;
  if (!offices || !ts.isArrayLiteralExpression(offices)) throw new Error(`Missing literal offices: ${countryId}`);
  for (const office of offices.elements) {
    const row = properties(office);
    if (!row.key || !ts.isStringLiteral(row.key) || !row.actionBonus || !ts.isNumericLiteral(row.actionBonus)) {
      throw new Error(`Non-literal office key or action bonus: ${countryId}`);
    }
    entries.push({ countryId, officeType: row.key.text, actionBonus: Number(row.actionBonus.text) });
    if (row.isExecutive?.kind === ts.SyntaxKind.TrueKeyword && row.isSubNational?.kind === ts.SyntaxKind.FalseKeyword) {
      executives[countryId] ??= row.key.text;
    }
  }
  if (!executives[countryId]) throw new Error(`Missing executive office: ${countryId}`);
}
const lines = [
  '/**',
  ' * GENERATED from AHDGame office types; do not hand-edit.',
  ` * Source: ${sourcePath} at ${revision}.`,
  ` * Source sha256: ${createHash('sha256').update(source).digest('hex')}.`,
  ' * Regenerate: node scripts/export-office-registry.mjs /path/to/AHDGame',
  ' * Exports action bonuses and the first national executive office, matching',
  ' * officeBonusRegistry and getExecutiveOfficeKey(countryId) used by appointments.',
  ' * Era-specific overrides are not used by that appointment call in the reference.',
  ' */', '',
  'export interface OfficeRegistryEntry { countryId: string; officeType: string; actionBonus: number }', '',
  'export const OFFICE_REGISTRY: readonly OfficeRegistryEntry[] = [',
  ...entries.map(({ countryId, officeType, actionBonus }) => `  { countryId: "${countryId}", officeType: "${officeType}", actionBonus: ${actionBonus} },`),
  '];', '',
  'export const EXECUTIVE_OFFICE_BY_COUNTRY: Readonly<Record<string, string>> = {',
  ...Object.entries(executives).map(([countryId, officeType]) => `  ${countryId}: "${officeType}",`),
  '};', '',
];
process.stdout.write(lines.join('\n'));
