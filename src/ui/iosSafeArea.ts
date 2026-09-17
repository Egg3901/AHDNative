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
 * - `data-ahd-safe-area="native|fallback|zero"` on `documentElement` plus
 *   `window.__AHD_SAFE_AREA__` (`{ mode, measuredTopPx, fallbackPx,
 *   orientation, iphoneClass }`): the diagnostic surface a device pass reads
 *   to tell a notch/status-bar inset apart from a zero-inset device.
 *
 * Why web-measured instead of native: the pinned runtime cannot expose the
 * metric. `@tauri-apps/api` 2.11.1 publishes window `innerSize` /
 * `outerSize` / `scaleFactor` only (no inset API), and pinned `tauri`
 * 2.11.3 has no iOS `safeAreaInsets` command; reaching
 * `UIView.safeAreaInsets` would need unpinned objc-bridge dependencies.
 * The probe plus platform gate below is the supported maximum, and the Rust
 * pin test in `src-tauri/src/lib.rs` keeps that decision explicit.
 *
 * No device lists: the gate is iPhone-class family (iPhone UA/platform +
 * touch) with portrait orientation, never model numbers or screen sizes.
 * Keyboard does not move the top inset, so the keyboard path
 * (`iosViewport.ts`, `interactive-widget=resizes-content`) is untouched;
 * pinch zoom and large text are untouched (no viewport-meta change).
 */

export const IOS_SAFE_AREA_VARS = {
  topFallback: "--ahd-safe-area-top-fallback",
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

export type SafeAreaTopMode = "native" | "fallback" | "zero";

export interface SafeAreaDiagnostic {
  mode: SafeAreaTopMode;
  measuredTopPx: number;
  fallbackPx: number;
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
  /** Receives the diagnostic on every refresh. Defaults to window global. */
  report?: (diagnostic: SafeAreaDiagnostic) => void;
}

const NOOP_DIAGNOSTIC: SafeAreaDiagnostic = {
  mode: "zero",
  measuredTopPx: 0,
  fallbackPx: 0,
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
  const report = deps?.report ?? defaultReport;
  let current: SafeAreaDiagnostic = { ...NOOP_DIAGNOSTIC };

  const refresh = () => {
    const measured = readTopInsetPx();
    const iphoneClass = isIphoneClass(active.navigator);
    const portrait = isPortraitOrientation(active);
    const mode = decideSafeAreaTopMode(measured, iphoneClass, portrait);
    const fallbackPx = mode === "fallback" ? SAFE_AREA_TOP_FALLBACK_PX : 0;
    current = {
      mode,
      measuredTopPx: measured,
      fallbackPx,
      orientation: portrait ? "portrait" : "landscape",
      iphoneClass,
    };
    target.style.setProperty(IOS_SAFE_AREA_VARS.topFallback, `${fallbackPx}px`);
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
