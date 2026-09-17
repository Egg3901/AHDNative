import { describe, expect, it } from "vitest";
import {
  IOS_VIEWPORT_VARS,
  computeKeyboardInset,
  installIosViewport,
  type ViewportWindowLike,
  type VisualViewportLike,
} from "./iosViewport";

/**
 * Runtime viewport seam for #436: keyboard/visualViewport facts published as
 * stable CSS variables. jsdom performs no layout and has no visualViewport,
 * so install behavior runs against a fake window. Nothing here is
 * physical-device evidence.
 */

function makeViewport(height = 700, width = 390): VisualViewportLike & { fire(type: string): void } {
  const listeners = new Map<string, Set<() => void>>();
  return {
    height,
    width,
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
  };
}

function makeWindow(innerHeight = 800, innerWidth = 390, vv?: VisualViewportLike | null) {
  const listeners = new Map<string, Set<() => void>>();
  const win: ViewportWindowLike & { fire(type: string): void; counts(type: string): number } = {
    innerHeight,
    innerWidth,
    visualViewport: vv,
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

describe("computeKeyboardInset", () => {
  it("reports zero when there is no visual viewport", () => {
    expect(computeKeyboardInset(800, undefined)).toBe(0);
  });

  it("reports the covered height as the keyboard inset", () => {
    expect(computeKeyboardInset(844, 500)).toBe(344);
  });

  it("clamps rotation transients instead of going negative", () => {
    expect(computeKeyboardInset(700, 844)).toBe(0);
  });

  it("rounds fractional scale heights", () => {
    expect(computeKeyboardInset(844.6, 500.2)).toBe(344);
  });
});

describe("installIosViewport", () => {
  it("pins the published variable names for the layout branch", () => {
    expect(IOS_VIEWPORT_VARS).toEqual({
      keyboardInset: "--ahd-keyboard-inset",
      viewportHeight: "--ahd-viewport-height",
      viewportWidth: "--ahd-viewport-width",
    });
  });

  it("publishes the keyboard inset and viewport size on install", () => {
    const root = document.createElement("div");
    const vv = makeViewport(500, 390);
    installIosViewport(root, makeWindow(844, 390, vv));
    expect(root.style.getPropertyValue("--ahd-keyboard-inset")).toBe("344px");
    expect(root.style.getPropertyValue("--ahd-viewport-height")).toBe("500px");
    expect(root.style.getPropertyValue("--ahd-viewport-width")).toBe("390px");
  });

  it("falls back to window size with zero inset and no visual viewport", () => {
    const root = document.createElement("div");
    installIosViewport(root, makeWindow(844, 390));
    expect(root.style.getPropertyValue("--ahd-keyboard-inset")).toBe("0px");
    expect(root.style.getPropertyValue("--ahd-viewport-height")).toBe("844px");
    expect(root.style.getPropertyValue("--ahd-viewport-width")).toBe("390px");
  });

  it("refreshes on visualViewport resize, window resize, and orientationchange", () => {
    const root = document.createElement("div");
    const vv = makeViewport(844, 390);
    const win = makeWindow(844, 390, vv);
    installIosViewport(root, win);
    expect(root.style.getPropertyValue("--ahd-keyboard-inset")).toBe("0px");

    vv.height = 500;
    vv.fire("resize");
    expect(root.style.getPropertyValue("--ahd-keyboard-inset")).toBe("344px");

    vv.height = 844;
    win.fire("resize");
    expect(root.style.getPropertyValue("--ahd-keyboard-inset")).toBe("0px");

    vv.height = 500;
    win.innerHeight = 844;
    win.fire("orientationchange");
    expect(root.style.getPropertyValue("--ahd-keyboard-inset")).toBe("344px");
  });

  it("tracks keyboard pans via visualViewport scroll", () => {
    const root = document.createElement("div");
    const vv = makeViewport(844, 390);
    installIosViewport(root, makeWindow(844, 390, vv));
    vv.height = 600;
    vv.fire("scroll");
    expect(root.style.getPropertyValue("--ahd-keyboard-inset")).toBe("244px");
  });

  it("removes every listener on uninstall", () => {
    const root = document.createElement("div");
    const vv = makeViewport(844, 390);
    const win = makeWindow(844, 390, vv);
    const handle = installIosViewport(root, win);
    expect(win.counts("resize")).toBe(1);
    expect(win.counts("orientationchange")).toBe(1);
    handle.uninstall();
    expect(win.counts("resize")).toBe(0);
    expect(win.counts("orientationchange")).toBe(0);

    vv.height = 300;
    vv.fire("resize");
    win.fire("resize");
    expect(root.style.getPropertyValue("--ahd-keyboard-inset")).toBe("0px");
  });
});
