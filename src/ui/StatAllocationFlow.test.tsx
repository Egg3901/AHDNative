import { useState } from "react";
import { expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { GameSession } from "../game/session";
import { ProfilePanel } from "./ProfilePanel";

it("allocates a legacy character from its reminder, then spends the single free reset through Profile", async () => {
  const session = new GameSession();
  session.create({ era: "1953", countryId: "US", playerName: "Alex", seed: "rendered-stat-allocation" });
  function Harness() {
    const [profile, setProfile] = useState(() => session.profile());
    return <ProfilePanel profile={profile} busy={false} onNavigate={() => {}}
      onSelectConstituency={async () => true}
      onUpdateProfile={async update => { session.updateProfile(update); setProfile(session.profile()); return true; }}
      onStatAllocation={async (mode, stats) => {
        if (mode === "allocate") session.allocateStats(stats); else session.reallocateStats(stats);
        setProfile(session.profile()); return true;
      }} />;
  }
  const mounted = render(<Harness />);
  const initial = screen.getByRole("dialog", { name: "Allocate Your Stats" });
  fireEvent.click(within(initial).getByRole("button", { name: "Maybe later" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(session.profile().statAllocation?.dismissed).toBe(true);
  const saved = session.serialize("2026-09-30T00:00:00.000Z");
  session.load(saved);
  mounted.unmount();
  render(<Harness />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Return to stats" }));
  const allocation = await screen.findByRole("dialog", { name: "Allocate Your Stats" });
  fireEvent.click(within(allocation).getByRole("button", { name: "Reset" }));
  fireEvent.click(within(allocation).getByRole("button", { name: "Spread evenly" }));
  fireEvent.click(within(allocation).getByRole("button", { name: "Lock In Stats" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("region", { name: "Character stats" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Reallocate (1 free)" }));
  const reset = screen.getByRole("dialog", { name: "Reallocate Your Stats" });
  expect(within(reset).getByRole("button", { name: "Confirm Reallocation" })).toBeDisabled();
  expect(within(reset).getByText(/resets any growth/)).toBeVisible();
  fireEvent.click(within(reset).getByRole("button", { name: "Spread evenly" }));
  fireEvent.click(within(reset).getByRole("button", { name: "Confirm Reallocation" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.queryByRole("button", { name: "Reallocate (1 free)" })).not.toBeInTheDocument();
  expect(session.profile().statAllocation?.canReallocate).toBe(false);
});
