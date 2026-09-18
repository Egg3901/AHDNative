import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  IOS_SAFE_AREA_VARS,
  SAFE_AREA_BOTTOM_FALLBACK_PX,
  decideSafeAreaTopMode,
  installIosSafeArea,
  isIphoneClass,
  type SafeAreaWindowLike,
} from "./iosSafeArea";

/**
 * Home-indicator fail-safe floor for persistent bottom controls (#436).
 *
 * The zero-env WKWebView failure (internal iOS 0.1.8) resolved every
 * `env(safe-area-inset-*)` to zero, but the fail-safe only floored the top:
 * the fixed footer (`max(0.35rem, env(bottom))`), the creation sticky bar
 * (`0.6rem`), the drawer chrome (`0.7rem`) and quick bar (`0.5rem`), and the
 * Ask window composer (`10px`) all fell back to bases under the 34px home
 * indicator. One env() implementation reports every inset, so a ~zero top
 * reading on iPhone-class portrait proves the bottom is misreported too,
 * and the same gate now publishes a 34px bottom floor that the persistent
 * bottom controls compose as `max(<base>, var(...), env(...))`.
 *
 * Geometry-only: jsdom performs no layout, so these cases pin the shipped
 * stylesheet text and the helper publication with injected doubles (no
 * `document`, no layout), and nothing here is physical-device evidence.
 * The device pass reads `window.__AHD_SAFE_AREA__`
 * (`measuredBottomPx`/`fallbackBottomPx`) to confirm the shared failure.
 */

const css = readFileSync("src/ui/ui.css", "utf8");
const askCss = readFileSync("src/ask/ask.css", "utf8");

const FALLBACK = "var(--ahd-safe-area-bottom-fallback, 0px)";
const BOTTOM_INSET = "env(safe-area-inset-bottom)";

const IPHONE_NAV = {
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  platform: "iPhone",
  maxTouchPoints: 5,
};

const DESKTOP_NAV = {
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  platform: "MacIntel",
  maxTouchPoints: 0,
};

/** Minimal style root: only the surface installIosSafeArea uses. */
function makeRoot(): HTMLElement & { props: Map<string, string> } {
  const props = new Map<string, string>();
  return {
    props,
    style: {
      setProperty(name: string, value: string) {
        props.set(name, value);
      },
      getPropertyValue(name: string) {
        return props.get(name) ?? "";
      },
    },
    setAttribute() {},
  } as unknown as HTMLElement & { props: Map<string, string> };
}

/** Dimension-driven window double: no matchMedia, so viewport geometry decides orientation. */
function makeViewportWindow(
  innerWidth: number,
  innerHeight: number,
  navigator: typeof IPHONE_NAV,
): SafeAreaWindowLike {
  return {
    innerHeight,
    innerWidth,
    navigator,
    addEventListener() {},
    removeEventListener() {},
  };
}

describe("bottom fallback token (#436)", () => {
  it("defaults the floor to 0px so unaffected platforms render unchanged", () => {
    expect(css).toMatch(/--ahd-safe-area-bottom-fallback:\s*0px/);
  });

  it("keeps the published variable name in sync with the runtime module", () => {
    expect(IOS_SAFE_AREA_VARS.bottomFallback).toBe("--ahd-safe-area-bottom-fallback");
    expect(css).toContain(`${IOS_SAFE_AREA_VARS.bottomFallback}:`);
    // :root default plus the four persistent bottom controls below.
    expect(css.split(IOS_SAFE_AREA_VARS.bottomFallback).length - 1).toBeGreaterThanOrEqual(5);
    expect(askCss).toContain(IOS_SAFE_AREA_VARS.bottomFallback);
  });

  it("holds the exact 34px home-indicator floor", () => {
    expect(SAFE_AREA_BOTTOM_FALLBACK_PX).toBe(34);
  });
});

