import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  assignPanes,
  hingeBounds,
  parseDualPaneOverride,
  resolveDualPaneLayout,
  useDualPaneLayout,
} from "./dualPane";

describe("dualPane posture resolution (#438)", () => {
  it("stays single-pane with no hardware signal, even on a wide viewport", () => {
    // jsdom defaults to a 1024px-wide viewport. A generic wide rectangle is
    // not hinge evidence, so the layout must remain single-pane phone flow.
    window.innerWidth = 1440;
    const layout = resolveDualPaneLayout({});
    expect(layout.mode).toBe("single");
    expect(layout.hinge).toBeNull();
    expect(layout.capability).toBe("none");
  });

  it("treats two side-by-side segments as a vertical-hinge dual layout", () => {
    const layout = resolveDualPaneLayout({
      segments: [
        { x: 0, y: 0, width: 400, height: 800 },
        { x: 416, y: 0, width: 400, height: 800 },
      ],
    });
    expect(layout.mode).toBe("dual");
    expect(layout.hinge).toBe("vertical");
    expect(layout.capability).toBe("segments");
  });

  it("treats two stacked segments as a horizontal-hinge dual layout", () => {
    const layout = resolveDualPaneLayout({
      segments: [
        { x: 0, y: 0, width: 800, height: 400 },
        { x: 0, y: 416, width: 800, height: 400 },
      ],
    });
    expect(layout.mode).toBe("dual");
    expect(layout.hinge).toBe("horizontal");
    expect(layout.capability).toBe("segments");
  });

  it("ignores a lone segment and coincident rectangles", () => {
    expect(resolveDualPaneLayout({ segments: [{ x: 0, y: 0, width: 800, height: 600 }] }).mode).toBe("single");
    expect(
      resolveDualPaneLayout({
        segments: [
          { x: 0, y: 0, width: 800, height: 600 },
          { x: 0, y: 0, width: 800, height: 600 },
        ],
      }).mode,
    ).toBe("single");
  });

  it("honors spanning media only when segments are unavailable", () => {
    expect(resolveDualPaneLayout({ spanningVertical: true }).mode).toBe("dual");
    expect(resolveDualPaneLayout({ spanningVertical: true }).hinge).toBe("vertical");
    expect(resolveDualPaneLayout({ spanningVertical: true }).capability).toBe("spanning-media");
    expect(resolveDualPaneLayout({ spanningHorizontal: true }).hinge).toBe("horizontal");
  });

  it("lets an explicit single override force single-pane over segments", () => {
    const layout = resolveDualPaneLayout({
      segments: [
        { x: 0, y: 0, width: 400, height: 800 },
        { x: 416, y: 0, width: 400, height: 800 },
      ],
      override: "single",
    });
    expect(layout.mode).toBe("single");
    expect(layout.capability).toBe("override");
  });
});

describe("dualPane pane assignment (#438)", () => {
  it("keeps every surface stacked in single-pane phone flow", () => {
    const panes = assignPanes(resolveDualPaneLayout({}));
    expect(panes).toEqual({ navigationPane: 0, contentPane: 0, listPane: 0, detailPane: 0 });
  });

  it("puts navigation/list on pane 0 and content/detail on pane 1 when dual", () => {
    const vertical = assignPanes(resolveDualPaneLayout({ override: "vertical" }));
    expect(vertical).toEqual({ navigationPane: 0, contentPane: 1, listPane: 0, detailPane: 1 });
    const horizontal = assignPanes(resolveDualPaneLayout({ override: "horizontal" }));
    expect(horizontal).toEqual({ navigationPane: 0, contentPane: 1, listPane: 0, detailPane: 1 });
  });
});

describe("dualPane hinge bounds (#438)", () => {
  it("reports the vertical occlusion gap between segments", () => {
    const bounds = hingeBounds([
      { x: 0, y: 0, width: 400, height: 800 },
      { x: 416, y: 0, width: 400, height: 800 },
    ]);
    expect(bounds).toEqual({ orientation: "vertical", start: 400, end: 416 });
  });

  it("reports null without separated segments", () => {
    expect(hingeBounds(null)).toBeNull();
    expect(hingeBounds([{ x: 0, y: 0, width: 800, height: 600 }])).toBeNull();
  });
});

describe("dualPane explicit override signal (#438)", () => {
  it("parses the documented QA override and rejects unknown values", () => {
    expect(parseDualPaneOverride("?ahd-span=vertical")).toBe("vertical");
    expect(parseDualPaneOverride("?ahd-span=horizontal")).toBe("horizontal");
    expect(parseDualPaneOverride("?ahd-span=single")).toBe("single");
    expect(parseDualPaneOverride("?ahd-span=foldable")).toBeNull();
    expect(parseDualPaneOverride("")).toBeNull();
  });
});

describe("useDualPaneLayout (#438)", () => {
  afterEach(() => {
    delete (window as unknown as { getViewportSegments?: unknown }).getViewportSegments;
  });

  it("reports single-pane by default and never from viewport width", () => {
    const { result } = renderHook(() => useDualPaneLayout());
    expect(result.current.mode).toBe("single");
    expect(result.current.capability).toBe("none");
  });

  it("adopts separated segments reported by the platform", () => {
    (window as unknown as { getViewportSegments: () => unknown }).getViewportSegments = () => [
      { x: 0, y: 0, width: 400, height: 800 },
      { x: 416, y: 0, width: 400, height: 800 },
    ];
    let hook: ReturnType<typeof renderHook<ReturnType<typeof useDualPaneLayout>, unknown>>;
    act(() => {
      hook = renderHook(() => useDualPaneLayout());
    });
    expect(hook!.result.current.mode).toBe("dual");
    expect(hook!.result.current.hinge).toBe("vertical");
    expect(hook!.result.current.capability).toBe("segments");
  });

  it("adopts the explicit override without platform segments", () => {
    const { result } = renderHook(() => useDualPaneLayout({ override: "horizontal" }));
    expect(result.current.mode).toBe("dual");
    expect(result.current.hinge).toBe("horizontal");
    expect(result.current.capability).toBe("override");
  });
});
