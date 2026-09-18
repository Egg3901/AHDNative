/**
 * MP Settings entry/return parity (#510, settings route family).
 *
 * Settings (including Appearance) is reachable from the home screen and the
 * SP drawer, but the ready MP shell exposes no entry: an MP player must exit
 * multiplayer to reach device settings. This gate pins the reproduction:
 * the ready MP screen must expose a Settings entry that opens the shared
 * device Settings surface in place and returns to the MP sections.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MpModeScreen } from "./MpModeScreen";
import { DEFAULT_PREFERENCES } from "../preferences";

const USER = "507f1f77bcf86cd799439011";

const probe = JSON.stringify({ active: true, sub: USER, username: "Ada" });
const me = JSON.stringify({
  character: { _id: "c1", name: "Ada", party: "Labor", homeState: "CA", cashOnHand: 1000, actions: 3, countryId: "US" },
  corporation: null,
});
const turn = JSON.stringify({ currentTurn: 12, currentYear: 1862, isActive: true, isProcessing: false, nextScheduledTurn: null });
const nav = JSON.stringify({ user: { id: USER, username: "Ada", isAdmin: false }, hasCharacter: true, characterCountryId: "US", characterName: "Ada", unreadMailCount: 0 });
const inbox = JSON.stringify({ notifications: [], unreadCount: 0, total: 0, hasMore: false });
const emptyMail = JSON.stringify({ mails: [], unreadCount: 0, total: 0, hasMore: false });
const emptySent = JSON.stringify({ mails: [], total: 0, hasMore: false });

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  window.dispatchEvent(new Event("resize"));
}

afterEach(() => {
  vi.restoreAllMocks();
});

function readyHost() {
  return {
    fetch: async (op: string) => {
      if (op === "auth-session") return probe;
      if (op === "character-me") return me;
      if (op === "turn-status") return turn;
      if (op === "client-nav") return nav;
      if (op === "notifications") return inbox;
      if (op === "mail-inbox") return emptyMail;
      if (op === "mail-sent") return emptySent;
      throw new Error(`unexpected fetch ${op}`);
    },
    mutate: async () => {
      throw new Error("unexpected mutate");
    },
    beginSignIn: async () => {},
  };
}

describe.each([320, 390, 1280])("MP settings entry at %spx (#510)", (width) => {
  it("exposes Settings from the MP sections and returns to MP context", async () => {
    setViewport(width);
    const user = userEvent.setup();
    const onPreferencesChange = vi.fn();
    render(
      <MpModeScreen
        host={readyHost()}
        onExit={() => {}}
        preferences={DEFAULT_PREFERENCES}
        onPreferencesChange={onPreferencesChange}
      />,
    );
    await screen.findByRole("heading", { name: "Ada" });

    const sections = within(screen.getByRole("navigation", { name: "Multiplayer sections" }));
    const entry = sections.getByRole("button", { name: "Settings" });
    await user.click(entry);

    // The shared device surface renders in place with its Appearance section.
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Text size" })).toBeInTheDocument();

    // A choice reports through the typed callback; the MP session stays mounted.
    await user.click(screen.getByRole("radio", { name: "Large" }));
    expect(onPreferencesChange).toHaveBeenCalledWith({ ...DEFAULT_PREFERENCES, textSize: "large" });
    expect(screen.getByRole("heading", { name: "Ada" })).toBeInTheDocument();

    // Back restores the MP section list, never the SP drawer or home.
    // The settings section renders last, so its Back row is the last one.
    const backRows = screen.getAllByRole("button", { name: "Back to sections" });
    await user.click(backRows[backRows.length - 1]!);
    expect(
      within(screen.getByRole("navigation", { name: "Multiplayer sections" })).getByRole("button", {
        name: "Settings",
      }),
    ).toBeInTheDocument();
  });

  it("stays honest when device settings are not wired", async () => {
    setViewport(width);
    render(<MpModeScreen host={readyHost()} onExit={() => {}} />);
    await screen.findByRole("heading", { name: "Ada" });

    const sections = within(screen.getByRole("navigation", { name: "Multiplayer sections" }));
    const entry = sections.getByRole("button", { name: "Settings" });
    expect(entry).toBeDisabled();
    expect(entry).toHaveAttribute("title", expect.stringMatching(/unavailable/i));
    // No dead surface behind the disabled entry.
    expect(screen.queryByRole("group", { name: "Text size" })).toBeNull();
  });
});
