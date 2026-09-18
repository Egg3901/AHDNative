/**
 * SectorsRoute save/reload/turn regression (#89).
 *
 * The panel tests below cover view logic over fixtures; the session tests in
 * src/game/sectors.test.ts cover the engine. This file closes the gap
 * between them: a real GameSession drives the real markets projection
 * through serialize/load plus turn advancement, and the async route renders
 * that projection with a working Buy dispatch and company drill.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GameSession } from "../game/session";
import type { MarketsView } from "../game/markets";
import { SectorsRoute } from "./SectorsRoute";

const options = {
  era: "1953",
  countryId: "US",
  seed: "native-sectors-89-route-v1",
  playerName: "Alex",
};
const SAVED_AT = "2026-09-15T00:00:00.000Z";

it("renders recorded sale state through save, reload, and turn advancement", async () => {
  const user = userEvent.setup();
  const session = new GameSession();
  session.create(options);
  expect(session.act("buyShares", { corpId: "US-media", shares: 1 }).ok).toBe(
    true,
  );
  const assetId = session
    .markets()
    .listings.find((entry) => entry.id === "US-media")!.sectorAsset.id;
  expect(session.listSectorForSale(assetId).ok).toBe(true);
  // Explicit affordable anchor, mirroring src/game/sectors.test.ts: the
  // default anchor can exceed post-share cash and must refuse Buy.
  expect(session.updateSectorListing(assetId, 100)).toMatchObject({
    ok: true,
  });

  const reloaded = new GameSession();
  reloaded.load(session.serialize(SAVED_AT));
  const turnBefore = reloaded.markets().turn;
  reloaded.advance();
  expect(reloaded.markets().turn).toBeGreaterThan(turnBefore);

  const onSectorSale = vi.fn();
  const onOpenCompany = vi.fn();
  const onOpenRegion = vi.fn();
  render(
    <SectorsRoute
      load={async () => reloaded.markets()}
      revision={{}}
      busy={false}
      onSectorSale={onSectorSale}
      onOpenCompany={onOpenCompany}
      onOpenRegion={onOpenRegion}
    />,
  );

  // The recorded listing survives the round trip and lands on the For Sale tab.
  const forSaleTab = await screen.findByRole("button", {
    name: "For Sale sectors, 1",
  });
  await user.click(forSaleTab);
  const list = screen.getByRole("list", { name: "Sectors" });
  expect(within(list).getAllByRole("listitem")).toHaveLength(1);

  // Buy reaches the session dispatch with the recorded asset id.
  const buy = screen.getByRole("button", { name: /buy .* sector/i });
  expect(buy).toBeEnabled();
  await user.click(buy);
  expect(onSectorSale).toHaveBeenCalledWith("buy", { assetId });

  // The company link drills to the existing markets destination.
  await user.click(
    screen.getByRole("button", { name: "View US-media company" }),
  );
  expect(onOpenCompany).toHaveBeenCalledWith("US-media");
  await waitFor(() =>
    expect(screen.getByRole("heading", { name: "Sectors" })).toBeInTheDocument(),
  );
});

it("executes a directory Buy through the real session command and keeps ownership through save, reload, and turn", async () => {
  const user = userEvent.setup();
  const session = new GameSession();
  session.create(options);
  expect(session.act("buyShares", { corpId: "US-media", shares: 1 }).ok).toBe(
    true,
  );
  const assetId = session
    .markets()
    .listings.find((entry) => entry.id === "US-media")!.sectorAsset.id;
  expect(session.listSectorForSale(assetId).ok).toBe(true);
  expect(session.updateSectorListing(assetId, 100)).toMatchObject({
    ok: true,
  });

  // Same op contract the app shell uses (App.tsx onSectorSale): the
  // directory dispatch runs the engine command instead of a mock, so this
  // proves the Buy control reaches a real ownership state change.
  const dispatch = (
    op: "list" | "update" | "unlist" | "buy",
    params: { assetId: string; priceAnchor?: number },
  ) => {
    if (op === "buy") session.buySectorForSale(params.assetId);
    else if (op === "list") session.listSectorForSale(params.assetId);
    else if (op === "unlist") session.unlistSectorForSale(params.assetId);
    else session.updateSectorListing(params.assetId, params.priceAnchor ?? 0);
  };
  const route = (revision: object, load: () => Promise<MarketsView>) => (
    <SectorsRoute
      load={load}
      revision={revision}
      busy={false}
      onSectorSale={dispatch}
      onOpenCompany={() => {}}
      onOpenRegion={() => {}}
    />
  );
  const rendered = render(
    route({ step: 1 }, async () => session.markets()),
  );

  await rendered.findByRole("button", { name: "For Sale sectors, 1" });
  await user.click(
    screen.getByRole("button", { name: "For Sale sectors, 1" }),
  );
  await user.click(screen.getByRole("button", { name: /buy .* sector/i }));

  // The engine flips ownership and clears the listing on the live session.
  const bought = session
    .markets()
    .listings.find((entry) => entry.id === "US-media")!;
  expect(bought.sectorAsset.owner).toBe("player");
  expect(bought.sectorAsset.forSale).toBeNull();

  // A fresh projection load reads the bought sector as Owned, not For Sale.
  rendered.rerender(route({ step: 2 }, async () => session.markets()));
  expect(
    await screen.findByRole("button", { name: "Owned sectors, 1" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "For Sale sectors, 0" }),
  ).toBeInTheDocument();

  // Save, reload, and turn advancement keep the recorded ownership.
  const reloaded = new GameSession();
  reloaded.load(session.serialize(SAVED_AT));
  const turnBefore = reloaded.markets().turn;
  reloaded.advance();
  expect(reloaded.markets().turn).toBeGreaterThan(turnBefore);
  const kept = reloaded
    .markets()
    .listings.find((entry) => entry.id === "US-media")!;
  expect(kept.sectorAsset.owner).toBe("player");
  expect(kept.sectorAsset.forSale).toBeNull();
});
