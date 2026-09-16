import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HelpPanel } from "./HelpPanel";
import { SUPPORT_DESTINATIONS } from "../online/support";

// Centralized native reachability gate for issue #82. Every public
// destination mirrored from AHDGame HelpDropdown at pinned revision
// e364c049 (wiki/guides visibility, about, Discord, Patreon, supporter
// wall, support email, service status) must stay reachable through the
// allowlisted native opener with a visible network-required mark, while
// the local guide stays offline. Account settings, feedback, the
// suggestions board, and Quick Suggest capture are authenticated MP
// surface concerns and must not appear here.
const REFERENCE_DESTINATIONS = [
  { id: "wiki", label: "Wiki", url: "https://wiki.ahousedividedgame.com" },
  { id: "guides", label: "Game guides", url: "https://ahousedividedgame.com/guides" },
  { id: "about", label: "About A House Divided", url: "https://ahousedividedgame.com/about" },
  { id: "discord", label: "Discord community", url: "https://discord.gg/DmF8zJJuqN" },
  { id: "patreon", label: "Support the game", url: "https://www.patreon.com/cw/AHouseDividedGame/membership" },
  { id: "supporters", label: "Supporter wall", url: "https://lakesidegames.net/supporters" },
  { id: "email", label: "Email support", url: "mailto:admin@ahousedividedgame.com" },
  { id: "status", label: "Service status", url: "https://ops.ahousedividedgame.com/status" },
] as const;

describe("HelpReachability", () => {
  it("keeps the exact reference destination set behind the native opener", () => {
    expect(SUPPORT_DESTINATIONS.map((destination) => destination.id)).toEqual(
      REFERENCE_DESTINATIONS.map((destination) => destination.id),
    );
    expect(SUPPORT_DESTINATIONS.map((destination) => destination.url)).toEqual(
      REFERENCE_DESTINATIONS.map((destination) => destination.url),
    );
  });

  it("marks every destination network-required and routes each through the opener", async () => {
    const user = userEvent.setup();
    const openExternal = vi.fn().mockResolvedValue(undefined);
    render(<HelpPanel openExternal={openExternal} />);

    expect(screen.getByText(/the local guides above remain available offline/i)).toBeInTheDocument();
    for (const destination of REFERENCE_DESTINATIONS) {
      const button = screen.getByRole("button", { name: new RegExp(`${destination.label}.*network required`, "i") });
      expect(button).toBeVisible();
      await user.click(button);
    }
    expect(openExternal).toHaveBeenCalledTimes(REFERENCE_DESTINATIONS.length);
    REFERENCE_DESTINATIONS.forEach((destination, index) => {
      expect(openExternal).toHaveBeenNthCalledWith(index + 1, destination.id);
    });
  });

  it("reports an opener failure without losing the offline guide", async () => {
    const user = userEvent.setup();
    const openExternal = vi.fn().mockRejectedValueOnce(new Error("offline"));
    render(<HelpPanel openExternal={openExternal} />);

    await user.click(screen.getByRole("button", { name: /wiki.*network required/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not open/i);
    expect(screen.getByRole("heading", { name: "Start a local world" })).toBeInTheDocument();
  });
});
