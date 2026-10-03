import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

describe("Native MP running-mate action", () => {
  it("loads and submits only a server-provided eligible player option", async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn();
    const onSave = vi.fn();
    const { rerender } = render(<MpRunningMatePicker electionId="68a000000000000000000001" options={null} busy={false} onLoad={onLoad} onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: "Load eligible players" }));
    expect(onLoad).toHaveBeenCalledWith("68a000000000000000000001");

    rerender(<MpRunningMatePicker electionId="68a000000000000000000001" options={[option]} busy={false} onLoad={onLoad} onSave={onSave} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Choose a running mate" }), option.id);
    await user.click(screen.getByRole("button", { name: "Save running mate" }));
    expect(onSave).toHaveBeenCalledWith("68a000000000000000000001", option.id);
    expect(screen.getByText(/another eligible player/)).toBeInTheDocument();
  });
});
