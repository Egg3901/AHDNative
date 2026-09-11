import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { CampaignSongPlayer } from "./CampaignSongPlayer";

afterEach(() => vi.restoreAllMocks());

describe("CampaignSongPlayer", () => {
  it("renders online media with owner autoplay unless the viewer disables it", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    const { rerender } = render(<CampaignSongPlayer videoId="dQw4w9WgXcQ" ownerAutoplay viewerDisablesAutoplay={false} characterName="Ada" />);
    expect(screen.getByTitle("Ada's campaign song")).toHaveAttribute("src", expect.stringContaining("autoplay=1"));
    rerender(<CampaignSongPlayer videoId="dQw4w9WgXcQ" ownerAutoplay viewerDisablesAutoplay characterName="Ada" />);
    expect(screen.getByTitle("Ada's campaign song")).toHaveAttribute("src", expect.stringContaining("autoplay=0"));
  });

  it("keeps offline profile entry useful and removes media on offline or hidden lifecycle events", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const { rerender } = render(<CampaignSongPlayer videoId="dQw4w9WgXcQ" ownerAutoplay={false} viewerDisablesAutoplay={false} characterName="Ada" />);
    expect(screen.getByRole("status")).toHaveTextContent("available when this device is online");
    expect(screen.queryByTitle("Ada's campaign song")).not.toBeInTheDocument();

    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    rerender(<CampaignSongPlayer videoId="dQw4w9WgXcQ" ownerAutoplay={false} viewerDisablesAutoplay={false} characterName="Ada" />);
    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(screen.getByTitle("Ada's campaign song")).toBeInTheDocument());
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() => expect(screen.queryByTitle("Ada's campaign song")).not.toBeInTheDocument());
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });
});
