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

  it("opens allowlisted network destinations through the native-safe boundary", async () => {
    const user = userEvent.setup();
    const openExternal = vi.fn();
    render(<HelpPanel openExternal={openExternal} />);

    expect(screen.getByRole("heading", { name: "Available here" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Still unavailable here" })).toBeInTheDocument();
    expect(screen.getByText(/multiplayer accounts, live server play, and player mail are not part of this offline app/i)).toBeInTheDocument();
    expect(screen.getByText(/does not expose the full AHDGame world destinations/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /wiki.*network required/i }));
    await user.click(screen.getByRole("button", { name: /game guides.*network required/i }));
    await user.click(screen.getByRole("button", { name: /service status.*network required/i }));
    expect(openExternal).toHaveBeenNthCalledWith(1, "wiki");
    expect(openExternal).toHaveBeenNthCalledWith(2, "guides");
    expect(openExternal).toHaveBeenNthCalledWith(3, "status");
    expect(screen.getByText(/the local guides above remain available offline/i)).toBeInTheDocument();
  });

  it("keeps authenticated account and feedback controls inside Multiplayer", () => {
    render(<HelpPanel />);

    expect(screen.queryByRole("button", { name: /account settings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /feedback and suggestions/i })).not.toBeInTheDocument();
    expect(screen.getByText(/account settings, feedback, the suggestions board, and quick suggest screenshot capture are available inside multiplayer/i)).toBeInTheDocument();
    expect(screen.getByText(/after AHDGame authenticates that surface/i)).toBeInTheDocument();
  });
});
