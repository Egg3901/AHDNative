import { render, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { GameScreenProps } from "../game/types";
import { LEGISLATURE_NAV_STORAGE_KEY } from "../game/legislature";
import { LegislationRoute } from "./LegislationRoute";

// The panel is a heavy DTO consumer; this test only cares about the selection
// the route feeds its loader, so swap it for a prop recorder.
const panelProps = vi.hoisted(() => ({ current: undefined as { initialChamberKey?: string } | undefined }));
vi.mock("./LegislationDetailsPanel", () => ({
  LegislationDetailsPanel: (props: { initialChamberKey?: string }) => {
    panelProps.current = props;
    return null;
  },
}));

const stubLoad = () =>
  vi.fn(async (_selection?: unknown) => ({})) as unknown as GameScreenProps["loadLegislation"];

beforeEach(() => {
  window.localStorage.clear();
  panelProps.current = undefined;
});

it("restores the persisted chamber but not the expanded bill", async () => {
  window.localStorage.setItem(
    LEGISLATURE_NAV_STORAGE_KEY,
    JSON.stringify({ US: { chamberKey: "senate", billId: "bill-1" } }),
  );
  const load = stubLoad();
  render(<LegislationRoute load={load} revision={{}} busy={false} onAction={vi.fn()} countryId="US" />);
  await waitFor(() => expect(load).toHaveBeenCalled());
  // The chamber survives relaunch...
  expect(panelProps.current?.initialChamberKey).toBe("senate");
  // ...but the previously-opened bill is never reselected, so its card stays
  // collapsed with a "Show details" control instead of a forced expansion.
  expect(load).toHaveBeenCalledWith({ billId: null });
  expect(load).not.toHaveBeenCalledWith({ billId: "bill-1" });
});

it("still opens a deep-linked bill by id", async () => {
  const load = stubLoad();
  render(<LegislationRoute load={load} revision={{}} busy={false} onAction={vi.fn()} countryId="US" initialId="bill-9" />);
  await waitFor(() => expect(load).toHaveBeenCalledWith({ billId: "bill-9" }));
});
