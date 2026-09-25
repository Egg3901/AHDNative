import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EraDateSelector, resetDateIso } from "./EraDateSelector";

describe("resetDateIso", () => {
  it("maps the first game week to January 1", () => {
    expect(resetDateIso(1991, 1)).toBe("1991-01-01");
  });

  it("moves one seven-day turn per selected week", () => {
    expect(resetDateIso(1991, 2)).toBe("1991-01-08");
    expect(resetDateIso(2027, 48)).toBe("2027-11-26");
  });
});


describe("EraDateSelector player control", () => {
  it("makes the final week of 2027 selectable", () => {
    const onChange = vi.fn();
    render(<EraDateSelector eras={[{ id: "1953", label: "1953", countries: [] }, { id: "1991", label: "1991", countries: [] }]} era="1991" year={1991} week={1} onChange={onChange} />);
    const slider = screen.getByRole("slider", { name: "Starting year and week" }) as HTMLInputElement;
    expect(Number(slider.max) - Number(slider.min) + 1).toBe(75 * 53);
    fireEvent.change(slider, { target: { value: slider.max } });
    expect(onChange).toHaveBeenCalledWith({ era: "1991", year: 2027, week: 53 });
    expect(resetDateIso(2027, 53)).toBe("2027-12-31");
  });
});
