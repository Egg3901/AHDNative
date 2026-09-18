import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MpModeScreen } from "./MpModeScreen";
import type { MpBridgeHost } from "../mp/bridge";

/**
 * MP footer clearance (#436, home-indicator safety).
 *
 * The fixed MP footer grows with the home-indicator inset and large text,
 * so the hardcoded `calc(6rem + env(safe-area-inset-bottom))` floor under
 * .ahd-mp-layout could park the last content row underneath it (a Dynamic
 * Island portrait phone already clears ~99px against the 96px floor). The
 * shell now measures the live footer exactly like GameScreen and the layout
 * tracks that measurement with the shipped floor as fallback.
 *
 * Composition, not constants: the render cases drive the measurement with
 * arbitrary heights and assert the variable follows them; the CSS cases pin
 * that the layout consumes the variable instead of the hardcoded floor.
 * Geometry-only: jsdom performs no layout, and nothing here is
 * physical-device evidence.
 */

const css = readFileSync("src/ui/ui.css", "utf8");

const USER = "507f1f77bcf86cd799439011";
const NOTE = "607f1f77bcf86cd799439011";
const probe = JSON.stringify({ active: true, sub: USER, username: "Ada" });
const me = JSON.stringify({
  character: {
    _id: "c1",
    name: "Ada",
    party: "Labor",
    homeState: "CA",
    cashOnHand: 1000,
    actions: 3,
    countryId: "US",
  },
  corporation: null,
});
const turn = JSON.stringify({
  currentTurn: 12,
  currentYear: 1862,
  isActive: true,
  isProcessing: false,
  nextScheduledTurn: null,
});
const inbox = JSON.stringify({
  notifications: [
    { _id: NOTE, title: "Turn processed", message: "Done", read: false },
  ],
  unreadCount: 1,
  total: 1,
  hasMore: false,
});
const emptyMail = JSON.stringify({
  mails: [],
  unreadCount: 0,
  total: 0,
  hasMore: false,
});

function readyHost(): MpBridgeHost {
  const queues = new Map<string, string[]>([
    ["fetch:auth-session", [probe]],
    ["fetch:character-me", [me]],
    ["fetch:turn-status", [turn]],
    ["fetch:notifications", [inbox]],
    ["fetch:mail-inbox", [emptyMail]],
    ["fetch:mail-sent", [emptyMail]],
  ]);
  return {
    fetch: async (op: string) => {
      const next = queues.get(`fetch:${op}`)?.shift();
      if (next !== undefined) return next;
      if (op === "client-nav")
        return JSON.stringify({ user: null, hasCharacter: false });
      throw new Error(`unexpected call fetch:${op}`);
    },
    mutate: async (op: string) => {
      throw new Error(`unexpected call mutate:${op}`);
    },
    beginSignIn: async () => {},
  };
}

type ResizeCallback = () => void;

let resizeCallbacks: ResizeCallback[];
let disconnectCalls: number;

function stubResizeObserver() {
  resizeCallbacks = [];
  disconnectCalls = 0;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(cb: ResizeCallback) {
        resizeCallbacks.push(cb);
      }
      observe() {}
      unobserve() {}
      disconnect() {
        disconnectCalls += 1;
      }
    },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("MP footer measurement (#436)", () => {
  it("publishes the live footer height on the screen element", () => {
    stubResizeObserver();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      height: 111,
    } as DOMRect);
    render(<MpModeScreen host={readyHost()} onExit={() => {}} />);
    const footer = screen.getByRole("contentinfo", {
      name: "Multiplayer navigation",
    });
    const screenEl = footer.closest("main.ahd-screen") as HTMLElement | null;
    expect(screenEl, "missing MP screen element").toBeTruthy();
    expect(screenEl!.style.getPropertyValue("--ahd-footer-height")).toBe(
      "111px",
    );
  });

  it("re-measures when the footer resizes instead of holding the mount value", () => {
    stubResizeObserver();
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ height: 96 } as DOMRect);
    render(<MpModeScreen host={readyHost()} onExit={() => {}} />);
    const footer = screen.getByRole("contentinfo", {
      name: "Multiplayer navigation",
    });
    const screenEl = footer.closest("main.ahd-screen") as HTMLElement;
    expect(screenEl.style.getPropertyValue("--ahd-footer-height")).toBe("96px");
    expect(resizeCallbacks.length).toBe(1);
    rect.mockReturnValue({ height: 137 } as DOMRect);
    resizeCallbacks[0]();
    expect(screenEl.style.getPropertyValue("--ahd-footer-height")).toBe(
      "137px",
    );
  });

  it("re-publishes after the admin round trip remounts the footer", async () => {
    stubResizeObserver();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      height: 137,
    } as DOMRect);
    render(<MpModeScreen host={readyHost()} onExit={() => {}} />);
    // The header buttons stay disabled until the mount load settles.
    await waitFor(() =>
      expect(screen.getByText("Playing as Ada")).toBeInTheDocument(),
    );
    const footer = screen.getByRole("contentinfo", {
      name: "Multiplayer navigation",
    });
    const firstScreen = footer.closest("main.ahd-screen") as HTMLElement;
    expect(firstScreen.style.getPropertyValue("--ahd-footer-height")).toBe(
      "137px",
    );

    // Admin status swaps the whole main element out; Back mounts a fresh
    // one. The mount-only measurement never re-fires there, so the fresh
    // screen would fall back to the 6rem floor under a taller large-text
    // footer.
    fireEvent.click(
      screen.getByRole("button", { name: "Admin status" }),
    );
    expect(
      screen.queryByRole("contentinfo", { name: "Multiplayer navigation" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    const returnedFooter = screen.getByRole("contentinfo", {
      name: "Multiplayer navigation",
    });
    const returnedScreen = returnedFooter.closest(
      "main.ahd-screen",
    ) as HTMLElement;
    expect(returnedScreen.style.getPropertyValue("--ahd-footer-height")).toBe(
      "137px",
    );
  });

  it("disconnects the observer on unmount", () => {
    stubResizeObserver();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      height: 96,
    } as DOMRect);
    const { unmount } = render(
      <MpModeScreen host={readyHost()} onExit={() => {}} />,
    );
    screen.getByRole("contentinfo", { name: "Multiplayer navigation" });
    unmount();
    expect(disconnectCalls).toBe(1);
  });
});

describe("MP layout clearance composition (#436)", () => {
  it("tracks the measured footer instead of the hardcoded floor", () => {
    const rule = css.match(/\.ahd-mp-layout\s*\{[^}]*\}/);
    expect(rule, "missing MP layout rule").toBeTruthy();
    expect(rule![0]).toMatch(
      /padding-bottom:\s*calc\(var\(--ahd-footer-height,\s*6rem\)\s*\+\s*1rem\)/,
    );
    expect(rule![0]).not.toContain("calc(6rem + env(safe-area-inset-bottom))");
  });

  it("keeps the top island/cutout floor composed with the native fallback", () => {
    const rule = css.match(/\.ahd-mp-layout\s*\{[^}]*\}/);
    expect(rule, "missing MP layout rule").toBeTruthy();
    expect(rule![0]).toContain("var(--ahd-safe-area-top-fallback, 0px)");
    expect(rule![0]).toContain("env(safe-area-inset-top)");
  });
});
