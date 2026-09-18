import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * WebKit glass prefix checkpoint (#437 device slice of #436/#437).
 *
 * Audit outcome: the native/WebKit boundary is already complete in this
 * tree, so production is untouched. Viewport-fit/orientation/status-bar
 * config (index.html, Info.ios.plist, tauri.conf.json) is pinned by
 * IosRuntimeContracts; the zero-env fallback probe plus diagnostic
 * (src/ui/iosSafeArea.ts) and the keyboard/visual-viewport variables
 * (src/ui/iosViewport.ts) are pinned by iosSafeArea/iosViewport tests;
 * every top rule composes the fallback floor (SafeAreaFallback) and every
 * entry shell, home-indicator clearance, landscape side, and large-text
 * case is pinned (DeviceChromeContracts, SafeAreaComposition,
 * SafeAreaEntryShells, SafeAreaGaps).
 *
 * The one unpinned WebKit-shaped seam was the `-webkit-backdrop-filter`
 * mate: unprefixed `backdrop-filter` is unsupported below Safari 18, so on
 * the pinned iOS 16.4 floor (tauri.conf.json) a dropped `-webkit-` prefix
 * silently flattens glass to the opaque 0.1.8 failure class with every
 * suite still green. These cases pin the pairing.
 *
 * Geometry-only: jsdom performs no layout. Still owed, per #436/#437:
 * a named physical Dynamic Island iPhone pass (portrait/landscape,
 * keyboard, large text, reduced motion/transparency, orientation,
 * rounded corners, home indicator) plus a rendered AHDGame-vs-Native
 * comparison. Desktop Chromium resolves every env() to 0px and proves
 * contracts, not island rendering.
 */

const css = readFileSync("src/ui/ui.css", "utf8");

/** Top-level `selector { ... }` rule bodies (no nesting in this sheet). */
function ruleBodies(): string[] {
  return [...css.matchAll(/[^{}]+\{[^}]*\}/g)].map((m) => m[0]);
}

describe("webkit backdrop prefix parity (#437)", () => {
  it("mates every shipped blur backdrop-filter with -webkit- for the iOS 16.4 floor", () => {
    const blurred = ruleBodies().filter((rule) =>
      /(?<!-webkit-)backdrop-filter:\s*blur\(/.test(rule),
    );
    expect(blurred.length, "expected shipped glass surfaces").toBeGreaterThan(0);
    for (const rule of blurred) {
      expect(rule).toMatch(/-webkit-backdrop-filter:\s*blur\(/);
    }
  });

  it("keeps each glass surface on a prefixed blur rule", () => {
    for (const surface of [
      ".ahd-footer",
      ".ahd-drawer",
      ".ahd-creation-actions",
      ".ahd-resource-details",
      ".ahd-resource-popover",
    ]) {
      const blurred = ruleBodies().filter(
        (rule) =>
          new RegExp(`\\${surface}(?![\\w-])`).test(rule.split("{")[0]) &&
          /(?<!-webkit-)backdrop-filter:\s*blur\(/.test(rule),
      );
      expect(blurred.length, `${surface} lost its blurred glass rule`).toBeGreaterThan(0);
      for (const rule of blurred) {
        expect(rule).toMatch(/-webkit-backdrop-filter:\s*blur\(/);
      }
    }
  });

  it("leaves the reduced-transparency and forced-colors fallbacks unblurred on both engines", () => {
    const fallbackBlocks = ruleBodies().filter((rule) =>
      /backdrop-filter:\s*none/.test(rule),
    );
    expect(fallbackBlocks.length, "expected solid fallback blocks").toBeGreaterThan(0);
    for (const rule of fallbackBlocks) {
      expect(rule).toMatch(/-webkit-backdrop-filter:\s*none/);
    }
  });
});
