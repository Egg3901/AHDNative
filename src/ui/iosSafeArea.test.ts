import { describe, expect, it } from "vitest";
import {
  IOS_SAFE_AREA_VARS,
  NATIVE_TOP_MIN_PX,
  SAFE_AREA_ATTRIBUTE,
  SAFE_AREA_TOP_FALLBACK_PX,
  decideSafeAreaTopMode,
  installIosSafeArea,
  isIphoneClass,
  isPortraitOrientation,
  type SafeAreaDiagnostic,
  type SafeAreaWindowLike,
} from "./iosSafeArea";

/**
 * iOS safe-area native fallback (#436 WKWebView zero-env failure).
 *
 * Internal iOS 0.1.8 resolved env(safe-area-inset-top) to zero, parking
 * headings under the status bar. These cases pin the fallback contract with
 * injected doubles (no `document`, no layout), so they run under both the
 * node and jsdom vitest configs. Nothing here is physical-device evidence:
 * the device pass reads `window.__AHD_SAFE_AREA__` to tell notch from
 * genuine zero inset.
 */

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
function makeRoot(): HTMLElement & { props: Map<string, string>; attrs: Map<string, string> } {
  const props = new Map<string, string>();
  const attrs = new Map<string, string>();
  const root = {
    props,
    attrs,
    style: {
      setProperty(name: string, value: string) {
        props.set(name, value);
      },
      getPropertyValue(name: string) {
        return props.get(name) ?? "";
      },
    },
    setAttribute(name: string, value: string) {
      attrs.set(name, value);
    },
    getAttribute(name: string) {
      return attrs.get(name) ?? null;
    },
  } as unknown as HTMLElement & { props: Map<string, string>; attrs: Map<string, string> };
  return root;
}

