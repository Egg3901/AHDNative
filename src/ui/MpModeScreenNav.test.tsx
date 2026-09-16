/**
 * Focused navigation contract for the Native multiplayer footer (#369).
 *
 * The MP footer reuses the shared Native SVG navigation icon primitive with
 * the same bottom-navigation touch targets, active treatment, safe-area, and
 * focus-visible behavior as single-player, while keeping Multiplayer, Ask,
 * and Menu persistently reachable. Fully native and offline-bundled: no
 * remote icon dependencies.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MpModeScreen } from "./MpModeScreen";
import {
  ASK_ICON_PATH,
  BOTTOM_TABS,
  MENU_ICON_PATH,
} from "./MobileNavigation";
import type { MpBridgeHost } from "../mp/bridge";

const USER = "507f1f77bcf86cd799439011";
const NOTE = "607f1f77bcf86cd799439011";

const probe = JSON.stringify({ active: true, sub: USER, username: "Ada" });
const me = JSON.stringify({
  character: { _id: "c1", name: "Ada", party: "Labor", homeState: "CA", cashOnHand: 1000, actions: 3, countryId: "US" },
  corporation: null,
});
const turn = JSON.stringify({ currentTurn: 12, currentYear: 1862, isActive: true, isProcessing: false, nextScheduledTurn: null });
const inbox = JSON.stringify({
  notifications: [{ _id: NOTE, title: "Turn processed", message: "Done", read: false }],
  unreadCount: 1,
  total: 1,
  hasMore: false,
});

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  window.dispatchEvent(new Event("resize"));
}

afterEach(() => {
  vi.restoreAllMocks();
});

function readyHost(): MpBridgeHost {
  return {
    fetch: async (op: string) => {
      if (op === "auth-session") return probe;
      if (op === "character-me") return me;
      if (op === "turn-status") return turn;
      if (op === "notifications") return inbox;
      throw new Error(`unexpected fetch ${op}`);
    },
    mutate: async () => {
      throw new Error("unexpected mutate");
    },
    beginSignIn: async () => {},
  };
}

async function renderReady(width: number, props?: { onAsk?: () => void; onExit?: () => void }) {
  setViewport(width);
  render(<MpModeScreen host={readyHost()} onAsk={props?.onAsk} onExit={props?.onExit ?? (() => {})} />);
  await screen.findByRole("heading", { name: "Ada" });
  return screen.getByRole("navigation", { name: "Primary" });
}

function nav(query: HTMLElement) {
  return within(query);
}

describe.each([320, 390])("MP footer navigation at %spx", (width) => {
  it("keeps Profile, Actions, Ask, and Menu persistently reachable", async () => {
    const queries = nav(await renderReady(width));
    expect(queries.getByRole("link", { name: "Profile" })).toHaveAttribute("href", "#mp-profile");
    expect(queries.getByRole("link", { name: "Actions" })).toHaveAttribute("href", "#mp-actions");
    expect(queries.getByRole("button", { name: "Ask" })).toBeInTheDocument();
    expect(queries.getByRole("button", { name: "Menu" })).toBeInTheDocument();
  });

  it("renders the shared SVG icon language, not ad hoc text glyphs", async () => {
    const element = await renderReady(width);
    const queries = nav(element);
    for (const [name, path] of [
      ["Profile", BOTTOM_TABS[0].path],
      ["Actions", BOTTOM_TABS[1].path],
      ["Ask", ASK_ICON_PATH],
      ["Menu", MENU_ICON_PATH],
    ] as const) {
      const button = queries.getByRole(name === "Profile" || name === "Actions" ? "link" : "button", { name });
      const svg = button.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg?.querySelector("path")).toHaveAttribute("d", path);
    }
    // The old ad hoc glyphs are gone.
    expect(element.textContent).not.toMatch(/[●?☰]/);
  });

  it("routes Ask/Menu callbacks without replacing shared destinations", async () => {
    const user = userEvent.setup();
    const onAsk = vi.fn();
    const onExit = vi.fn();
    const queries = nav(await renderReady(width, { onAsk, onExit }));
    expect(queries.getByRole("button", { name: "Ask" })).not.toHaveAttribute("data-active");
    expect(queries.getByRole("button", { name: "Menu" })).not.toHaveAttribute("data-active");
    await user.click(queries.getByRole("button", { name: "Ask" }));
    expect(onAsk).toHaveBeenCalledTimes(1);
    await user.click(queries.getByRole("button", { name: "Menu" }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});

describe("MP footer shared-system parity", () => {
  it("reuses the single-player Ask and Menu icon paths", () => {
    expect(ASK_ICON_PATH).toBe(BOTTOM_TABS.find((tab) => tab.id === "ask")!.path);
    expect(MENU_ICON_PATH).toBe("M4 7h16M4 12h16M4 17h16");
  });

  it("shares the bottom-navigation touch, active, safe-area, and focus treatment", () => {
    const css = readFileSync("src/ui/ui.css", "utf8");
    // 56px minimum touch target shared by SP and MP items.
    expect(css).toMatch(/\.ahd-bottomnav-item[^{]*\{[^}]*min-height:\s*56px/);
    // Shared active treatment.
    expect(css).toMatch(/\.ahd-bottomnav-item\[data-active="true"\][^{]*\{[^}]*color:\s*var\(--ahd-fg\)/);
    // Shared keyboard focus treatment.
    expect(css).toMatch(/\.ahd-bottomnav-item:focus-visible/);
    // Footer safe-area padding applies to the MP footer through .ahd-footer.
    expect(css).toMatch(/\.ahd-footer[^{]*\{[^}]*env\(safe-area-inset-bottom\)/);
    // MP footer keeps the shared footer + bottomnav classes, only narrowing
    // the grid to the same four primary destinations.
    expect(css).toMatch(/\.ahd-mp-bottomnav\s*\{[^}]*grid-template-columns:\s*repeat\(4/);
  });

  it("stays fully native and offline-bundled with no remote icon dependencies", async () => {
    const element = await renderReady(390);
    expect(element.querySelector("img")).toBeNull();
    expect(element.querySelector("iframe")).toBeNull();
    expect(element.innerHTML).not.toMatch(/https?:\/\//);
  });
});
