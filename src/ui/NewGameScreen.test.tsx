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
    // still US because both eras contain US
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

  it("collects era country name seed and calls onStart when valid", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<NewGameScreen eras={ERAS} busy={false} onStart={onStart} onBack={vi.fn()} />);
    await user.type(screen.getByLabelText(/your name/i), "Ada");
    await user.type(screen.getByLabelText(/seed/i), "seed-1");
    await user.click(screen.getByRole("button", { name: /^start$/i }));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ era: "1953", countryId: "US", playerName: "Ada", seed: "seed-1" }));
  });

  it("validates seed charset", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<NewGameScreen eras={ERAS} busy={false} onStart={onStart} onBack={vi.fn()} />);
    await user.type(screen.getByLabelText(/your name/i), "Ada");
    await user.type(screen.getByLabelText(/seed/i), "bad seed!");
    await user.click(screen.getByRole("button", { name: /^start$/i }));
    expect(onStart).not.toHaveBeenCalled();
    expect(screen.getAllByText(/seed may only contain/i).length).toBeGreaterThan(0);
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
