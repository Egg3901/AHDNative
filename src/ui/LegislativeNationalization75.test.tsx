import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GameSession } from "../game/session";
import { LegislationDetailsPanel } from "./LegislationDetailsPanel";

const SAVED_AT = "2026-10-03T00:00:00.000Z";

describe("legislative nationalization player flow (#75)", () => {
  it("selects a domestic issuer in the proposal, enacts the real bill and resumes the legislative register", async () => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "legislative-target-ui", playerName: "Alex", mode: "hos", homeRegionId: "NY" });
    // One recorded proposal's resource budget. HoS authority comes from
    // public world creation; no corporation distress or office is injected.
    const initial = JSON.parse(session.serialize(SAVED_AT));
    initial.world.player.nationalInfluence = 5;
    session.load(JSON.stringify(initial));
    const user = userEvent.setup();
    const onAction = (id: string, params?: Record<string, string | number>) => {
      expect(session.act(id, params).ok).toBe(true);
      mounted.rerender(<LegislationDetailsPanel query={session.legislation()} busy={false} onAction={onAction} />);
    };
    const mounted = render(<LegislationDetailsPanel query={session.legislation()} busy={false} onAction={onAction} />);

    await user.selectOptions(screen.getByLabelText("Available legislation"), "state_ownership.nationalize");
    expect(screen.getByRole("button", { name: "Sponsor bill" })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Target corporation"), "US-media");
    expect(screen.getByText("Cost 10 actions + 5 national influence")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Sponsor bill" }));
    expect(session.stateOwnership().rows[0]).toMatchObject({ method: "legislative", tier: "fair", pathLabel: "Legislative" });
    expect(screen.getByText(/signed · Sponsored by Alex/)).toBeVisible();

    session.advance();
    const restored = new GameSession();
    restored.load(session.serialize(SAVED_AT));
    expect(restored.stateOwnership()).toEqual(session.stateOwnership());
    expect(restored.legislation().chambers.flatMap(chamber => chamber.completed).some(bill => bill.status === "signed" && bill.sponsorName === "Alex")).toBe(true);
  });
});
