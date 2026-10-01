import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DetailQuery } from "./DetailQuery";

describe("DetailQuery revision refresh", () => {
  it("keeps same-loader content mounted while the new revision loads", async () => {
    let finishRefresh!: (value: string) => void;
    const load = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("Recorded regional inventory")
      .mockImplementationOnce(() => new Promise((resolve) => { finishRefresh = resolve; }));
    const renderQuery = (revision: object, contextKey = "save-1") => (
      <DetailQuery load={load} revision={revision} label="Markets" retainOnRevision contextKey={contextKey}>
        {(value) => <button type="button">{value}</button>}
      </DetailQuery>
    );
    const view = render(renderQuery({ turn: 1 }));

    expect(await screen.findByRole("button", { name: "Recorded regional inventory" })).toBeInTheDocument();
    view.rerender(renderQuery({ turn: 2 }));
    expect(screen.getByRole("button", { name: "Recorded regional inventory" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));

    await act(async () => finishRefresh("Updated regional inventory"));
    expect(await screen.findByRole("button", { name: "Updated regional inventory" })).toBeInTheDocument();
  });

  it("clears retained content when the saved-game context changes", async () => {
    let finishSecond!: (value: string) => void;
    const load = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("Private inventory from save one")
      .mockImplementationOnce(() => new Promise((resolve) => { finishSecond = resolve; }));
    const renderQuery = (contextKey: string) => (
      <DetailQuery load={load} revision={{}} label="Regions" retainOnRevision contextKey={contextKey}>
        {(value) => <p>{value}</p>}
      </DetailQuery>
    );
    const view = render(renderQuery("save-one"));
    expect(await screen.findByText("Private inventory from save one")).toBeInTheDocument();

    view.rerender(renderQuery("save-two"));
    expect(screen.queryByText("Private inventory from save one")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading regions...");
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));

    await act(async () => finishSecond("Inventory from save two"));
    expect(await screen.findByText("Inventory from save two")).toBeInTheDocument();
  });

  it("clears retained content when a same-save refresh fails", async () => {
    let failRefresh!: (reason: Error) => void;
    const load = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("Current regional inventory")
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { failRefresh = reject; }));
    const renderQuery = (revision: object) => (
      <DetailQuery load={load} revision={revision} label="Markets" retainOnRevision contextKey="save-1">
        {(value) => <p>{value}</p>}
      </DetailQuery>
    );
    const view = render(renderQuery({ turn: 1 }));
    expect(await screen.findByText("Current regional inventory")).toBeInTheDocument();
    view.rerender(renderQuery({ turn: 2 }));
    expect(screen.getByText("Current regional inventory")).toBeInTheDocument();
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));

    await act(async () => failRefresh(new Error("Markets unavailable")));
    expect(await screen.findByRole("alert")).toHaveTextContent("Markets unavailable");
    expect(screen.queryByText("Current regional inventory")).not.toBeInTheDocument();
  });
});
