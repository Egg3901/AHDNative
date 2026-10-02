import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GameSession } from "../game/session";
import { MarketsPanel } from "./MarketsPanel";
import type { GameActionParams } from "../game/actionInput";

const SAVED_AT = "2026-10-02T00:00:00.000Z";

describe("source National Corporation compensated-taking flow (#75)", () => {
  it("switches Public to Official, chooses an eligible target and discounted tier, executes and resumes its paid register", async () => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "source-compensated-wizard", playerName: "Alex", mode: "hos", homeRegionId: "NY" });
    expect(session.act("nationalizeCorporation", { corporationId: "US-media", tier: "seizure" }).ok).toBe(true);
    const before = JSON.parse(session.serialize(SAVED_AT));
    const target = before.world.corporations["US-manufacturing"];
    const onAction = vi.fn(async (id: string, params?: GameActionParams) => session.act(id, params).ok);
    function LiveCompany() {
      const [markets, setMarkets] = useState(() => session.markets());
      return <MarketsPanel markets={markets} initialId="NAT-US-media" busy={false}
        loadStateOwnership={async country => session.stateOwnership(country)}
        onAction={async (id, params) => {
          const ok = await onAction(id, params);
          setMarkets(session.markets());
          return ok;
        }} />;
    }
    const user = userEvent.setup();
    render(<LiveCompany />);
    expect(screen.queryByRole("tab", { name: "Nationalize" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Official" }));
    await user.click(screen.getByRole("tab", { name: "Nationalize" }));
    await user.click(screen.getByRole("radio", { name: new RegExp(target.name) }));
    expect(screen.getByRole("combobox", { name: "Tier" })).toHaveValue("discounted");
    expect(screen.getByText(/Indicative compensation/i)).toBeInTheDocument();
    expect(screen.getByText(/Final amount computed and debited at execution/i)).toBeInTheDocument();
    expect(screen.getByText(/NPC-owned.*no investor-confidence or political penalty/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Nationalize$/ }));
    expect(onAction).toHaveBeenCalledWith("nationalizeCorporation", { corporationId: "US-manufacturing", tier: "discounted" });
    expect(session.stateOwnership().rows[0]).toMatchObject({ tier: "discounted" });
    expect(session.stateOwnership().rows[0].compensationAnchor).toBeGreaterThan(0);
    await user.click(screen.getByRole("tab", { name: "Register" }));
    expect(await screen.findByText("Discounted")).toBeInTheDocument();
    const resumed = new GameSession();
    resumed.load(session.serialize(SAVED_AT));
    expect(resumed.stateOwnership()).toEqual(session.stateOwnership());
  });
});
