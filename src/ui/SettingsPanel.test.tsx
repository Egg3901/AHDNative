import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsPanel } from "./SettingsPanel";
import type { Preferences } from "../preferences";

const DEFAULTS: Preferences = {
  textSize: "standard",
  reducedMotion: "system",
  reducedTransparency: "system",
  disableAutoplayOnOtherProfiles: false,
  worldMapSection: "nations",
};

describe("SettingsPanel", () => {
  it("shows the presentation controls and selected values", () => {
    render(<SettingsPanel value={DEFAULTS} onChange={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "Settings" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Text size" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Standard" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Large" })).not.toBeChecked();
    expect(
      within(screen.getByRole("group", { name: "Reduced motion" })).getByRole(
        "radio",
        { name: "Use device setting" },
      ),
    ).toBeChecked();
    expect(
      within(screen.getByRole("group", { name: "Transparency" })).getByRole(
        "radio",
        { name: "Use device setting" },
      ),
    ).toBeChecked();
    expect(
      screen.getByText(
        /presentation choices apply to this app on this device/i,
      ),
    ).toBeInTheDocument();
  });

  it("reports each user choice through the typed preference callback", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SettingsPanel value={DEFAULTS} onChange={onChange} />);

    await user.click(screen.getByRole("radio", { name: "Large" }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULTS,
      textSize: "large",
    });
    await user.click(screen.getByRole("radio", { name: "Reduce motion" }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULTS,
      reducedMotion: "on",
    });
  });

  it("reports the transparency choice through the typed preference callback", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SettingsPanel value={DEFAULTS} onChange={onChange} />);

    expect(
      screen.getByRole("group", { name: "Transparency" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("radio", { name: "Reduce transparency" }),
    );
    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULTS,
      reducedTransparency: "on",
    });
    await user.click(screen.getByRole("radio", { name: "Allow transparency" }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULTS,
      reducedTransparency: "off",
    });
  });

  it("persists the viewer choice to disable autoplay on other profiles", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SettingsPanel value={DEFAULTS} onChange={onChange} />);
    await user.click(
      screen.getByRole("checkbox", {
        name: /disable autoplay on other profiles/i,
      }),
    );
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULTS,
      disableAutoplayOnOtherProfiles: true,
    });
  });

  it("persists the world map section choice", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SettingsPanel value={DEFAULTS} onChange={onChange} />);
    expect(screen.getByRole("radio", { name: "Nations first" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "Regions first" }));
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULTS,
      worldMapSection: "regions",
    });
  });

  it("shows a persistence error without hiding the controls", () => {
    render(
      <SettingsPanel
        value={{
          ...DEFAULTS,
          textSize: "large",
          reducedMotion: "off",
          reducedTransparency: "off",
        }}
        onChange={vi.fn()}
        error="Device preferences could not be saved."
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Device preferences could not be saved.",
    );
    expect(screen.getByRole("radio", { name: "Large" })).toBeChecked();
  });
});
