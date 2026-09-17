import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { IOS_VIEWPORT_VARS } from "./iosViewport";

/**
 * iOS runtime/native configuration contracts (#436, runtime slice).
 *
 * Static assertions over the web shell (index.html), the Tauri window/bundle
 * config, and the iOS plist: viewport opt-ins, system-chrome tinting, dark
 * status-bar content, and declared orientations. The layout/CSS seam lives in
 * DeviceChromeContracts.test.ts and SafeAreaComposition.test.tsx; this file
 * pins the native half so the layout branch can integrate against stable
 * variable names. Nothing here is physical-device evidence.
 */

const indexHtml = readFileSync("index.html", "utf8");
const tauriConf = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
const iosPlist = readFileSync("src-tauri/Info.ios.plist", "utf8");

describe("HTML viewport and system-chrome metadata (#436 runtime)", () => {
  it("keeps edge-to-edge layout with keyboard resizing", () => {
    expect(indexHtml).toMatch(/viewport-fit=cover/);
    expect(indexHtml).toMatch(/interactive-widget=resizes-content/);
  });

  it("never disables pinch zoom, so large text stays reachable", () => {
    expect(indexHtml).not.toMatch(/maximum-scale/);
    expect(indexHtml).not.toMatch(/user-scalable\s*=\s*no/);
  });

  it("tints the system chrome with the app background", () => {
    expect(indexHtml).toMatch(/<meta name="theme-color" content="#14141c" \/>/);
  });

  it("opts into standalone web-app chrome with underlap status bar", () => {
    expect(indexHtml).toMatch(/<meta name="mobile-web-app-capable" content="yes" \/>/);
    expect(indexHtml).toMatch(/<meta name="apple-mobile-web-app-capable" content="yes" \/>/);
    expect(indexHtml).toMatch(
      /<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" \/>/,
    );
  });
});

describe("Tauri window and iOS bundle configuration (#436 runtime)", () => {
  it("paints the native window behind the webview with the app background", () => {
    expect(tauriConf.app.windows[0].backgroundColor).toBe("#14141c");
  });

  it("matches the theme-color meta to the native window background", () => {
    expect(indexHtml).toContain(`content="${tauriConf.app.windows[0].backgroundColor}"`);
  });

  it("keeps the iOS 16.4 minimum for structured-clone-era web APIs", () => {
    expect(tauriConf.bundle.iOS.minimumSystemVersion).toBe("16.4");
  });
});

describe("iOS plist status bar and orientations (#436 runtime)", () => {
  it("preserves the export-compliance encryption declaration", () => {
    expect(iosPlist).toMatch(/<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);
  });

  it("keeps light status-bar content over the dark chrome", () => {
    expect(iosPlist).toMatch(/<key>UIViewControllerBasedStatusBarAppearance<\/key>\s*<false\/>/);
    expect(iosPlist).toMatch(/<key>UIStatusBarStyle<\/key>\s*<string>UIStatusBarStyleLightContent<\/string>/);
  });

  it("declares portrait and both landscape orientations for iPhone", () => {
    const orientations = iosPlist.match(
      /<key>UISupportedInterfaceOrientations~iphone<\/key>\s*<array>([\s\S]*?)<\/array>/,
    );
    expect(orientations, "missing iPhone orientations array").toBeTruthy();
    expect(orientations![1]).toMatch(/UIInterfaceOrientationPortrait</);
    expect(orientations![1]).toMatch(/UIInterfaceOrientationLandscapeLeft</);
    expect(orientations![1]).toMatch(/UIInterfaceOrientationLandscapeRight</);
  });
});

describe("layout-branch seam (#436 runtime)", () => {
  it("publishes the viewport variable contract the layout branch consumes", () => {
    expect(Object.values(IOS_VIEWPORT_VARS)).toEqual([
      "--ahd-keyboard-inset",
      "--ahd-viewport-height",
      "--ahd-viewport-width",
    ]);
  });
});
