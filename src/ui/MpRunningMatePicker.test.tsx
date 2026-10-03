import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MpRunningMatePicker } from "./MpRunningMatePicker";

const option = {
  id: "507f1f77bcf86cd799439013",
  name: "Bea",
  party: "3",
  partyName: "Labor",
  homeState: "WY",
  partyColor: "#123456",
  countryId: "US",
};
const secondOption = {
  id: "507f1f77bcf86cd799439014",
  name: "Cal Okafor",
  party: "7",
  partyName: "Green",
  homeState: "UT",
  partyColor: "#00aa55",
  countryId: "US",
};

describe("Native MP running-mate action", () => {
  it("loads and submits only a server-provided eligible player option", async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn();
    const onSave = vi.fn();
    const { rerender } = render(<MpRunningMatePicker electionId="68a000000000000000000001" options={null} currentRunningMateCharacterId={null} currentRunningMateName={null} busy={false} onLoad={onLoad} onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: "Load eligible players" }));
    expect(onLoad).toHaveBeenCalledWith("68a000000000000000000001");

    rerender(<MpRunningMatePicker electionId="68a000000000000000000001" options={[option]} currentRunningMateCharacterId={null} currentRunningMateName={null} busy={false} onLoad={onLoad} onSave={onSave} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Choose a running mate" }), option.id);
    await user.click(screen.getByRole("button", { name: "Save running mate" }));
    expect(onSave).toHaveBeenCalledWith("68a000000000000000000001", option.id);
    expect(screen.getByText(/eligible player from your country/)).toBeInTheDocument();
  });

  it("searches server-eligible players and filters those results by source party", async () => {
    const user = userEvent.setup();
    render(<MpRunningMatePicker electionId="US-president" options={[option, secondOption]} currentRunningMateCharacterId={null} currentRunningMateName={null} busy={false} onLoad={vi.fn()} onSave={vi.fn()} />);

    await user.type(screen.getByRole("searchbox", { name: "Search eligible players" }), "ut");
    const party = screen.getByRole("combobox", { name: "Filter eligible players by party" });
    await user.selectOptions(party, "7");
    const choice = screen.getByRole("combobox", { name: "Choose a running mate" });
    expect(choice).toHaveValue("");
    expect(within(choice).getAllByRole("option").map((item) => item.textContent)).toEqual([
      "Choose an eligible player",
      "Cal Okafor · Green · UT",
    ]);
    const search = screen.getByRole("searchbox", { name: "Search eligible players" });
    await user.clear(search);
    await user.type(search, "cal okafor");
    expect(within(choice).getAllByRole("option").map((item) => item.textContent)).toEqual([
      "Choose an eligible player",
      "Cal Okafor · Green · UT",
    ]);

    await user.selectOptions(choice, secondOption.id);
    expect(screen.getByRole("button", { name: "Save running mate" })).toBeEnabled();
    await user.clear(search);
    await user.selectOptions(party, option.party);
    expect(screen.getByRole("button", { name: "Save running mate" })).toBeDisabled();
  });

  it("shows the source-selected mate and clears it through the null source action", async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn();
    const onSave = vi.fn();
    render(<MpRunningMatePicker
      electionId="US-president"
      options={[]}
      currentRunningMateCharacterId={option.id}
      currentRunningMateName={option.name}
      busy={false}
      onLoad={onLoad}
      onSave={onSave}
    />);

    expect(screen.getAllByRole("status")[0]?.textContent).toContain("Bea");
    await user.click(screen.getByRole("button", { name: "Clear running mate" }));
    expect(onSave).toHaveBeenCalledWith("US-president", null);
  });

  it("discards a selected option when the race or eligible option list changes", async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn();
    const onSave = vi.fn();
    const { rerender } = render(<MpRunningMatePicker
      electionId="US-president"
      options={[option]}
      currentRunningMateCharacterId={null}
      currentRunningMateName={null}
      busy={false}
      onLoad={onLoad}
      onSave={onSave}
    />);
    const select = screen.getByRole("combobox", { name: "Choose a running mate" });
    await user.selectOptions(select, option.id);
    expect(select).toHaveValue(option.id);

    rerender(<MpRunningMatePicker
      electionId="UK-president"
      options={[{ ...option, id: "507f1f77bcf86cd799439014" }]}
      currentRunningMateCharacterId={null}
      currentRunningMateName={null}
      busy={false}
      onLoad={onLoad}
      onSave={onSave}
    />);
    expect(select).toHaveValue("");
    expect(screen.getByRole("button", { name: "Save running mate" })).toBeDisabled();
  });
});
