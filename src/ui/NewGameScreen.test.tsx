import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewGameScreen } from "./NewGameScreen";
import type { EraChoice } from "../game/types";

const ERAS: EraChoice[] = [
  { id: "1953", label: "1953", countries: [{ id: "US", name: "United States" }, { id: "UK", name: "United Kingdom" }] },
  { id: "1991", label: "1991", countries: [{ id: "US", name: "United States" }, { id: "DE", name: "Germany" }] },
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
    const radios = screen.getAllByRole("radio");
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
