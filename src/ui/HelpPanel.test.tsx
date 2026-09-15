import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HelpPanel } from "./HelpPanel";

describe("HelpPanel", () => {
  it("explains the supported offline singleplayer loop", () => {
    render(<HelpPanel />);

    expect(screen.getByRole("heading", { name: "Help" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Start a local world" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Actions and turns" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Parties and elections" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Saving and recovery" })).toBeInTheDocument();
    expect(screen.getByText(/runs on this device/i)).toBeInTheDocument();
    expect(screen.getByText(/successful action updates the world and saves automatically/i)).toBeInTheDocument();
  });

  it("keeps offline guidance available and clearly marks network destinations", () => {
    render(<HelpPanel />);

    expect(screen.getByRole("heading", { name: "Available here" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Still unavailable here" })).toBeInTheDocument();
    expect(screen.getByText(/multiplayer accounts, live server play, and player mail are not part of this offline app/i)).toBeInTheDocument();
    expect(screen.getByText(/does not expose the full AHDGame world destinations/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /wiki and guides.*network required/i })).toHaveAttribute("href", "https://wiki.ahousedividedgame.com");
    expect(screen.getByRole("link", { name: /discord community.*network required/i })).toHaveAttribute("href", "https://discord.gg/DmF8zJJuqN");
    expect(screen.getByRole("link", { name: /service status.*network required/i })).toHaveAttribute("href", "https://ops.ahousedividedgame.com/status");
    expect(screen.getByText(/the local guides above remain available offline/i)).toBeInTheDocument();
  });

  it("exposes account and feedback only through the authenticated multiplayer surface", async () => {
    const user = userEvent.setup();
    const onOpenOnlineDestination = vi.fn();
    const { rerender } = render(<HelpPanel />);

    expect(screen.queryByRole("button", { name: /account settings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /feedback and suggestions/i })).not.toBeInTheDocument();

    rerender(<HelpPanel onOpenOnlineDestination={onOpenOnlineDestination} />);
    await user.click(screen.getByRole("button", { name: /account settings/i }));
    await user.click(screen.getByRole("button", { name: /feedback and suggestions/i }));

    expect(onOpenOnlineDestination).toHaveBeenNthCalledWith(1, "settings");
    expect(onOpenOnlineDestination).toHaveBeenNthCalledWith(2, "feedback");
    expect(screen.getByText(/sign in inside multiplayer/i)).toBeInTheDocument();
  });
});