describe("persistent bottom-control composition (#436)", () => {
  it.each([
    { selector: "\\.ahd-footer", base: "0.35rem", label: "fixed footer" },
    { selector: "\\.ahd-drawer", base: "0.7rem", label: "drawer chrome" },
    { selector: "\\.ahd-drawer-quick", base: "0.5rem", label: "drawer quick bar" },
    { selector: "\\.ahd-creation-actions", base: "0.6rem", label: "creation sticky bar" },
    { selector: "\\.ahd-wallet", base: "0.75rem", label: "wallet surface" },
  ])("floors the $label above the indicator without moving its base", ({ selector, base, label }) => {
    // padding-bottom or the padding shorthand (creation bar): either way the
    // declaration must compose base, fail-safe, and env() via max().
    const rules = [...css.matchAll(new RegExp(`${selector}\\s*\\{[^}]*padding(?:-bottom)?:[^}]*\\}`, "g"))].map(
      (m) => m[0],
    );
    expect(rules.length, `missing bottom rule for ${label}`).toBeGreaterThan(0);
    for (const rule of rules) {
      // max() only ever raises the floor: the shipped desktop base stays,
      // the fail-safe sits in the middle, and a working native inset wins.
      expect(rule, `${label} lost its desktop base`).toContain(base);
      expect(rule, `${label} missing bottom fallback`).toContain(FALLBACK);
      expect(rule, `${label} missing env() composition`).toContain(BOTTOM_INSET);
    }
  });

  it("floors the standalone Ask window composer without moving desktop", () => {
    const rule = askCss.match(/\.askview\[data-surface="window"\] \.av-composer\s*\{[^}]*\}/);
    expect(rule, "missing Ask window composer rule").toBeTruthy();
    expect(rule![0]).toContain("max(10px,");
    expect(rule![0]).toContain(FALLBACK);
    expect(rule![0]).toContain(BOTTOM_INSET);
  });

  it("floors the landing entry shell above the indicator without moving its base", () => {
    // The landing top rule already composes the top fail-safe, but the bottom
    // rule shipped env()-only: on the zero-env WKWebView shape the entry
    // shell falls back to its 1.5rem base (24px), under the 34px home
    // indicator, so Help/Settings/saved games can park beneath it.
    const rule = css.match(/\.ahd-landing-layout\s*\{[^}]*\}/);
    expect(rule, "missing landing layout rule").toBeTruthy();
    expect(rule![0], "landing lost its desktop base").toContain("1.5rem");
    expect(rule![0], "landing missing bottom fallback").toContain(FALLBACK);
    expect(rule![0], "landing missing env() composition").toContain(BOTTOM_INSET);
  });

  it("keeps the landscape footer on env()-only geometry", () => {
    const landscape = css.match(/@media\s*\(orientation:\s*landscape\)\s*\{[\s\S]*?\.ahd-footer\s*\{[^}]*\}/);
    expect(landscape, "missing landscape footer rule").toBeTruthy();
    expect(landscape![0]).not.toContain("ahd-safe-area-bottom-fallback");
  });

  it("gates on family signals, never model numbers or screen sizes", () => {
    // Scoped to the gate source like the top-path contract: the whole module
    // legitimately contains words such as setProperty, so a module-wide scan
    // would false-positive.
    expect(isIphoneClass.toString()).not.toMatch(/iPhone1?\d|Pro|Max|Mini|Plus|SE/);
    expect(decideSafeAreaTopMode.toString()).not.toMatch(/390|844|34|59/);
  });
});

describe.each([
  { width: 390, height: 844, label: "phone" },
  { width: 1280, height: 800, label: "desktop" },
])("bottom-floor publication at $width px (#436, $label)", ({ width, height }) => {
  it("fires the shared gate on iPhone portrait geometry and stays zero otherwise", () => {
    // 390x844 iPhone portrait with a ~zero top reading is the 0.1.8 shape:
    // both floors publish. The 1280x800 desktop shape is landscape, so the
    // same iPhone UA stays env-only; a desktop UA at phone geometry does too.
    const gated = makeRoot();
    const gatedHandle = installIosSafeArea(gated, {
      win: makeViewportWindow(width, height, IPHONE_NAV),
      readTopInsetPx: () => 0,
      readBottomInsetPx: () => 0,
      report: () => {},
    });
    const portraitPhone = width < height;
    expect(gated.props.get(IOS_SAFE_AREA_VARS.topFallback)).toBe(portraitPhone ? "59px" : "0px");
    expect(gated.props.get(IOS_SAFE_AREA_VARS.bottomFallback)).toBe(portraitPhone ? "34px" : "0px");
    gatedHandle.uninstall();

    const desktop = makeRoot();
    const desktopHandle = installIosSafeArea(desktop, {
      win: makeViewportWindow(width, height, DESKTOP_NAV),
      readTopInsetPx: () => 0,
      readBottomInsetPx: () => 0,
      report: () => {},
    });
    expect(desktop.props.get(IOS_SAFE_AREA_VARS.bottomFallback)).toBe("0px");
    desktopHandle.uninstall();
  });
});

describe("keyboard/scroll coexistence (#436)", () => {
  it("keeps document focus scrolling clear of the grown footer", () => {
    // The taller fallback floor grows the measured footer, and the document
    // rule still reads that live measurement, so keyboard-focus scrolling
    // keeps parking page content above the footer instead of under it.
    expect(css).toContain("scroll-padding-bottom: calc(var(--ahd-footer-height, 9rem) + 1rem);");
  });

  it("leaves the drawer focus-ring scroll alignment untouched", () => {
    expect(css).toMatch(/\.ahd-drawer-nav[^{]*\{[^}]*scroll-padding-block:\s*0\.5rem/);
    expect(css).toMatch(/\.ahd-drawer-item,\s*\.ahd-drawer-disclosure\s*\{\s*scroll-margin-block:\s*0\.5rem/);
  });
});
