import { useEffect, useState } from "react";

/**
 * Dual-pane and hinge-aware layout primitives (issue #438).
 *
 * Hardware sources, in priority order:
 *   1. The Viewport Segments Enumeration API (`window.getViewportSegments`),
 *      which reports one rect per separated display region on foldables.
 *   2. The CSS Viewport Segments `spanning` media queries
 *      (`single-fold-vertical` / `single-fold-horizontal`).
 *   3. The explicit `?ahd-span=vertical|horizontal|single` query override.
 *      This is a QA/emulator capability signal only: it exercises the pane
 *      assignment and hinge-avoidance layout without claiming hardware
 *      evidence, and it never ships as a device acceptance claim.
 *
 * A generic wide viewport is deliberately not an input: posture resolution
 * takes only separated segments, spanning media, or the explicit override,
 * so a desktop-width window keeps the single-pane phone navigation flow.
 *
 * Tauri constraint: the desktop/mobile webviews expose no segment API today
 * (no `getViewportSegments`, no `spanning` media), so dual-pane stays
 * unreachable there until the platform reports it. See docs/DUAL-PANE-LAYOUT.md.
 */

export interface ViewportSegment {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type HingeOrientation = "vertical" | "horizontal";
export type DualPaneMode = "single" | "dual";
/** Where the dual-pane claim came from. `override` is QA-only, never hardware. */
export type DualPaneCapability = "none" | "segments" | "spanning-media" | "override";
export type DualPaneOverride = "single" | HingeOrientation;

export interface DualPaneInput {
  segments?: ViewportSegment[] | null;
  spanningVertical?: boolean;
  spanningHorizontal?: boolean;
  override?: DualPaneOverride | null;
}

export interface DualPaneLayout {
  mode: DualPaneMode;
  /** Hinge direction: vertical separates left/right panes, horizontal top/bottom. */
  hinge: HingeOrientation | null;
  capability: DualPaneCapability;
}

export interface PaneAssignment {
  /** Shell pairing: docked navigation drawer vs routed content. */
  navigationPane: 0 | 1;
  contentPane: 0 | 1;
  /** List/detail pairing inside routed surfaces. */
  listPane: 0 | 1;
  detailPane: 0 | 1;
}

export interface HingeBounds {
  orientation: HingeOrientation;
  /** Occlusion interval along the hinge axis, in CSS pixels. */
  start: number;
  end: number;
}

/**
 * Canonical segment order (issue #438). The platform reports one rect per
 * separated display region but does not promise left-first/top-first order,
 * so every geometric read sorts a copy by x then y before measuring. Without
 * this, a right-first rect pair computes a negative gap, misses the hinge,
 * and silently falls back to single-pane with content crossing the occlusion.
 */
function orderedSegmentPair(segments: ViewportSegment[]): [ViewportSegment, ViewportSegment] {
  const [a, b] = segments as [ViewportSegment, ViewportSegment];
  return a.x < b.x || (a.x === b.x && a.y <= b.y) ? [a, b] : [b, a];
}

function isSeparatedPair(segments: ViewportSegment[]): HingeOrientation | null {
  if (segments.length !== 2) return null;
  const [a, b] = orderedSegmentPair(segments);
  const verticalGap = b.x - (a.x + a.width);
  const horizontalGap = b.y - (a.y + a.height);
  const rowsOverlap = a.y < b.y + b.height && b.y < a.y + a.height;
  const colsOverlap = a.x < b.x + b.width && b.x < a.x + a.width;
  if (verticalGap > 0 && rowsOverlap && horizontalGap <= 0) return "vertical";
  if (horizontalGap > 0 && colsOverlap && verticalGap <= 0) return "horizontal";
  return null;
}

/**
 * Resolve the display posture. Exactly one disposition: an explicit single
 * override wins, then separated segments, then spanning media, else
 * single-pane. Viewport width never participates.
 */
export function resolveDualPaneLayout(input: DualPaneInput): DualPaneLayout {
  if (input.override === "single") {
    return { mode: "single", hinge: null, capability: "override" };
  }
  if (input.override === "vertical" || input.override === "horizontal") {
    return { mode: "dual", hinge: input.override, capability: "override" };
  }
  const segments = input.segments ?? null;
  if (segments) {
    const hinge = isSeparatedPair(segments);
    if (hinge) return { mode: "dual", hinge, capability: "segments" };
  }
  if (input.spanningVertical) return { mode: "dual", hinge: "vertical", capability: "spanning-media" };
  if (input.spanningHorizontal) return { mode: "dual", hinge: "horizontal", capability: "spanning-media" };
  return { mode: "single", hinge: null, capability: "none" };
}

/**
 * Deliberate pane assignment without duplicating state: selection and route
 * state stay single-source in the existing components; this only names which
 * visual pane hosts each role. Single-pane stacks everything (phone flow);
 * dual-pane keeps navigation/list on pane 0 and content/detail on pane 1.
 */
export function assignPanes(layout: DualPaneLayout): PaneAssignment {
  if (layout.mode === "dual") {
    return { navigationPane: 0, contentPane: 1, listPane: 0, detailPane: 1 };
  }
  return { navigationPane: 0, contentPane: 0, listPane: 0, detailPane: 0 };
}

/** Occlusion interval between two separated segments, or null. */
export function hingeBounds(segments: ViewportSegment[] | null | undefined): HingeBounds | null {
  if (!segments || segments.length !== 2) return null;
  const orientation = isSeparatedPair(segments);
  if (!orientation) return null;
  const [a, b] = orderedSegmentPair(segments);
  return orientation === "vertical"
    ? { orientation, start: a.x + a.width, end: b.x }
    : { orientation, start: a.y + a.height, end: b.y };
}

export interface SegmentPaneGeometry {
  orientation: HingeOrientation;
  /** First-segment extent along the hinge axis (pane 0 width or height). */
  pane0: number;
  /** Second-segment extent along the hinge axis (pane 1 width or height). */
  pane1: number;
  /** Occlusion width between the segments, in CSS pixels. */
  gap: number;
}

/**
 * Canonical pane geometry for the game shell (issue #438). Sizes both panes
 * from the canonically ordered segments, so the segfit gutter lands over the
 * occlusion regardless of the order the platform reported the rects in.
 * Returns null unless the rects are exactly two separated segments.
 */
export function segmentPaneGeometry(
  segments: ViewportSegment[] | null | undefined,
): SegmentPaneGeometry | null {
  if (!segments || segments.length !== 2) return null;
  const orientation = isSeparatedPair(segments);
  const bounds = hingeBounds(segments);
  if (!orientation || !bounds) return null;
  const [a, b] = orderedSegmentPair(segments);
  return orientation === "vertical"
    ? { orientation, pane0: a.width, pane1: b.width, gap: bounds.end - bounds.start }
    : { orientation, pane0: a.height, pane1: b.height, gap: bounds.end - bounds.start };
}

/** Parse the documented QA override (`?ahd-span=vertical|horizontal|single`). */
export function parseDualPaneOverride(search: string): DualPaneOverride | null {
  const value = new URLSearchParams(search).get("ahd-span");
  return value === "vertical" || value === "horizontal" || value === "single" ? value : null;
}

function readSegments(win: Window): ViewportSegment[] | null {
  try {
    const getter = (win as unknown as { getViewportSegments?: () => ViewportSegment[] }).getViewportSegments;
    if (typeof getter !== "function") return null;
    const segments = getter.call(win);
    return Array.isArray(segments) ? segments : null;
  } catch {
    return null;
  }
}

function readSpanning(win: Window, query: string): boolean {
  try {
    return typeof win.matchMedia === "function" && win.matchMedia(query).matches;
  } catch {
    return false;
  }
}

function readInput(win: Window, explicitOverride?: DualPaneOverride | null): DualPaneInput {
  return {
    segments: readSegments(win),
    spanningVertical: readSpanning(win, "(spanning: single-fold-vertical)"),
    spanningHorizontal: readSpanning(win, "(spanning: single-fold-horizontal)"),
    override: explicitOverride ?? parseDualPaneOverride(win.location?.search ?? ""),
  };
}

/**
 * Live separated-segment geometry for the game shell. Returns the raw
 * platform rects (or null) and re-reads on viewport resizes. The shell pairs
 * this with {@link segmentPaneGeometry} to size panes and pin the footer/popovers
 * exactly over the occlusion when dual-pane comes from the segments API
 * alone (no spanning media to drive the env()-fitted tracks). Safe without
 * a window (renders null).
 */
export function useViewportSegments(): ViewportSegment[] | null {
  const [segments, setSegments] = useState<ViewportSegment[] | null>(() =>
    typeof window === "undefined" ? null : readSegments(window),
  );
  useEffect(() => {
    const update = () => setSegments(readSegments(window));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);
  return segments;
}

/**
 * Live posture hook for the game shell. Defaults to single-pane (phone
 * navigation intact) and re-resolves on viewport resizes and spanning
 * changes. Safe without a window (renders single-pane).
 */
export function useDualPaneLayout(options?: { override?: DualPaneOverride | null }): DualPaneLayout {
  const override = options?.override;
  const [layout, setLayout] = useState<DualPaneLayout>(() =>
    typeof window === "undefined" ? { mode: "single", hinge: null, capability: "none" } : resolveDualPaneLayout(readInput(window, override)),
  );
  useEffect(() => {
    const update = () => setLayout(resolveDualPaneLayout(readInput(window, override)));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    window.visualViewport?.addEventListener("resize", update);
    let spanningQueries: MediaQueryList[] = [];
    try {
      spanningQueries = [
        window.matchMedia("(spanning: single-fold-vertical)"),
        window.matchMedia("(spanning: single-fold-horizontal)"),
      ];
      for (const query of spanningQueries) query.addEventListener("change", update);
    } catch {
      spanningQueries = [];
    }
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.visualViewport?.removeEventListener("resize", update);
      for (const query of spanningQueries) query.removeEventListener("change", update);
    };
  }, [override]);
  return layout;
}
