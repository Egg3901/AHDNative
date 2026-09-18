/**
 * iOS safe-area native fallback (#436).
 *
 * Recorded failure: internal iOS 0.1.8 resolved `env(safe-area-inset-top)`
 * to zero inside its WKWebView, so headings rendered under the status bar
 * even though every shell composes `max(<base>, env(safe-area-inset-top))`.
 * No web CSS can distinguish that failure from a genuinely notch-less
 * device, so this module measures the live value and publishes a fail-safe
 * floor plus a truthful diagnostic:
 *
 * - `--ahd-safe-area-top-fallback`: `0px` unless the probe reads ~zero on an
 *   iPhone-class portrait webview, in which case 59px. The CSS top rules
 *   compose it as `max(<base>, var(--ahd-safe-area-top-fallback, 0px),
 *   env(safe-area-inset-top))`, so it only ever raises the floor and never
 *   lowers a working native inset. Desktop, Android, iPad, landscape, and
 *   genuine zero-inset devices stay byte-identical to the env()-only rules.
 * - `--ahd-safe-area-bottom-fallback`: same gate, 34px home-indicator floor
 *   for the persistent bottom controls (fixed footer, creation sticky bar,
 *   drawer chrome/quick bar, Ask window composer). One env() implementation
 *   reports every inset, so a ~zero top reading on iPhone-class portrait
 *   proves the implementation is not reporting, and the bottom reads ~zero
 *   for the same reason; without the floor those controls fall back to
 *   their 0.35rem-0.7rem bases and park under the home indicator. The CSS
 *   bottom rules compose it the same way, so a working native bottom inset
 *   (34px) always wins the max() and unaffected platforms stay identical.
 *   Home-button iPhones stay out by construction: their working top inset
 *   reads 20px, which meets the native minimum and closes the gate.
 * - `data-ahd-safe-area="native|fallback|zero"` on `documentElement` plus
 *   `window.__AHD_SAFE_AREA__` (`{ mode, measuredTopPx, fallbackPx,
 *   measuredBottomPx, fallbackBottomPx, orientation, iphoneClass }`): the
 *   diagnostic surface a device pass reads to tell a notch/status-bar
 *   inset apart from a zero-inset device.
 *
 * Why web-measured instead of native: the locked stack can expose a
 * native-derived value (`@tauri-apps/api` 2.11.1 `innerPosition()` /
 * `outerPosition()` over `tauri` 2.11.x `Window::inner_position`, which
 * tao 0.35.3 implements on iOS from the view inset with no new
 * dependencies), but that path is an async bridge call over physical
 * pixels with a main-thread caveat, while the probe reads the
 * synchronous CSS truth the floor actually guards. The probe plus
 * platform gate below is the chosen source, and the Rust pin test in
 * `src-tauri/src/lib.rs` records that no dedicated inset command exists.
 *
 * No device lists: the gate is iPhone-class family (iPhone UA/platform +
 * touch) with portrait orientation, never model numbers or screen sizes.
 * Keyboard does not move the top inset, so the keyboard path
 * (`iosViewport.ts`, `interactive-widget=resizes-content`) is untouched;
 * pinch zoom and large text are untouched (no viewport-meta change).
 */

export const IOS_SAFE_AREA_VARS = {
  topFallback: "--ahd-safe-area-top-fallback",
  bottomFallback: "--ahd-safe-area-bottom-fallback",
} as const;

/** Attribute on `documentElement` carrying the applied mode for inspection. */
export const SAFE_AREA_ATTRIBUTE = "data-ahd-safe-area";

/**
 * Fail-safe portrait top floor in px. Tallest shipped iPhone portrait
 * status-bar inset (Dynamic Island class); deliberately generous on the
 * 44/47pt notch generations. Overshoot costs a few px of air in the
 * fail-safe direction; undershoot would repeat the 0.1.8 overlap.
 */
