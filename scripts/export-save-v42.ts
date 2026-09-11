/**
 * Local developer interchange: project a save envelope to authentic schema 42.
 *
 *   npx tsx scripts/export-save-v42.ts --input <save.json> --output <v42.save.json>
 *
 * Local filesystem use only. Not a browser or native export, and not AHDGame
 * parity. Calls projectSaveToV42 (engine public projector, re-exported from
 * src/game/saveCompatibility.ts) and writes the projected bytes verbatim on
 * success only. Refuses without creating output when the projection fails
 * closed, never overwrites an existing file (exclusive create), and never
 * overwrites the input. Prints no world content, only concise errors.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { projectSaveToV42 } from "../src/game/saveCompatibility";

const USAGE = `usage: npx tsx scripts/export-save-v42.ts --input <save.json> --output <v42.save.json>

Project a save envelope to schema 42 for local developer interchange.
Authentic v42 fixtures stay byte-identical. Native-fresh pre-turn worlds
are written as the keep-home extension document. Writes the projected
bytes verbatim on success only, never overwrites an existing file, and
never overwrites the input.

  --input <path>   save file to read (authentic schema 42, or projectable current Native schema)
  --output <path>  new file to create; refused when it already exists
  --help, -h       print this usage
`;

function fail(message: string, code = 1): never {
  process.stderr.write(`export-save-v42: ${message}\n`);
  process.exit(code);
}

function usageError(message: string): never {
  process.stderr.write(`export-save-v42: ${message}\n${USAGE}`);
  process.exit(2);
}

function takeValue(flag: string, arg: string, next: string | undefined): string {
  if (arg.startsWith(`${flag}=`)) return arg.slice(flag.length + 1);
  if (next === undefined || next.startsWith("--")) usageError(`missing value for ${flag}`);
  return next;
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(USAGE);
    return;
  }
  let input: string | undefined;
  let output: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input" || arg.startsWith("--input=")) {
      input = takeValue("--input", arg, argv[i + 1]);
      if (arg === "--input") i += 1;
    } else if (arg === "--output" || arg.startsWith("--output=")) {
      output = takeValue("--output", arg, argv[i + 1]);
      if (arg === "--output") i += 1;
    } else {
      usageError(`unknown argument: ${arg}`);
    }
  }
  if (!input || !output) usageError("both --input and --output are required");
  const inputPath = resolve(input);
  const outputPath = resolve(output);
  if (inputPath === outputPath) {
    fail("input and output are the same file; refusing to overwrite the source");
  }
  let contents: string;
  try {
    contents = readFileSync(inputPath, "utf8");
  } catch {
    fail(`cannot read input file: ${input}`);
  }
  const projected = projectSaveToV42(contents);
  if (!projected.ok) fail(projected.error);
  try {
    writeFileSync(outputPath, projected.contents, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "EEXIST") {
      fail(`output file already exists, refusing to overwrite: ${output}`);
    }
    fail(`cannot write output file: ${output}`);
  }
  process.stdout.write(`export-save-v42: wrote schema 42 save to ${output}\n`);
}

main();
