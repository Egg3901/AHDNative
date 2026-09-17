import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HelpPanel } from "./HelpPanel";

/**
 * Help "Guides and support" network-error contract.
 *
 * A failed support-destination open renders its message on this offline
 * surface, where the viewport can be 320px wide. The message previously
 * used `ahd-error`, a class with no shipped rule, so the error surfaced
 * as unstyled body text: no error identification and no `overflow-wrap`
 * for long connection strings. Every other error surface (Landing,
 * GameScreen, NewGameScreen, MpModeScreen, MpAdminScreen) uses
 * `ahd-alert`. This pins the same here, plus retry reachability: the
 * destination buttons must re-enable after a failure so the action can
 * be retried without leaving the surface. jsdom performs no layout, so
 * the wrap behavior is asserted against the shipped rule text, matching
 * the MetricRowContracts convention.
 */

const css = readFileSync("src/ui/ui.css", "utf8");

describe("help network-error narrow-viewport contract", () => {
  it("renders a failed open with the shared alert treatment, not the undefined ahd-error class", async () => {
    const user = userEvent.setup();
    render(<HelpPanel openExternal={vi.fn().mockRejectedValue(new Error("offline"))} />);

    await user.click(screen.getByRole("button", { name: /wiki.*network required/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not open/i);
    expect(alert.className).toMatch(/(^|\s)ahd-alert(\s|$)/);
    expect(alert.className).not.toMatch(/(^|\s)ahd-error(\s|$)/);
  });

  it("re-enables the destination actions after a failure so retry stays reachable", async () => {
    const user = userEvent.setup();
    render(<HelpPanel openExternal={vi.fn().mockRejectedValue(new Error("offline"))} />);

    const wiki = screen.getByRole("button", { name: /wiki.*network required/i });
    await user.click(wiki);

    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: /wiki.*network required/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /game guides.*network required/i })).toBeEnabled();
  });

  it("ships overflow-wrap on .ahd-alert so long error text contains at 320px", () => {
    const match = css.match(/\.ahd-alert\s*\{([^}]*)\}/);
    expect(match, "missing .ahd-alert rule").toBeTruthy();
    expect(match![1]).toMatch(/overflow-wrap\s*:\s*anywhere/);
  });
});