export const SAFE_AREA_TOP_FALLBACK_PX = 59;

/**
 * A live `env(safe-area-inset-top)` at or above this is a working native
 * inset. Below the smallest shipped iPhone portrait status bar, so anything
 * lower on iPhone-class hardware means env() is not reporting.
 */
export const NATIVE_TOP_MIN_PX = 20;

/**
 * Fail-safe portrait bottom floor in px. Face ID iPhone portrait home
 * indicator; deliberately exact rather than generous, because the footer
 * height is measured live and every extra px pushes content clearance down.
 * Composed via max(), so a working native bottom inset always wins.
 */
export const SAFE_AREA_BOTTOM_FALLBACK_PX = 34;

export type SafeAreaTopMode = "native" | "fallback" | "zero";

export interface SafeAreaDiagnostic {
  mode: SafeAreaTopMode;
  measuredTopPx: number;
  fallbackPx: number;
  measuredBottomPx: number;
  fallbackBottomPx: number;
  orientation: "portrait" | "landscape";
  iphoneClass: boolean;
}

export interface SafeAreaHandle {
  /** Re-reads the probe and republishes the variable, attribute, diagnostic. */
  refresh(): void;
  /** Removes every listener installed by {@link installIosSafeArea}. */
  uninstall(): void;
  /** The last published diagnostic. */
  diagnostic(): SafeAreaDiagnostic;
}

export interface SafeAreaNavigatorLike {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
}

export interface SafeAreaWindowLike {
  innerHeight: number;
  innerWidth: number;
  navigator?: SafeAreaNavigatorLike;
  matchMedia?: (query: string) => { matches: boolean };
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export interface SafeAreaInstallDeps {
  win?: SafeAreaWindowLike;
  /** Reads the live `env(safe-area-inset-top)` in px. Defaults to a probe. */
  readTopInsetPx?: () => number;
  /** Reads the live `env(safe-area-inset-bottom)` in px. Defaults to a probe. */
  readBottomInsetPx?: () => number;
  /** Receives the diagnostic on every refresh. Defaults to window global. */
  report?: (diagnostic: SafeAreaDiagnostic) => void;
}

const NOOP_DIAGNOSTIC: SafeAreaDiagnostic = {
  mode: "zero",
  measuredTopPx: 0,
  fallbackPx: 0,
  measuredBottomPx: 0,
  fallbackBottomPx: 0,
  orientation: "portrait",
  iphoneClass: false,
};

const NOOP_HANDLE: SafeAreaHandle = {
  refresh() {},
  uninstall() {},
  diagnostic() {
    return { ...NOOP_DIAGNOSTIC };
  },
};

/**
 * Pure mode decision, kept side-effect-free for tests. A working native
 * inset always wins; the fail-safe floor applies only when env() reads
 * ~zero on an iPhone-class portrait webview. Landscape keeps env()-only
 * geometry (the cutout moves to the sides, top is genuinely zero).
 */
export function decideSafeAreaTopMode(
  measuredTopPx: number,
  iphoneClass: boolean,
  isPortrait: boolean,
): SafeAreaTopMode {
  if (measuredTopPx >= NATIVE_TOP_MIN_PX) return "native";
  if (iphoneClass && isPortrait) return "fallback";
  return "zero";
}

/** iPhone family only (UA/platform + touch), never model numbers. iPad, desktop, and Android are out. */
export function isIphoneClass(navigator: SafeAreaNavigatorLike | undefined): boolean {
  if (!navigator) return false;
  const text = `${navigator.userAgent ?? ""} ${navigator.platform ?? ""}`;
  return /iPhone/i.test(text) && (navigator.maxTouchPoints ?? 0) > 0;
}

export function isPortraitOrientation(win: SafeAreaWindowLike): boolean {
  if (typeof win.matchMedia === "function") {
    try {
      return win.matchMedia("(orientation: portrait)").matches;
    } catch {
      // Fall through to the dimension comparison below.
    }
  }
  return win.innerHeight >= win.innerWidth;
}

function defaultReadTopInsetPx(): number {
  if (typeof document === "undefined" || typeof getComputedStyle === "undefined") return 0;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:absolute;top:0;left:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);";
  document.documentElement.appendChild(probe);
  const raw = parseFloat(getComputedStyle(probe).paddingTop);
  probe.remove();
  return Number.isFinite(raw) ? Math.max(0, raw) : 0;
}

