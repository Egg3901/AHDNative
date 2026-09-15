import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_WORLD_FEATURE_FLAGS, WORLD_FEATURE_FLAG_DEFINITIONS } from "@ahdclient/engine";
import { WorldSettingsPanel } from "./WorldSettingsPanel";

describe("WorldSettingsPanel", () => {
  it("renders every canonical rule with its current value", () => {
    render(
      <WorldSettingsPanel
        flags={{ ...DEFAULT_WORLD_FEATURE_FLAGS, events: false }}
        busy={false}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("checkbox")).toHaveLength(WORLD_FEATURE_FLAG_DEFINITIONS.length);
    for (const definition of WORLD_FEATURE_FLAG_DEFINITIONS) {
      const toggle = screen.getByRole("checkbox", { name: definition.label });
      expect(screen.getByText(definition.description)).toBeInTheDocument();
      if (definition.key === "events") expect(toggle).not.toBeChecked();
      else expect(toggle).toBeChecked();
    }
  });

  it("submits the complete map when one rule changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const target = WORLD_FEATURE_FLAG_DEFINITIONS.find((definition) => definition.key === "events")!;
    render(
      <WorldSettingsPanel flags={{ ...DEFAULT_WORLD_FEATURE_FLAGS }} busy={false} onChange={onChange} />,
    );
    await user.click(screen.getByRole("checkbox", { name: target.label }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_WORLD_FEATURE_FLAGS, events: false });
  });

  it("disables every rule while the world is busy", () => {
    render(
      <WorldSettingsPanel flags={{ ...DEFAULT_WORLD_FEATURE_FLAGS }} busy onChange={vi.fn()} />,
    );
    expect(screen.getAllByRole("checkbox")).toHaveLength(WORLD_FEATURE_FLAG_DEFINITIONS.length);
    for (const toggle of screen.getAllByRole("checkbox")) expect(toggle).toBeDisabled();
  });
});
