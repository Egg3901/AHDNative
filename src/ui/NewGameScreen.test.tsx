import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewGameScreen } from "./NewGameScreen";
import type { EraChoice } from "../game/types";

type SetupCountry = EraChoice["countries"][number] & { regions: { id: string; name: string }[] };
type SetupEra = Omit<EraChoice, "countries"> & { countries: SetupCountry[] };

const REP = { id: "US_REP", name: "Republican Party", abbreviation: "REP" };

const ERAS: SetupEra[] = [
  { id: "1953", label: "1953", countries: [
    { id: "US", name: "United States", regions: [{ id: "US-CA", name: "California" }, { id: "US-NY", name: "New York" }], rulingParty: REP },
    { id: "UK", name: "United Kingdom", regions: [{ id: "UK-LON", name: "London" }], rulingParty: null },
  ] },
  { id: "1991", label: "1991", countries: [
    { id: "US", name: "United States", regions: [{ id: "US-CA", name: "California" }, { id: "US-TX", name: "Texas" }], rulingParty: REP },
    { id: "DE", name: "Germany", regions: [{ id: "DE-BE", name: "Berlin" }], rulingParty: null },
  ] },
];

describe("NewGameScreen", () => {
  it("renders eras and allows era/country selection", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<NewGameScreen eras={ERAS} busy={false} onStart={onStart} onBack={vi.fn()} />);
    expect(screen.getByText("1953")).toBeInTheDocument();
    expect(screen.getByText("1991")).toBeInTheDocument();
    const select = screen.getByLabelText(/country/i) as HTMLSelectElement;
    expect(select.value).toBe("US");
    await user.click(screen.getByLabelText("1991"));
    expect((screen.getByLabelText(/country/i) as HTMLSelectElement).value).toBe("US");
  });

  it("resets country when switching to era without that country", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<NewGameScreen eras={ERAS} busy={false} onStart={onStart} onBack={vi.fn()} />);
    const select = screen.getByLabelText(/country/i) as HTMLSelectElement;
    await user.selectOptions(select, "UK");
    expect(select.value).toBe("UK");
    await user.click(screen.getByLabelText("1991"));
    expect((screen.getByLabelText(/country/i) as HTMLSelectElement).value).toBe("US");
  });

  it("validates name required and blocks submit", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<NewGameScreen eras={ERAS} busy={false} onStart={onStart} onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /^start$/i }));
    expect(onStart).not.toHaveBeenCalled();
    expect(screen.getAllByText(/enter your name/i).length).toBeGreaterThan(0);
  });

  it("allows single character name and unicode", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<NewGameScreen eras={ERAS} busy={false} onStart={onStart} onBack={vi.fn()} />);
    await user.type(screen.getByLabelText(/your name/i), "Å");
    await user.click(screen.getByRole("button", { name: /^start$/i }));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ playerName: "Å" }));
  });

  it("rejects name longer than 80", async () => {
    const onStart = vi.fn();
    render(<NewGameScreen eras={ERAS} busy={false} onStart={onStart} onBack={vi.fn()} />);
    const input = screen.getByLabelText(/your name/i) as HTMLInputElement;
    expect(input).toHaveAttribute("maxLength", "80");
    // maxLength prevents typing beyond 80, validation also caps at 80
    await userEvent.setup().type(input, "a".repeat(81));
    expect(input.value.length).toBe(80);
  });

  it("collects era country name seed and calls onStart when valid", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<NewGameScreen eras={ERAS} busy={false} onStart={onStart} onBack={vi.fn()} />);
    await user.type(screen.getByLabelText(/your name/i), "Ada");
    await user.type(screen.getByLabelText(/seed/i), "seed-1");
    await user.click(screen.getByRole("button", { name: /^start$/i }));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ era: "1953", countryId: "US", playerName: "Ada", seed: "seed-1" }));
  });

  it("allows seed with unicode and spaces and empty optional", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<NewGameScreen eras={ERAS} busy={false} onStart={onStart} onBack={vi.fn()} />);
    await user.type(screen.getByLabelText(/your name/i), "Ada");
    await user.type(screen.getByLabelText(/seed/i), "bad seed! 🎉 café");
    await user.click(screen.getByRole("button", { name: /^start$/i }));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ seed: "bad seed! 🎉 café" }));
  });

  it("allows empty seed for random generation", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<NewGameScreen eras={ERAS} busy={false} onStart={onStart} onBack={vi.fn()} />);
    await user.type(screen.getByLabelText(/your name/i), "Ada");
    await user.click(screen.getByRole("button", { name: /^start$/i }));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ seed: "" }));
  });

  it("rejects seed longer than 256", async () => {
    render(<NewGameScreen eras={ERAS} busy={false} onStart={vi.fn()} onBack={vi.fn()} />);
    const seedInput = screen.getByLabelText(/seed/i) as HTMLInputElement;
    expect(seedInput).toHaveAttribute("maxLength", "256");
    await userEvent.setup().type(seedInput, "x".repeat(257));
    expect(seedInput.value.length).toBe(256);
  });

  it("submits via keyboard Enter", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<NewGameScreen eras={ERAS} busy={false} onStart={onStart} onBack={vi.fn()} />);
    await user.type(screen.getByLabelText(/your name/i), "Ada{enter}");
    expect(onStart).toHaveBeenCalled();
  });

  it("shows focus-visible era options", () => {
    render(<NewGameScreen eras={ERAS} busy={false} onStart={vi.fn()} onBack={vi.fn()} />);
    const radios = screen.getAllByRole("radio").filter((r) => r.classList.contains("ahd-era-input"));
    expect(radios.length).toBe(2);
    radios.forEach((r) => expect(r).toHaveClass("ahd-era-input"));
  });

  it("reflects busy and shows error alert", () => {
    render(<NewGameScreen eras={ERAS} busy={true} error="engine failed" onStart={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByRole("button", { name: /starting/i })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("engine failed");
  });

  it("calls onBack", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<NewGameScreen eras={ERAS} busy={false} onStart={vi.fn()} onBack={onBack} />);
    await user.click(screen.getByRole("button", { name: /^back$/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("shows empty state when no eras", () => {
    render(<NewGameScreen eras={[]} busy={false} onStart={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText(/no eras available/i)).toBeInTheDocument();
  });
});

describe("NewGameScreen world setup (#241)", () => {
  it("defaults to Career and offers a selectable Head of State mode passed as mode", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<NewGameScreen eras={ERAS} busy={false} onStart={onStart} onBack={vi.fn()} />);
    const career = screen.getByLabelText(/career/i) as HTMLInputElement;
    expect(career.checked).toBe(true);
    await user.type(screen.getByLabelText(/your name/i), "Ada");
    const hos = screen.getByLabelText(/head of state/i) as HTMLInputElement;
    await user.click(hos);
    expect(hos.checked).toBe(true);
    await user.click(screen.getByRole("button", { name: /^start$/i }));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ mode: "hos" }));
  });

  it("requires a home region for the selected country and resets it on country or era change", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<NewGameScreen eras={ERAS} busy={false} onStart={onStart} onBack={vi.fn()} />);
    const region = screen.getByLabelText(/home region/i) as HTMLSelectElement;
    expect(region.value).toBe("US-CA");
    await user.selectOptions(region, "US-NY");
    expect(region.value).toBe("US-NY");
    await user.selectOptions(screen.getByLabelText(/country/i), "UK");
    expect((screen.getByLabelText(/home region/i) as HTMLSelectElement).value).toBe("UK-LON");
    await user.click(screen.getByLabelText("1991"));
    expect((screen.getByLabelText(/home region/i) as HTMLSelectElement).value).toBe("US-CA");
    await user.type(screen.getByLabelText(/your name/i), "Ada");
    await user.click(screen.getByRole("button", { name: /^start$/i }));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ homeRegionId: "US-CA" }));
  });

  it("passes the selected Founding or Historical initialization", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<NewGameScreen eras={ERAS} busy={false} onStart={onStart} onBack={vi.fn()} />);
    await user.type(screen.getByLabelText(/your name/i), "Ada");
    const historical = screen.getByLabelText(/historical/i);
    await user.click(historical);
    await user.click(screen.getByRole("button", { name: /^start$/i }));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ initialization: "historical" }));
  });

  it("shows the governing-party preview in Head of State mode and disables it with an explicit reason when null", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    const ukOnly: SetupEra[] = [{ id: "1953", label: "1953", countries: [ERAS[0].countries[1]] }];
    const { unmount } = render(<NewGameScreen eras={ERAS} busy={false} onStart={onStart} onBack={vi.fn()} />);
    await user.click(screen.getByLabelText(/head of state/i));
    expect(screen.getByText(/Republican Party/)).toBeInTheDocument();
    expect(screen.queryByText(/no governing party/i)).not.toBeInTheDocument();
    unmount();

    render(<NewGameScreen eras={ukOnly} busy={false} onStart={onStart} onBack={vi.fn()} />);
    await user.click(screen.getByLabelText(/head of state/i));
    expect(screen.getByText(/no governing party/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/head of state/i)).toBeDisabled();
  });
});