function defaultReadBottomInsetPx(): number {
  if (typeof document === "undefined" || typeof getComputedStyle === "undefined") return 0;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:absolute;top:0;left:0;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom);";
  document.documentElement.appendChild(probe);
  const raw = parseFloat(getComputedStyle(probe).paddingBottom);
  probe.remove();
  return Number.isFinite(raw) ? Math.max(0, raw) : 0;
}

function defaultReport(diagnostic: SafeAreaDiagnostic): void {
  try {
    (window as unknown as { __AHD_SAFE_AREA__?: SafeAreaDiagnostic }).__AHD_SAFE_AREA__ = {
      ...diagnostic,
    };
  } catch {
    // Diagnostics must never break boot on a locked-down webview.
  }
}

function resolveWindow(win: SafeAreaWindowLike | undefined): SafeAreaWindowLike | undefined {
  if (win) return win;
  if (typeof window !== "undefined") return window as unknown as SafeAreaWindowLike;
  return undefined;
}

export function installIosSafeArea(
  root?: HTMLElement,
  deps?: SafeAreaInstallDeps,
): SafeAreaHandle {
  const target = root ?? (typeof document !== "undefined" ? document.documentElement : undefined);
  const active = resolveWindow(deps?.win);
  if (!target || !active) return NOOP_HANDLE;

  const readTopInsetPx = deps?.readTopInsetPx ?? defaultReadTopInsetPx;
  const readBottomInsetPx = deps?.readBottomInsetPx ?? defaultReadBottomInsetPx;
  const report = deps?.report ?? defaultReport;
  let current: SafeAreaDiagnostic = { ...NOOP_DIAGNOSTIC };

  const refresh = () => {
    const measured = readTopInsetPx();
    const iphoneClass = isIphoneClass(active.navigator);
    const portrait = isPortraitOrientation(active);
    const mode = decideSafeAreaTopMode(measured, iphoneClass, portrait);
    // Single broken-env gate for both floors: one env() implementation
    // reports every inset, so the top reading decides. The bottom probe is
    // diagnostic only (a device pass reads it to confirm the shared
    // failure); the floor follows the gate, never the bottom reading, so a
    // transient bottom misread can never move layout on its own.
    const fallbackPx = mode === "fallback" ? SAFE_AREA_TOP_FALLBACK_PX : 0;
    const fallbackBottomPx = mode === "fallback" ? SAFE_AREA_BOTTOM_FALLBACK_PX : 0;
    current = {
      mode,
      measuredTopPx: measured,
      fallbackPx,
      measuredBottomPx: readBottomInsetPx(),
      fallbackBottomPx,
      orientation: portrait ? "portrait" : "landscape",
      iphoneClass,
    };
    target.style.setProperty(IOS_SAFE_AREA_VARS.topFallback, `${fallbackPx}px`);
    target.style.setProperty(IOS_SAFE_AREA_VARS.bottomFallback, `${fallbackBottomPx}px`);
    target.setAttribute(SAFE_AREA_ATTRIBUTE, mode);
    report(current);
  };

  active.addEventListener("resize", refresh);
  active.addEventListener("orientationchange", refresh);

  refresh();

  return {
    refresh,
    uninstall() {
      active.removeEventListener("resize", refresh);
      active.removeEventListener("orientationchange", refresh);
    },
    diagnostic() {
      return { ...current };
    },
  };
}
