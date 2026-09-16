import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HomeRegionPicker } from "./HomeRegionPicker";
import type { HomeRegionContext } from "@ahdclient/engine";

const REGIONS: HomeRegionContext[] = [
  { id: "CA", name: "California", population: 10672500, electorateLean: { economic: 2, social: 1 }, seeded: true },
  { id: "NY", name: "New York", population: 14830192, electorateLean: { economic: -1, social: -1 }, seeded: true },
  { id: "ZZ", name: "Zulu Average", population: 100000, electorateLean: { economic: 0, social: 0 }, seeded: false },
  { id: "UU", name: "Underived", population: null, electorateLean: null, seeded: false },
];

function renderPicker(overrides: Partial<Parameters<typeof HomeRegionPicker>[0]> = {}) {
  const onChange = vi.fn();
  render(
    <HomeRegionPicker
      regions={REGIONS}
      value="NY"
      onChange={onChange}
      position={{ economic: -1, social: -1 }}
      regionNoun="state"
      {...overrides}
    />,
  );
  return onChange;
}

describe("HomeRegionPicker (#242)", () => {
  it("renders a radio per region with lean wording and shortened population", () => {
    renderPicker();
    const group = screen.getByRole("radiogroup", { name: /Home state/i });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^California/ })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: /^New York/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("14.8M")).toBeInTheDocument();
    expect(screen.getByText("Lean not yet derived")).toBeInTheDocument();
    expect(screen.getByText(/country average/)).toBeInTheDocument();
  });

  it("filters the list by name and reports an empty match", async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.type(screen.getByLabelText("Filter states by name"), "cali");
    expect(screen.getByRole("radio", { name: /^California/ })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /^New York/ })).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Filter states by name"));
    await user.type(screen.getByLabelText("Filter states by name"), "zzz-nope");
    expect(screen.getByText(/No states match/)).toBeInTheDocument();
  });

  it("sorts A-Z and largest electorate on demand", async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.selectOptions(screen.getByLabelText("Sort states"), "name");
    const az = screen.getAllByRole("radio").map((radio) => radio.getAttribute("aria-label"));
    expect(az[0]).toMatch(/^California/);
    expect(az[az.length - 1]).toMatch(/^Zulu Average|^Underived/);
    await user.selectOptions(screen.getByLabelText("Sort states"), "population");
    const pop = screen.getAllByRole("radio").map((radio) => radio.getAttribute("aria-label"));
    expect(pop[0]).toMatch(/^New York/);
  });

  it("orders closest-to-my-politics first by default and selects on click", async () => {
    const user = userEvent.setup();
    const onChange = renderPicker();
    // Position matches New York exactly, so it leads the default fit order.
    const first = screen.getAllByRole("radio")[0];
    expect(first.getAttribute("aria-label")).toMatch(/^New York/);
    await user.click(screen.getByRole("radio", { name: /^California/ }));
    expect(onChange).toHaveBeenCalledWith("CA");
    // A controlled value change marks the new selection.
    fireEvent.click(screen.getByRole("radio", { name: /^California/ }));
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
