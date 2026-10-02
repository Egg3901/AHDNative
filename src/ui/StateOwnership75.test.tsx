import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GameScreen } from "./GameScreen";
import { GameSession } from "../game/session";
import { DEFAULT_PREFERENCES } from "../preferences";

const SAVED_AT = "2026-10-01T00:00:00.000Z";

describe("State ownership country entry (#75)", () => {
  it("opens the public country register through the source national-budget link and shows an actual saved taking", async () => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "state-register-ui", playerName: "Alex", mode: "hos", homeRegionId: "NY" });
    const save = JSON.parse(session.serialize(SAVED_AT));
    const issuer = save.world.corporations["US-media"];
    issuer.insolventSinceTurn = save.world.meta.turn;
    session.load(JSON.stringify(save));
    expect(session.act("nationalizeCorporation", { corporationId: issuer.id, tier: "seizure" }).ok).toBe(true);
    const resumed = new GameSession();
    resumed.load(session.serialize(SAVED_AT));
    const user = userEvent.setup();
    render(<GameScreen world={resumed.view()} busy={false} preferences={DEFAULT_PREFERENCES}
      onPreferencesChange={vi.fn()} loadProfile={async () => resumed.profile()}
      loadPolitics={async () => resumed.politics()} loadMarkets={async () => resumed.markets()}
      loadStateOwnership={async country => resumed.stateOwnership(country)} loadRegions={async () => resumed.regions()}
      loadCaucusManagement={async () => resumed.caucusManagement()} loadCabinetOffice={async () => resumed.cabinetOffice()}
      loadBondMarket={async () => resumed.bondMarket()} loadPartyManagement={async () => resumed.partyManagement()}
      loadLegislation={async () => resumed.legislation()} loadWorldOverview={async () => resumed.worldOverview()}
      loadHallOfFame={async () => resumed.hallOfFame()} search={async query => resumed.search(query)}
      onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()}
      onUpdateProfile={vi.fn()} onSelectConstituency={vi.fn()} onMarkNotificationRead={vi.fn()} onDeleteNotification={vi.fn()} onMarkAllNotificationsRead={vi.fn()}
      onUpdateWorldFeatureFlags={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /^Menu$/i }));
    const menu = screen.getByRole("dialog", { name: "Game menu" });
    await user.click(within(menu).getByRole("button", { name: "Nation" }));
    await user.click(within(menu).getByRole("button", { name: "National Budget" }));
    await user.click(screen.getByRole("button", { name: /^State ownership register$/i }));
    expect(await screen.findByRole("heading", { name: "State ownership register" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Register" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(issuer.name ?? issuer.tickerSymbol ?? issuer.id)).toBeInTheDocument();
    expect(screen.getByText("Financial distress")).toBeInTheDocument();
    expect(screen.getByText("Executive")).toBeInTheDocument();
    expect(screen.getByText("Seizure")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /United States National Corporation.*media/i }));
    expect(await screen.findByRole("heading", { name: "Company" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to state ownership" }));
    expect(await screen.findByRole("heading", { name: "State ownership register" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Register" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("button", { name: "Back to budget" }));
    expect(await screen.findByRole("button", { name: "State ownership register" })).toBeInTheDocument();
  });
});
