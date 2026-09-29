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
const capabilities = JSON.stringify({
  user: { id: USER, username: "Ada", isAdmin: false },
  hasCharacter: true,
  characterCountryId: "US",
  characterName: "Ada",
  unreadMailCount: 0,
});
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
      if (op === "client-nav") return capabilities;
      if (op === "notifications") return inbox;
      if (op === "mail-inbox") return JSON.stringify({ mails: [], unreadCount: 0, total: 0, hasMore: false });
      if (op === "mail-sent") return JSON.stringify({ mails: [], total: 0, hasMore: false });
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
    expect(queries.getByRole("button", { name: "Profile" })).toHaveAttribute("aria-current", "page");
    expect(queries.getByRole("button", { name: "Actions" })).toBeEnabled();
    expect(queries.getByRole("button", { name: "Ask" })).toBeInTheDocument();
    expect(queries.getByRole("button", { name: "Menu" })).toBeInTheDocument();
  });

  it("opens on Profile and switches destinations without a long scrolling page", async () => {
    const user = userEvent.setup();
    const primary = await renderReady(width);
    expect(screen.getByRole("region", { name: "Multiplayer status" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Player actions" })).toBeNull();
    await user.click(within(primary).getByRole("button", { name: "Actions" }));
    expect(screen.getByRole("region", { name: "Player actions" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Multiplayer status" })).toBeNull();
    await user.click(within(primary).getByRole("button", { name: "Profile" }));
    expect(screen.getByRole("region", { name: "Multiplayer status" })).toBeVisible();
  });

  it("keeps authoritative resources reachable while away from Profile", async () => {
    const user = userEvent.setup();
    await renderReady(width);
    const footer = within(screen.getByRole("contentinfo", { name: "Multiplayer navigation" }));
    expect(footer.getByText("Turn 12")).toBeVisible();
    await user.click(footer.getByRole("button", { name: "Cash on hand: 1,000" }));
    expect(screen.getByRole("region", { name: "Wallet" })).toBeVisible();
    await user.click(footer.getByRole("button", { name: "Action points: 3" }));
    expect(screen.getByRole("region", { name: "Player actions" })).toBeVisible();
  });

  it("groups server actions using the same categories as singleplayer", async () => {
    const user = userEvent.setup();
    const primary = await renderReady(width);
    await user.click(within(primary).getByRole("button", { name: "Actions" }));
    await user.click(screen.getByRole("tab", { name: /^Fundraising/ }));
    expect(screen.getByRole("button", { name: /^Fundraise:/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Quick Poll:/ })).toBeNull();
    await user.click(screen.getByRole("tab", { name: /^Intelligence/ }));
    expect(screen.getByRole("button", { name: /^Quick Poll:/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Fundraise:/ })).toBeNull();
  });

  it("carries the shared Profile identity and bundled artwork into MP", async () => {
    await renderReady(width);
    const profile = within(screen.getByRole("article", { name: "Player" }));
    expect(profile.getByRole("img", { name: "Politicians meeting in a national chamber" })).toHaveAttribute("src", "/static/heroes/politicians.webp");
    expect(profile.getByRole("heading", { name: "Ada", level: 1 })).toBeVisible();
    expect(profile.getByText("Labor")).toBeVisible();
    expect(profile.queryByText("No office")).toBeNull();
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
      const button = queries.getByRole("button", { name });
      const svg = button.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg?.querySelector("path")).toHaveAttribute("d", path);
    }
    // The old ad hoc glyphs are gone.
    expect(element.textContent).not.toMatch(/[●?☰]/);
  });

  it("opens the game menu without exiting the live session", async () => {
    const user = userEvent.setup();
    const onAsk = vi.fn();
    const onExit = vi.fn();
    const queries = nav(await renderReady(width, { onAsk, onExit }));
    expect(queries.getByRole("button", { name: "Ask" })).not.toHaveAttribute("data-active");
    expect(queries.getByRole("button", { name: "Menu" })).not.toHaveAttribute("data-active");
    await user.click(queries.getByRole("button", { name: "Ask" }));
    expect(onAsk).toHaveBeenCalledTimes(1);
    await user.click(queries.getByRole("button", { name: "Menu" }));
    expect(onExit).not.toHaveBeenCalled();
    const drawer = screen.getByRole("dialog", { name: "Game menu" });
    expect(within(drawer).getByRole("button", { name: "Exit multiplayer" })).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Game menu" })).not.toBeInTheDocument();
    expect(queries.getByRole("button", { name: "Menu" })).toHaveFocus();
    await user.click(queries.getByRole("button", { name: "Menu" }));
    await user.click(within(screen.getByRole("dialog", { name: "Game menu" })).getByRole("button", { name: "Exit multiplayer" }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});

describe.each([320, 390])("MP footer destination focus at %spx", (width) => {
  it("moves focus to the section like the in-screen jump-nav does", async () => {
    const user = userEvent.setup();
    const queries = nav(await renderReady(width));
    await user.click(queries.getByRole("button", { name: "Profile" }));
    expect(window.location.hash).toBe("#mp-profile");
    expect(document.getElementById("mp-profile")).toHaveFocus();

    await user.click(queries.getByRole("button", { name: "Actions" }));
    expect(window.location.hash).toBe("#mp-actions");
    expect(document.getElementById("mp-actions")).toHaveFocus();
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

it("keeps the multiplayer shell and mail draft through an embedded Ask visit", async () => {
  const user = userEvent.setup();
  render(<MpModeScreen host={readyHost()} onExit={() => {}} askContent={<p>Ask conversation</p>} />);
  await screen.findByRole("heading", { name: "Ada" });
  await user.click(screen.getByRole("button", { name: "Menu" }));
  await user.click(within(screen.getByRole("dialog", { name: "Game menu" })).getByRole("button", { name: "Mail" }));
  await user.type(screen.getByPlaceholderText("Subject"), "Keep this draft");
  await user.click(within(screen.getByRole("navigation", { name: "Primary" })).getByRole("button", { name: "Ask" }));
  expect(screen.getByText("Ask conversation")).toBeVisible();
  expect(screen.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Menu" }));
  await user.click(within(screen.getByRole("dialog", { name: "Game menu" })).getByRole("button", { name: "Mail" }));
  expect(screen.getByPlaceholderText("Subject")).toHaveValue("Keep this draft");
});
