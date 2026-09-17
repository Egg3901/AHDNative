/**
 * iOS runtime viewport seam (issue #436, runtime slice).
 *
 * The layout branch owns geometry: `env(safe-area-inset-*)` composition,
 * orientation media queries, and every selector that consumes these values.
 * This module only *publishes* live viewport facts as stable CSS custom
 * properties on `document.documentElement`, so layout can integrate without
 * touching native code:
 *
 * - `--ahd-keyboard-inset`: keyboard overlap height in px (`0px` when hidden).
 * - `--ahd-viewport-height` / `--ahd-viewport-width`: visual viewport size.
 *
 * Sources: `visualViewport.resize` + `scroll` (keyboard pan on iOS versions
 * that do not resize first), `window.resize`, and explicit
 * `window.orientationchange` (rotation does not always fire a visualViewport
 * update promptly). `viewport-fit=cover` + `interactive-widget=resizes-content`
 * in index.html make the keyboard shrink the visual viewport instead of
 * overlaying content. Nothing here performs layout or reads safe-area insets;
 * jsdom performs no layout, so behavior is pinned by unit tests with a fake
 * viewport. Physical-device acceptance remains open.
 */

/** Published variable names. Renaming these breaks the layout branch. */
export const IOS_VIEWPORT_VARS = {
  keyboardInset: "--ahd-keyboard-inset",
  viewportHeight: "--ahd-viewport-height",
  viewportWidth: "--ahd-viewport-width",
} as const;

export interface VisualViewportLike {
  height: number;
  width: number;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export interface ViewportWindowLike {
  innerHeight: number;
  innerWidth: number;
  visualViewport?: VisualViewportLike | null;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export interface IosViewportHandle {
  /** Re-reads the viewport and republishes the variables. */
  refresh(): void;
  /** Removes every listener installed by {@link installIosViewport}. */
  uninstall(): void;
}

const NOOP_HANDLE: IosViewportHandle = {
  refresh() {},
  uninstall() {},
};

/**
 * Keyboard overlap: the part of the layout viewport the visual viewport no
 * longer covers. Clamped at zero so rotation transients never go negative.
 */
export function computeKeyboardInset(
  windowInnerHeight: number,
  visualViewportHeight: number | undefined,
): number {
  if (visualViewportHeight === undefined) return 0;
  return Math.max(0, Math.round(windowInnerHeight - visualViewportHeight));
}

function resolveWindow(win: ViewportWindowLike | undefined): ViewportWindowLike | undefined {
  if (win) return win;
  if (typeof window !== "undefined") return window as unknown as ViewportWindowLike;
  return undefined;
}

export function installIosViewport(
  root?: HTMLElement,
  win?: ViewportWindowLike,
): IosViewportHandle {
  const target = root ?? (typeof document !== "undefined" ? document.documentElement : undefined);
  const active = resolveWindow(win);
  if (!target || !active) return NOOP_HANDLE;

  const refresh = () => {
    const vv = active.visualViewport ?? undefined;
    const height = vv?.height ?? active.innerHeight;
    const width = vv?.width ?? active.innerWidth;
    target.style.setProperty(IOS_VIEWPORT_VARS.keyboardInset, `${computeKeyboardInset(active.innerHeight, vv?.height)}px`);
    target.style.setProperty(IOS_VIEWPORT_VARS.viewportHeight, `${Math.round(height)}px`);
    target.style.setProperty(IOS_VIEWPORT_VARS.viewportWidth, `${Math.round(width)}px`);
  };

  active.addEventListener("resize", refresh);
  active.addEventListener("orientationchange", refresh);
  active.visualViewport?.addEventListener("resize", refresh);
  active.visualViewport?.addEventListener("scroll", refresh);

  refresh();

  return {
    refresh,
    uninstall() {
      active.removeEventListener("resize", refresh);
      active.removeEventListener("orientationchange", refresh);
      active.visualViewport?.removeEventListener("resize", refresh);
      active.visualViewport?.removeEventListener("scroll", refresh);
    },
  };
}
