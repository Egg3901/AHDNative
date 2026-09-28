import { readFileSync, copyFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function syncIosIcons(appleDirectory, sourceDirectory) {
  const catalogs = [];
  function visit(directory) {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      if (!item.isDirectory()) continue;
      const path = join(directory, item.name);
      if (item.name === "AppIcon.appiconset") catalogs.push(path);
      else visit(path);
    }
  }
  visit(appleDirectory);
  if (catalogs.length !== 1) throw new Error("Expected one generated iOS AppIcon catalog");
  const catalog = catalogs[0];
  const entries = JSON.parse(readFileSync(join(catalog, "Contents.json"), "utf8")).images;
  if (!entries?.length) throw new Error("Empty iOS AppIcon catalog");
  const copies = entries.map((entry) => {
    if (!entry.filename || entry.filename !== entry.filename.split(/[\\/]/).pop()) {
      throw new Error("Every icon slot must reference a local PNG");
    }
    // Tauri's template repeats equal-size phone/tablet files with a -1 suffix.
    const source = join(sourceDirectory, entry.filename.replace(/-1(?=\.png$)/, ""));
    const bytes = readFileSync(source);
    if (bytes[24] !== 8 || bytes[25] !== 2) {
      throw new Error(`iOS icons must be opaque 8-bit RGB without alpha: ${entry.filename}`);
    }
    const size = entry.size.split("x").map(Number);
    const scale = Number.parseFloat(entry.scale);
    if (bytes.subarray(1, 4).toString() !== "PNG" ||
        bytes.readUInt32BE(16) !== size[0] * scale ||
        bytes.readUInt32BE(20) !== size[1] * scale) {
      throw new Error(`Wrong dimensions for ${entry.filename}`);
    }
    return [source, join(catalog, entry.filename)];
  });
  for (const [source, destination] of copies) copyFileSync(source, destination);
  return copies.length;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Installed ${syncIosIcons("src-tauri/gen/apple", "src-tauri/icons/ios")} approved iOS icon slots`);
}
