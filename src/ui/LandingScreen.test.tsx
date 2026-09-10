import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LandingScreen, type LandingScreenProps } from "./LandingScreen";
import type { EraChoice } from "../game/types";
import type { SaveMetadata } from "../game/storage";

const ERAS: EraChoice[] = [
  { id: "1953", label: "1953", countries: [{ id: "US", name: "United States" }] },
  { id: "1979", label: "1979", countries: [{ id: "UK", name: "United Kingdom" }] },
];

const SAVES: SaveMetadata[] = [
  { slotId: "slot-1", playerName: "Ada", countryId: "US", turn: 3, savedAt: "2026-09-01T12:00:00.000Z", schemaVersion: 43 },
];

function props(overrides: Partial<LandingScreenProps> = {}): LandingScreenProps {
  return {
    eras: ERAS,
    saves: [],
    worldActive: false,
    busy: false,
    buildLabel: "Test build",
    reducedMotion: "system",
    pendingDelete: null,
    onNew: vi.fn(),
    onHelp: vi.fn(),
    onSettings: vi.fn(),
    onReturn: vi.fn(),
    onReload: vi.fn(),
    onImport: vi.fn(),
    onLoad: vi.fn(),
    onRequestDelete: vi.fn(),
    onCancelDelete: vi.fn(),
    onConfirmDelete: vi.fn(),
    ...overrides,
  };
}

describe("LandingScreen", () => {
  it("renders the globe, title and era context", () => {
    render(<LandingScreen {...props()} />);
    expect(screen.getByRole("img", { name: /world map/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "A House Divided" })).toBeInTheDocument();
    expect(screen.getByText("1953")).toBeInTheDocument();
    expect(screen.getByText("1979")).toBeInTheDocument();
    expect(screen.getByText("Test build")).toBeInTheDocument();
  });

  it("blocks New game until eras load, then starts the new-game flow", async () => {
    const user = userEvent.setup();
    const onNew = vi.fn();
    const { rerender } = render(<LandingScreen {...props({ eras: [], onNew })} />);
    expect(screen.getByRole("button", { name: "New game" })).toBeDisabled();
    rerender(<LandingScreen {...props({ onNew })} />);
    const button = screen.getByRole("button", { name: "New game" });
    expect(button).toBeEnabled();
    await user.click(button);
    expect(onNew).toHaveBeenCalledTimes(1);
  });

  it("routes Help, Settings and Return to game", async () => {
    const user = userEvent.setup();
    const p = props({ worldActive: true });
    render(<LandingScreen {...p} />);
    await user.click(screen.getByRole("button", { name: "Help" }));
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "Return to game" }));
    expect(p.onHelp).toHaveBeenCalledTimes(1);
    expect(p.onSettings).toHaveBeenCalledTimes(1);
    expect(p.onReturn).toHaveBeenCalledTimes(1);
  });

  it("hides Return to game without an active world", () => {
    render(<LandingScreen {...props()} />);
    expect(screen.queryByRole("button", { name: "Return to game" })).not.toBeInTheDocument();
  });

  it("continues a saved game and confirms deletion before removing", async () => {
    const user = userEvent.setup();
    const p = props({ saves: SAVES });
    const { rerender } = render(<LandingScreen {...p} />);
    await user.click(screen.getByRole("button", { name: "Continue Ada" }));
    expect(p.onLoad).toHaveBeenCalledWith(SAVES[0]);
    await user.click(screen.getByRole("button", { name: "Delete Ada" }));
    expect(p.onRequestDelete).toHaveBeenCalledWith(SAVES[0]);
    rerender(<LandingScreen {...p} pendingDelete={SAVES[0]} />);
    expect(screen.getByRole("dialog")).toHaveTextContent(/permanently delete/i);
    await user.click(screen.getByRole("button", { name: "Confirm delete Ada" }));
    expect(p.onConfirmDelete).toHaveBeenCalledTimes(1);
  });

  it("cancels the deletion confirmation without deleting", async () => {
    const user = userEvent.setup();
    const p = props({ saves: SAVES, pendingDelete: SAVES[0] });
    render(<LandingScreen {...p} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(p.onCancelDelete).toHaveBeenCalledTimes(1);
    expect(p.onConfirmDelete).not.toHaveBeenCalled();
  });

  it("imports a chosen save file and surfaces errors and loading state", async () => {
    const user = userEvent.setup();
    const p = props({ error: "Import failed.", busy: true });
    const { rerender } = render(<LandingScreen {...p} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Import failed.");
    expect(screen.getByText("Loading your world...")).toBeInTheDocument();
    rerender(<LandingScreen {...props({ error: "Import failed.", onImport: p.onImport })} />);
    const file = new File(["{}"], "save.json", { type: "application/json" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);
    expect(p.onImport).toHaveBeenCalledTimes(1);
    expect((p.onImport as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBeInstanceOf(File);
  });
});
