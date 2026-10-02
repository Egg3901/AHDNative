import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { deserializeSave } from "@ahdclient/engine";
import { GameSession } from "../game/session";
import type { GameScreenProps } from "../game/types";
import { MarketsPanel } from "./MarketsPanel";

describe("official National Corporation controls", () => {
  it("uses public actions to split an industry and merge it into another state company, then continues a save", async () => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "national-reorganization-ui", playerName: "Alex", mode: "hos", homeRegionId: "NY" });
    expect(session.act("nationalizeCorporation", { corporationId: "US-media", tier: "seizure" }).ok).toBe(true);
    expect(session.act("splitNationalCorporation", { sectorType: "energy", newCorpName: "State Energy" }).ok).toBe(true);
    const primaryId = session.stateOwnership().nationalCorporationId!;
    const energyId = session.markets().nationalCompanyManagement!.corporations.find(corporation => corporation.name === "State Energy")!.id;
    function LiveCompany() {
      const [markets, setMarkets] = useState(() => session.markets());
      const onAction: GameScreenProps["onAction"] = (id, params) => {
        const result = session.act(id, params);
        setMarkets(session.markets());
        return result.ok;
      };
      return <MarketsPanel markets={markets} initialId={primaryId} busy={false} onAction={onAction} loadStateOwnership={async () => session.stateOwnership()} />;
    }
    const user = userEvent.setup();
    render(<LiveCompany />);
    expect(screen.queryByRole("region", { name: "Reorganize state corporations" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Official", exact: true }));
    const management = screen.getByRole("region", { name: "Reorganize state corporations" });
    await user.selectOptions(within(management).getByLabelText("Industry to split off"), "media");
    await user.type(within(management).getByLabelText("New state corporation name"), "State Media");
    await user.click(within(management).getByRole("button", { name: "Split off industry" }));
    const split = deserializeSave(session.serialize("2026-10-02T00:00:00.000Z"));
    const media = Object.values(split.corporations).find(corporation => corporation.name === "State Media")!;
    const assets = Object.values(split.corporateSectors!).filter(asset => asset.corporationId === media.id);
    expect(assets.length).toBeGreaterThan(0);
    await user.selectOptions(screen.getByLabelText("Merge target for State Media"), energyId);
    await user.click(screen.getByRole("button", { name: "Merge media into State Energy" }));
    const merged = deserializeSave(session.serialize("2026-10-02T00:00:00.000Z"));
    expect(merged.corporations[media.id]).toBeUndefined();
    expect(merged.corporations[energyId]!.assignedSectorTypes).toEqual(["energy", "media"]);
    for (const asset of assets) expect(merged.corporateSectors![asset.id]).toEqual({ ...asset, corporationId: energyId });
    const resumed = new GameSession();
    resumed.load(session.serialize("2026-10-02T00:00:00.000Z"));
    resumed.advance();
    const continued = new GameSession();
    continued.load(resumed.serialize("2026-10-02T00:00:00.000Z"));
    expect(continued.markets().nationalCompanyManagement!.corporations.find(corporation => corporation.id === energyId)!.assignedSectorTypes).toEqual(["energy", "media"]);
  }, 30_000);
});
