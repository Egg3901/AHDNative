import { expect } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/** Exercise the same drawer path players use, retaining the mounted session. */
export async function openMpMenu() {
  if (!screen.queryByRole("dialog", { name: "Game menu" })) {
    await userEvent.click(screen.getByRole("button", { name: "Menu", exact: true }));
  }
  return screen.getByRole("dialog", { name: "Game menu" });
}

export async function openMpDestination(name: "Profile" | "Actions" | "Wallet" | "Inbox" | "Mail" | "Settings") {
  const drawer = await openMpMenu();
  await userEvent.click(within(drawer).getByRole("button", { name: name === "Inbox" ? /^Inbox/ : name, exact: name !== "Inbox" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Game menu" })).toBeNull());
}
