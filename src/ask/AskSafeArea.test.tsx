/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const invoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

import { AskPanel } from "./AskPanel";

/**
 * Ask window-surface safe-area composition (#436).
 *
 * The dedicated Ask window (main.tsx `?view=ask`) renders `.askview` with
 * no game-shell wrapper, so the panel must own the Dynamic Island safe
 * areas itself: the header starts below the island/cutout, the composer
 * clears the home indicator, the sides clear rounded corners and the
 * landscape cutout, and the viewport height tracks the dynamic toolbar.
 * Embedded surfaces (`surface="main"`) inherit their shell's insets and
 * stay untouched. Geometry-only: jsdom performs no layout, so the CSS
 * cases pin the shipped stylesheet text and the rendered cases pin the
 * surface hook the CSS keys on. Nothing here is physical-device evidence.
 */

const css = readFileSync("src/ask/ask.css", "utf8");

function routeSignedOut() {
  invoke.mockImplementation((command: string) => {
    if (command === "ask_api") return Promise.resolve({ status: 401, body: "{\"error\":\"no session\"}" });
    return Promise.reject(new Error(`unexpected invoke ${command}`));
  });
}

beforeEach(() => {
  invoke.mockReset();
  localStorage.clear();
});

describe("Ask window-surface safe-area geometry (#436)", () => {
  it("tracks the dynamic toolbar height with a vh fallback", () => {
    expect(css).toMatch(/\.askview\s*\{[^}]*height:\s*100vh[^}]*height:\s*100dvh/);
  });

  it("starts the window surface below the island with side cutout clearance", () => {
    expect(css).toMatch(
      /\.askview\[data-surface="window"\]\s*\{[^}]*padding-top:\s*max\([^}]*env\(safe-area-inset-top\)/,
    );
    expect(css).toMatch(
      /\.askview\[data-surface="window"\]\s*\{[^}]*padding-left:\s*max\([^}]*env\(safe-area-inset-left\)/,
    );
    expect(css).toMatch(
      /\.askview\[data-surface="window"\]\s*\{[^}]*padding-right:\s*max\([^}]*env\(safe-area-inset-right\)/,
    );
  });

  it("clears the home indicator under the window-surface composer without moving desktop", () => {
    expect(css).toMatch(
      /\.askview\[data-surface="window"\] \.av-composer\s*\{[^}]*padding-bottom:\s*max\(10px,\s*var\(--ahd-safe-area-bottom-fallback,\s*0px\),\s*env\(safe-area-inset-bottom\)\)/,
    );
  });

  it("leaves the embedded surface geometry alone", () => {
    expect(css).not.toMatch(/\.askview\[data-surface="main"\]/);
  });
});

describe("Ask surface hook (#436)", () => {
  it("marks the standalone window root so the inset chrome applies", async () => {
    routeSignedOut();
    const { container } = render(<AskPanel surface="window" />);
    await screen.findByRole("button", { name: "Sign in" });
    expect(container.querySelector(".askview")?.getAttribute("data-surface")).toBe("window");
  });

  it("marks the embedded default root so shell insets stay authoritative", async () => {
    routeSignedOut();
    const { container } = render(<AskPanel />);
    await screen.findByRole("button", { name: "Sign in" });
    expect(container.querySelector(".askview")?.getAttribute("data-surface")).toBe("main");
  });
});
