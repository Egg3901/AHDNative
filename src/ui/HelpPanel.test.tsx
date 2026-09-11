import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
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

  it("states the offline boundary and leaves external help out of the local panel", () => {
    render(<HelpPanel />);

    expect(screen.getByRole("heading", { name: "Available here" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Still unavailable here" })).toBeInTheDocument();
    expect(screen.getByText(/multiplayer accounts, live server play, and player mail are not part of this offline app/i)).toBeInTheDocument();
    expect(screen.getByText(/does not expose the full AHDGame world destinations/i)).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