function makeWindow(
  opts: {
    innerHeight?: number;
    innerWidth?: number;
    navigator?: typeof IPHONE_NAV;
    portrait?: boolean;
    matchMediaThrows?: boolean;
  } = {},
): SafeAreaWindowLike & { fire(type: string): void; counts(type: string): number } {
  const listeners = new Map<string, Set<() => void>>();
  const portrait = opts.portrait ?? (opts.innerHeight ?? 800) >= (opts.innerWidth ?? 390);
  const win: SafeAreaWindowLike & { fire(type: string): void; counts(type: string): number } = {
    innerHeight: opts.innerHeight ?? 800,
    innerWidth: opts.innerWidth ?? 390,
    navigator: opts.navigator,
    matchMedia:
      opts.matchMediaThrows === true
        ? () => {
            throw new Error("no matchMedia");
          }
        : () => ({ matches: portrait }),
    addEventListener(type, listener) {
      let set = listeners.get(type);
      if (!set) listeners.set(type, (set = new Set()));
      set.add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    fire(type) {
      for (const listener of [...(listeners.get(type) ?? [])]) listener();
    },
    counts(type) {
      return listeners.get(type)?.size ?? 0;
    },
  };
  return win;
}

describe("fallback constants (#436)", () => {
  it("publishes the layout-branch variable name", () => {
    expect(IOS_SAFE_AREA_VARS.topFallback).toBe("--ahd-safe-area-top-fallback");
  });

  it("holds a 59px Dynamic Island portrait floor above the 20px native minimum", () => {
    expect(SAFE_AREA_TOP_FALLBACK_PX).toBe(59);
    expect(NATIVE_TOP_MIN_PX).toBe(20);
    expect(SAFE_AREA_TOP_FALLBACK_PX).toBeGreaterThan(NATIVE_TOP_MIN_PX);
  });
});

describe("decideSafeAreaTopMode", () => {
  it("trusts a working native inset on every platform", () => {
    for (const measured of [20, 44, 47, 59, 80]) {
      expect(decideSafeAreaTopMode(measured, true, true)).toBe("native");
      expect(decideSafeAreaTopMode(measured, false, true)).toBe("native");
    }
  });

  it("falls back only on iPhone-class portrait with a ~zero reading", () => {
    expect(decideSafeAreaTopMode(0, true, true)).toBe("fallback");
    expect(decideSafeAreaTopMode(5, true, true)).toBe("fallback");
    expect(decideSafeAreaTopMode(19, true, true)).toBe("fallback");
  });

  it("reports genuine zero on desktop, Android, iPad-class, and landscape", () => {
    expect(decideSafeAreaTopMode(0, false, true)).toBe("zero");
    expect(decideSafeAreaTopMode(0, false, false)).toBe("zero");
    expect(decideSafeAreaTopMode(0, true, false)).toBe("zero");
  });
});

describe("isIphoneClass", () => {
  it("matches iPhone hardware with touch and nothing else", () => {
    expect(isIphoneClass(IPHONE_NAV)).toBe(true);
    expect(isIphoneClass(undefined)).toBe(false);
    expect(isIphoneClass({ ...IPHONE_NAV, maxTouchPoints: 0 })).toBe(false);
    expect(isIphoneClass(DESKTOP_NAV)).toBe(false);
    expect(
      isIphoneClass({
        userAgent: "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15",
        platform: "iPad",
        maxTouchPoints: 5,
      }),
    ).toBe(false);
    expect(
      isIphoneClass({
        userAgent: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36",
        platform: "Linux armv8l",
        maxTouchPoints: 5,
      }),
    ).toBe(false);
  });

  it("uses family signals, never model numbers", () => {
    const source = isIphoneClass.toString();
    expect(source).not.toMatch(/iPhone1?\d|Pro|Max|Mini|Plus|SE/);
  });
});

describe("isPortraitOrientation", () => {
  it("prefers the orientation media query", () => {
    expect(isPortraitOrientation(makeWindow({ portrait: true }))).toBe(true);
    expect(isPortraitOrientation(makeWindow({ portrait: false }))).toBe(false);
  });

  it("falls back to dimensions without matchMedia or when it throws", () => {
    const bare = makeWindow({ innerHeight: 800, innerWidth: 390 });
    delete (bare as Partial<SafeAreaWindowLike>).matchMedia;
    expect(isPortraitOrientation(bare)).toBe(true);
    const wide = makeWindow({ innerHeight: 390, innerWidth: 844 });
    delete (wide as Partial<SafeAreaWindowLike>).matchMedia;
    expect(isPortraitOrientation(wide)).toBe(false);
    expect(isPortraitOrientation(makeWindow({ innerHeight: 800, innerWidth: 390, matchMediaThrows: true }))).toBe(
      true,
    );
  });
});

describe("installIosSafeArea", () => {
  it("applies the fail-safe floor on the 0.1.8 shape: zero env on iPhone portrait", () => {
    const root = makeRoot();
    const reports: SafeAreaDiagnostic[] = [];
    const win = makeWindow({ navigator: IPHONE_NAV, portrait: true });
    const handle = installIosSafeArea(root, {
      win,
      readTopInsetPx: () => 0,
      report: (d) => reports.push(d),
    });
    expect(root.props.get(IOS_SAFE_AREA_VARS.topFallback)).toBe("59px");
    expect(root.attrs.get(SAFE_AREA_ATTRIBUTE)).toBe("fallback");
    expect(handle.diagnostic()).toEqual({
      mode: "fallback",
      measuredTopPx: 0,
      fallbackPx: 59,
      orientation: "portrait",
      iphoneClass: true,
    });
    expect(reports).toHaveLength(1);
    handle.uninstall();
  });

  it("stays env-only when the native inset works", () => {
    const root = makeRoot();
    const win = makeWindow({ navigator: IPHONE_NAV, portrait: true });
    const handle = installIosSafeArea(root, { win, readTopInsetPx: () => 59 });
    expect(root.props.get(IOS_SAFE_AREA_VARS.topFallback)).toBe("0px");
    expect(root.attrs.get(SAFE_AREA_ATTRIBUTE)).toBe("native");
    expect(handle.diagnostic().mode).toBe("native");
    handle.uninstall();
  });

  it("leaves desktop, landscape, and genuine-zero devices at a zero floor", () => {
    for (const win of [
      makeWindow({ navigator: DESKTOP_NAV, portrait: true }),
      makeWindow({ navigator: IPHONE_NAV, portrait: false }),
      makeWindow({ portrait: true }),
    ]) {
      const root = makeRoot();
      const handle = installIosSafeArea(root, { win, readTopInsetPx: () => 0 });
      expect(root.props.get(IOS_SAFE_AREA_VARS.topFallback)).toBe("0px");
      expect(root.attrs.get(SAFE_AREA_ATTRIBUTE)).toBe("zero");
      handle.uninstall();
    }
  });

  it("re-evaluates on resize and rotation, and uninstall removes listeners", () => {
    const root = makeRoot();
    let measured = 0;
    const win = makeWindow({ navigator: IPHONE_NAV, portrait: true });
    const handle = installIosSafeArea(root, { win, readTopInsetPx: () => measured });
    expect(handle.diagnostic().mode).toBe("fallback");
    measured = 59;
    win.fire("resize");
    expect(handle.diagnostic().mode).toBe("native");
    expect(root.props.get(IOS_SAFE_AREA_VARS.topFallback)).toBe("0px");
    measured = 0;
    win.fire("orientationchange");
    expect(handle.diagnostic().mode).toBe("fallback");
    expect(win.counts("resize")).toBe(1);
    handle.uninstall();
    expect(win.counts("resize")).toBe(0);
    expect(win.counts("orientationchange")).toBe(0);
  });

  it("returns a detached diagnostic copy", () => {
    const root = makeRoot();
    const win = makeWindow({ navigator: IPHONE_NAV, portrait: true });
    const handle = installIosSafeArea(root, { win, readTopInsetPx: () => 0 });
    const first = handle.diagnostic();
    first.mode = "native";
    expect(handle.diagnostic().mode).toBe("fallback");
    handle.uninstall();
  });
});
