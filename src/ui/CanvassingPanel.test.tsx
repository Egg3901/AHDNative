import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GameSession } from "../game/session";
import { CanvassingPanel } from "./CanvassingPanel";

function setup(countryId = "US") {
  const session = new GameSession();
  const view = session.create({ era: "1953", countryId, seed: "canvass-panel", playerName: "Canvasser" }).canvassing!;
  const onAction = vi.fn((id: string, params?: Record<string, unknown>) => session.act(id, params));
  render(<CanvassingPanel view={view} busy={false} onAction={onAction} onBack={vi.fn()} />);
  return { session, view, onAction };
}
async function choose(view: ReturnType<GameSession["view"]>["canvassing"], count = "2") {
  const user = userEvent.setup();
  const category = view!.categories[0]!;
  await user.selectOptions(screen.getByRole("combobox", { name: "Canvass demographic category" }), category.id);
  await user.selectOptions(screen.getByRole("combobox", { name: "Canvass demographic group" }), category.groups[0]!.id);
  const input = screen.getByRole("spinbutton", { name: "Number of canvasses" });
  await user.clear(input); await user.type(input, count);
  return { user, category };
}

describe("Voter Canvassing player flow", () => {
  it("previews the selected audience and only charges after confirmation", async () => {
    const { session, view, onAction } = setup();
    const before = session.view().player;
    const { user, category } = await choose(view);
    expect(screen.getByRole("status")).toHaveTextContent(category.groups[0]!.name);
    expect(screen.getByRole("status")).toHaveTextContent("2 AP");
    expect(screen.getByRole("status")).toHaveTextContent("$200.00");
    await user.click(screen.getByRole("button", { name: "Review canvassing" }));
    expect(onAction).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(session.view().player).toEqual(before);
    await user.click(screen.getByRole("button", { name: "Review canvassing" }));
    await user.click(screen.getByRole("button", { name: "Confirm canvassing" }));
    expect(onAction).toHaveBeenCalledWith("canvass", { regionId: view.regionId, demographicCategory: category.id, demographicGroup: category.groups[0]!.id, count: 2 });
    expect(session.view().player.actions).toBe(before.actions - 2);
    expect(session.view().player.funds).toBe(before.funds - 200);
    const loaded = new GameSession(); loaded.load(session.serialize("1953-01-20T00:00:00.000Z"));
    expect(loaded.view().canvassing?.categories[0]?.groups[0]?.before).toBeGreaterThan(0);
  });

  it("shows frozen GBP batch costs and prevents an invalid count", async () => {
    const { view, onAction } = setup("UK");
    const { user } = await choose(view, "3");
    expect(screen.getByRole("status")).toHaveTextContent("£225.00");
    const count = screen.getByRole("spinbutton", { name: "Number of canvasses" });
    await user.clear(count); await user.type(count, "51");
    expect(screen.getByRole("alert")).toHaveTextContent("1 to 50");
    expect(screen.getByRole("button", { name: "Review canvassing" })).toBeDisabled();
    expect(onAction).not.toHaveBeenCalled();
  });
});
