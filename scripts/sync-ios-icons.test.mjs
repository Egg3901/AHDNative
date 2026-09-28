import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncIosIcons } from "./sync-ios-icons.mjs";

const source = new URL("../src-tauri/icons/ios/", import.meta.url).pathname;
test("replaces generated placeholder slots, including duplicated iPad names", () => {
  const temp = mkdtempSync(join(tmpdir(), "ahd-ios-icons-"));
  try {
    const catalog = join(temp, "Assets.xcassets", "AppIcon.appiconset");
    mkdirSync(catalog, { recursive: true });
    const images = [
      { size: "60x60", scale: "2x", filename: "AppIcon-60x60@2x.png", idiom: "iphone" },
      { size: "20x20", scale: "2x", filename: "AppIcon-20x20@2x-1.png", idiom: "ipad" },
      { size: "1024x1024", scale: "1x", filename: "AppIcon-512@2x.png", idiom: "ios-marketing" },
    ];
    writeFileSync(join(catalog, "Contents.json"), JSON.stringify({ images }));
    for (const image of images) writeFileSync(join(catalog, image.filename), "default Tauri placeholder");
    assert.equal(syncIosIcons(temp, source), images.length);
    for (const image of images) assert.deepEqual(
      readFileSync(join(catalog, image.filename)),
      readFileSync(join(source, image.filename.replace(/-1(?=\.png$)/, ""))),
    );
    images[0].size = "57x57";
    writeFileSync(join(catalog, "Contents.json"), JSON.stringify({ images }));
    assert.throws(() => syncIosIcons(temp, source), /Wrong dimensions/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
test("fails closed when no generated icon catalog exists", () => {
  const temp = mkdtempSync(join(tmpdir(), "ahd-ios-icons-"));
  try { assert.throws(() => syncIosIcons(temp, source), /Expected one/); }
  finally { rmSync(temp, { recursive: true, force: true }); }
});
test("release installs icons after init and checks the shipped IPA before publishing", () => {
  const yaml = readFileSync(new URL("../codemagic.yaml", import.meta.url), "utf8");
  const init = yaml.indexOf("ios init --ci");
  const sync = yaml.indexOf("node scripts/sync-ios-icons.mjs");
  const build = yaml.indexOf("ios build --ci");
  const verify = yaml.indexOf("scripts/verify-ios-ipa-icons.py");
  assert.ok(init < sync && sync < build && build < verify && verify < yaml.indexOf("    publishing:"));
});
