/**
 * Wallet/portfolio redesign acceptance (#507, complementing #76 and #84).
 *
 * Rendered red-capable tests against the real FinancePanel: phone
 * progressive disclosure with 44px controls and no clipped rows, a deliberate
 * desktop grid, safe-area and glass-fallback CSS contracts, and explicit
 * zero/empty/error/loading plus representative multi-holding data. Rendered
 * viewport cases below pin the real screens at 320/390px phone widths, 768px
 * tablet portrait, 1280px desktop, large text, and the 390x844 Dynamic
 * Island shape, and the final
 * cases drive the real GameSession (create, deposit/buyShares commands,
 * turn advance, serialize, load) and render the reloaded finance view
 * through the panel, so action/save-reload behavior is covered through the
 * actual screen and the real session projector.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FinanceView } from "../game/types";
import { GameSession } from "../game/session";
import { FinancePanel } from "./FinancePanel";
import { drawerRouteIds } from "./MobileNavigation";

const css = readFileSync("src/ui/ui.css", "utf8");

function setViewportWidth(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", {
    value: width,
    configurable: true,
  });
  Object.defineProperty(window, "innerHeight", {
    value: height,
    configurable: true,
  });
  window.dispatchEvent(new Event("resize"));
}

afterEach(() => {
  setViewportWidth(1024, 768);
  delete document.documentElement.dataset.textSize;
});

function makeFinance(overrides: Partial<FinanceView> = {}): FinanceView {
  return {
    cash: 1250.5,
    savings: 300,
    currency: "USD",
    savingsHolder: "First National Bank",
    holdings: [
      {
        id: "h1",
        name: "Acme Steel",
        ticker: "ACME",
        shares: 10,
        price: 25,
        currency: "USD",
      },
      {
        id: "h2",
        name: "Yen Works",
        ticker: "YENW",
        shares: 5,
        price: 1000,
        currency: "JPY",
      },
      {
        id: "h3",
        name: "Harbor Rail",
        ticker: "HRRL",
        shares: 20,
        price: 12.5,
        currency: "USD",
      },
    ],
    deposit: {
      id: "depositSavings",
      name: "Deposit",
      description: "Move cash to savings.",
      cost: 0,
      available: true,
    },
    withdraw: {
      id: "withdrawSavings",
      name: "Withdraw",
      description: "Move savings to cash.",
      cost: 0,
      available: true,
    },
    wealthHistory: [
      {
        turn: 1,
        cash: 8000,
        savings: 2000,
        funds: 100,
        bondsValue: 0,
        sharesValue: 0,
        netWorth: 10100,
      },
      {
        turn: 2,
        cash: 8500,
        savings: 2000,
        funds: 120,
        bondsValue: 0,
        sharesValue: 774,
        netWorth: 11394,
      },
    ],
    ...overrides,
  };
}

describe("wallet loading and error states", () => {
  it("shows a loading status with no balances", () => {
    render(
      <FinancePanel
        finance={makeFinance()}
        section="portfolio"
        busy={false}
        onAction={vi.fn()}
        status="loading"
      />,
    );
    expect(
      screen.getByRole("status", { name: /portfolio loading/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/balances are loading/i)).toBeInTheDocument();
    expect(screen.queryByText("Acme Steel")).not.toBeInTheDocument();
  });

  it("shows an error alert with no stale balances", () => {
    render(
      <FinancePanel
        finance={makeFinance()}
        section="banking"
        busy={false}
        onAction={vi.fn()}
        status="error"
        loadError="Network down."
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/banking unavailable/i);
    expect(alert).toHaveTextContent(/network down/i);
    expect(screen.queryByText("First National Bank")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /deposit/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps cross-navigation available from the error state", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(
      <FinancePanel
        finance={makeFinance()}
        section="portfolio"
        busy={false}
        onAction={vi.fn()}
        status="error"
        onNavigate={onNavigate}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Go to banking" }));
    expect(onNavigate).toHaveBeenCalledWith("banking");
  });
});

describe("wallet zero and empty states", () => {
  it("names zero cash and savings balances explicitly", () => {
    render(
      <FinancePanel
        finance={makeFinance({ cash: 0, savings: 0, holdings: [] })}
        section="portfolio"
        busy={false}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByText("No cash balance.")).toBeInTheDocument();
    expect(screen.getByText("No savings balance.")).toBeInTheDocument();
    expect(screen.getByText("No holdings.")).toBeInTheDocument();
  });

  it("names the unavailable #76 mechanics instead of faking them", () => {
    render(
      <FinancePanel
        finance={makeFinance()}
        section="portfolio"
        busy={false}
        onAction={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/only one savings account is available offline/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /currency conversion, loans, and monetary-policy controls are not available/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /convert|loan|borrow/i }),
    ).not.toBeInTheDocument();
  });
});

describe("wallet phone progressive disclosure", () => {
  it("discloses each holding behind a 44px summary with per-holding currency", () => {
    render(
      <FinancePanel
        finance={makeFinance()}
        section="portfolio"
        busy={false}
        onAction={vi.fn()}
      />,
    );
    const holdings = document.querySelectorAll("details.ahd-wallet-holding");
    expect(holdings).toHaveLength(3);
    for (const holding of holdings) {
      const summary = holding.querySelector("summary") as HTMLElement;
      expect(summary.style.minHeight).toBe("44px");
    }
    // First holding opens by default; every holding names its own currency.
    expect(holdings[0]).toHaveAttribute("open");
    expect(screen.getByText("Harbor Rail")).toBeInTheDocument();
    expect(screen.getAllByText(/JPY/).length).toBeGreaterThan(0);
    expect(
      screen.queryByText(/total portfolio value/i),
    ).not.toBeInTheDocument();
  });

  it("keeps balance values inside 320px rows and controls at 44px", () => {
    render(
      <FinancePanel
        finance={makeFinance({ cash: 1234567890.5, savings: 987654321.25 })}
        section="banking"
        busy={false}
        onAction={vi.fn()}
      />,
    );
    for (const label of ["Cash", "Savings"]) {
      const labelEl = screen.getByText(label, { exact: true });
      const row = labelEl.parentElement!;
      const value = row.lastElementChild as HTMLElement;
      expect(value.style.minWidth).toBe("0");
      expect(value.style.overflowWrap).toBe("anywhere");
    }
    const grid = document.querySelector(".ahd-wallet-grid") as HTMLElement;
    expect(grid).toBeInTheDocument();
    for (const child of Array.from(grid.children)) {
      expect((child as HTMLElement).style.minWidth).toBe("0");
    }
    expect(screen.getByRole("button", { name: /deposit/i }).className).toMatch(
      /ahd-btn/,
    );
    expect(screen.getByLabelText(/amount/i).className).toMatch(/ahd-input/);
  });

  it("renders wallet surfaces on solid cards with footer clearance", () => {
    const { container } = render(
      <FinancePanel
        finance={makeFinance()}
        section="portfolio"
        busy={false}
        onAction={vi.fn()}
      />,
    );
    const wallet = container.querySelector(".ahd-wallet");
    expect(wallet).toBeInTheDocument();
    expect(wallet!.querySelector(".ahd-card")).toBeInTheDocument();
    expect(css).toMatch(
      /\.ahd-wallet\s*\{[^}]*max\([^}]*env\(safe-area-inset-bottom\)/,
    );
  });
});

describe("wallet desktop and contrast contracts", () => {
  it("uses a two-column grid at desktop width without horizontal page scroll", () => {
    expect(css).toMatch(
      /@media\s*\(min-width:\s*1024px\)[\s\S]*?\.ahd-wallet-grid[\s\S]*?grid-template-columns:\s*minmax\(0,\s*7fr\)\s*minmax\(0,\s*5fr\)/,
    );
    expect(css).toMatch(
      /\.ahd-wallet-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    );
    expect(css).toMatch(/\.ahd-wallet[^{]*\{[^}]*max-width:\s*100%/);
  });

  it("boosts card borders when contrast is requested", () => {
    expect(css).toMatch(
      /@media\s*\(prefers-contrast:\s*more\)[\s\S]*?\.ahd-wallet[\s\S]*?border-width:\s*2px/,
    );
  });
});

describe("wallet SP/MP reachability", () => {
  it("exposes both wallet destinations in the shared drawer", () => {
    const ids = drawerRouteIds();
    expect(ids).toContain("portfolio");
    expect(ids).toContain("banking");
  });

  it("marks the wallet unavailable in multiplayer instead of showing SP balances", () => {
    render(
      <FinancePanel
        finance={makeFinance()}
        section="portfolio"
        busy={false}
        onAction={vi.fn()}
        mode="mp"
      />,
    );
    expect(
      screen.getByRole("note", { name: /wallet unavailable in multiplayer/i }),
    ).toHaveTextContent(/unavailable in multiplayer/i);
    expect(screen.queryByText("Acme Steel")).not.toBeInTheDocument();
  });
});

describe("wallet adverse data states", () => {
  it("names an unavailable market price instead of a $0.00 value", () => {
    // NaN across the JSON save interchange arrives as null at runtime.
    const nullPrice = null as unknown as number;
    render(
      <FinancePanel
        finance={makeFinance({
          holdings: [
            {
              id: "h1",
              name: "Acme Steel",
              ticker: "ACME",
              shares: 10,
              price: Number.NaN,
              currency: "USD",
            },
            {
              id: "h2",
              name: "Yen Works",
              ticker: "YENW",
              shares: 5,
              price: nullPrice,
              currency: "JPY",
            },
          ],
        })}
        section="portfolio"
        busy={false}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getAllByText("Price unavailable")).toHaveLength(2);
    expect(
      screen.getByText(/market price unavailable in USD/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/market price unavailable in JPY/),
    ).toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });

  it("renders a single holding with an unavailable price in the stacked layout", () => {
    render(
      <FinancePanel
        finance={makeFinance({
          holdings: [
            {
              id: "h1",
              name: "Acme Steel",
              ticker: "ACME",
              shares: 10,
              price: Number.NaN,
              currency: "USD",
            },
          ],
        })}
        section="portfolio"
        busy={false}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByText("Price unavailable")).toBeInTheDocument();
    expect(
      screen.getByText(/market price unavailable in USD/),
    ).toBeInTheDocument();
  });

  it("keeps very long issuer, ticker, and currency labels rendered in full with wrap contracts", () => {
    const longName =
      "Consolidated Transcontinental Mercantile and Steamship Assurance Corporation of the Northern Provinces".repeat(
        2,
      );
    render(
      <FinancePanel
        finance={makeFinance({
          savingsHolder:
            "The First National Bank and Trust Company of the Greater Metropolitan Harbor District",
          holdings: [
            {
              id: "h1",
              name: longName,
              ticker: "VERYLONGTICKERCODE",
              shares: 3,
              price: 12.5,
              currency: "XXL",
            },
          ],
        })}
        section="portfolio"
        busy={false}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByText(longName)).toBeInTheDocument();
    // Long/unknown currency codes still render a named amount, never a crash or blank.
    const detail = screen.getByText(/per share/);
    expect(detail.textContent).toMatch(/XXL/);
    expect(detail.textContent).toMatch(/12\.50/);
    const nameEl = screen.getByText(longName);
    expect((nameEl as HTMLElement).style.overflowWrap).toBe("anywhere");
  });

  it("renders losses and large values without clipping contracts", () => {
    render(
      <FinancePanel
        finance={makeFinance({ cash: -250.75, savings: 9876543210.99 })}
        section="banking"
        busy={false}
        onAction={vi.fn()}
      />,
    );
    const cashValue = screen.getByText("Cash", { exact: true }).parentElement!
      .lastElementChild as HTMLElement;
    expect(cashValue.textContent).toMatch(/-.*250/);
    expect(cashValue.style.overflowWrap).toBe("anywhere");
    const savingsValue = screen.getByText("Savings", { exact: true })
      .parentElement!.lastElementChild as HTMLElement;
    expect(savingsValue.style.overflowWrap).toBe("anywhere");
    expect(savingsValue.textContent).toMatch(/9,876,543,210/);
  });

  it("renders many holdings with every disclosure keyboard-focusable", async () => {
    const user = userEvent.setup();
    const holdings = Array.from({ length: 25 }, (_, i) => ({
      id: `h${i}`,
      name: `Holding ${i}`,
      ticker: `H${i}`,
      shares: i + 1,
      price: 10,
      currency: "USD",
    }));
    render(
      <FinancePanel
        finance={makeFinance({ holdings })}
        section="portfolio"
        busy={false}
        onAction={vi.fn()}
      />,
    );
    const details = document.querySelectorAll("details.ahd-wallet-holding");
    expect(details).toHaveLength(25);
    // A closed disclosure past the first opens on activation and takes focus;
    // jsdom only toggles details on summary activation (click), not on the
    // Enter keypress itself, so the visible-focus half is pinned via CSS.
    const second = details[1];
    expect(second).not.toHaveAttribute("open");
    const summary = second.querySelector("summary") as HTMLElement;
    summary.focus();
    expect(document.activeElement).toBe(summary);
    await user.click(summary);
    expect(second).toHaveAttribute("open");
    expect(css).toMatch(
      /\.ahd-wallet-disclosure:focus-visible\s*\{[^}]*outline:/,
    );
  });

  it("pins the reduced-motion takeover so wallet rendering adds no animation burden", () => {
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });
});

describe.each([320, 390])("wallet rendered phone viewport at %dpx", (width) => {
  it("renders the full portfolio without fixed-width controls", async () => {
    const user = userEvent.setup();
    setViewportWidth(width, 844);
    const onNavigate = vi.fn();
    render(
      <FinancePanel
        finance={makeFinance()}
        section="portfolio"
        busy={false}
        onAction={vi.fn()}
        onNavigate={onNavigate}
      />,
    );

    // Every portfolio section and holding is present at the compact width.
    expect(
      screen.getByRole("heading", { name: "Portfolio" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Stock holdings" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Portfolio trend" }),
    ).toBeInTheDocument();
    for (const name of ["Acme Steel", "Yen Works", "Harbor Rail"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    // No wallet control carries an inline fixed pixel width that could force
    // horizontal page scrolling on a compact phone.
    for (const element of document.querySelectorAll(
      ".ahd-wallet button, .ahd-wallet input, .ahd-wallet summary, .ahd-wallet .ahd-card",
    )) {
      expect((element as HTMLElement).style.width).not.toMatch(/^[0-9]{3,}px$/);
    }
    // Progressive disclosure stays operable: a closed holding opens on tap.
    const holdings = document.querySelectorAll("details.ahd-wallet-holding");
    const closed = Array.from(holdings).find(
      (d) => !d.hasAttribute("open"),
    ) as HTMLDetailsElement;
    await user.click(closed.querySelector("summary") as HTMLElement);
    expect(closed).toHaveAttribute("open");
    await user.click(screen.getByRole("button", { name: "Go to banking" }));
    expect(onNavigate).toHaveBeenCalledWith("banking");
  });

  it("renders the full banking flow without fixed-width controls", async () => {
    const user = userEvent.setup();
    setViewportWidth(width, 844);
    const onAction = vi.fn();
    render(
      <FinancePanel
        finance={makeFinance()}
        section="banking"
        busy={false}
        onAction={onAction}
        onNavigate={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Banking" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Move money" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/amount/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /deposit/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /withdraw/i })).toBeVisible();
    for (const element of document.querySelectorAll(
      ".ahd-wallet button, .ahd-wallet input, .ahd-wallet .ahd-card",
    )) {
      expect((element as HTMLElement).style.width).not.toMatch(/^[0-9]{3,}px$/);
    }
    await user.clear(screen.getByLabelText(/amount/i));
    await user.type(screen.getByLabelText(/amount/i), "100");
    await user.click(screen.getByRole("button", { name: /deposit/i }));
    expect(onAction).toHaveBeenCalledWith("depositSavings", { amount: 100 });
  });
});

describe("wallet rendered tablet", () => {
  it("renders the full portfolio at 768px with operable disclosure and no fixed-width controls", async () => {
    // 768px tablet portrait is the widest viewport on the single-column
    // phone composition (the two-column grid starts at 1024px): every
    // section, holding, and trend context renders with no inline fixed
    // pixel width that would force horizontal page scrolling, and a closed
    // holding still opens on activation with cross-navigation intact.
    const user = userEvent.setup();
    setViewportWidth(768, 1024);
    const onNavigate = vi.fn();
    render(
      <FinancePanel
        finance={makeFinance()}
        section="portfolio"
        busy={false}
        onAction={vi.fn()}
        onNavigate={onNavigate}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Portfolio" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Stock holdings" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Portfolio trend" }),
    ).toBeInTheDocument();
    for (const name of ["Acme Steel", "Yen Works", "Harbor Rail"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    for (const element of document.querySelectorAll(
      ".ahd-wallet button, .ahd-wallet input, .ahd-wallet summary, .ahd-wallet .ahd-card",
    )) {
      expect((element as HTMLElement).style.width).not.toMatch(/^[0-9]{3,}px$/);
    }
    const holdings = document.querySelectorAll("details.ahd-wallet-holding");
    expect(holdings).toHaveLength(3);
    const closed = Array.from(holdings).find(
      (d) => !d.hasAttribute("open"),
    ) as HTMLDetailsElement;
    await user.click(closed.querySelector("summary") as HTMLElement);
    expect(closed).toHaveAttribute("open");
    await user.click(screen.getByRole("button", { name: "Go to banking" }));
    expect(onNavigate).toHaveBeenCalledWith("banking");
  });
});

describe("wallet rendered desktop", () => {
  it("renders both portfolio columns with trend context at 1280px", () => {
    setViewportWidth(1280, 800);
    render(
      <FinancePanel
        finance={makeFinance()}
        section="portfolio"
        busy={false}
        onAction={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );

    // The desktop composition shows summary, holdings, trend context, and the
    // capability note side by side rather than a stretched phone column.
    expect(
      screen.getByRole("heading", { name: "Portfolio" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Stock holdings" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Portfolio trend" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "More accounts" }),
    ).toBeInTheDocument();
    for (const name of ["Acme Steel", "Yen Works", "Harbor Rail"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    const grid = document.querySelector(".ahd-wallet-grid") as HTMLElement;
    expect(grid).toBeInTheDocument();
    expect(grid.children).toHaveLength(2);
    for (const element of document.querySelectorAll(
      ".ahd-wallet button, .ahd-wallet input, .ahd-wallet .ahd-card",
    )) {
      expect((element as HTMLElement).style.width).not.toMatch(/^[0-9]{3,}px$/);
    }
  });
});

describe("wallet rendered large text", () => {
  it("keeps every wallet control mounted at 320px under large text", async () => {
    const user = userEvent.setup();
    document.documentElement.dataset.textSize = "large";
    setViewportWidth(320, 568);
    const onNavigate = vi.fn();
    render(
      <FinancePanel
        finance={makeFinance()}
        section="portfolio"
        busy={false}
        onAction={vi.fn()}
        onNavigate={onNavigate}
      />,
    );

    expect(screen.getByRole("heading", { name: "Portfolio" })).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Stock holdings" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Portfolio trend" }),
    ).toBeVisible();
    for (const name of ["Acme Steel", "Yen Works", "Harbor Rail"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    // Disclosure summaries stay keyboard-focusable and the cross-link stays
    // reachable when type scales up.
    const summaries = document.querySelectorAll(
      "summary.ahd-wallet-disclosure",
    );
    expect(summaries).toHaveLength(3);
    (summaries[0] as HTMLElement).focus();
    expect(document.activeElement).toBe(summaries[0]);
    await user.click(screen.getByRole("button", { name: "Go to banking" }));
    expect(onNavigate).toHaveBeenCalledWith("banking");
  });
});

describe("wallet Dynamic Island shape", () => {
  it("keeps the banking screen clear and zoom-safe at 390x844", () => {
    // 390x844 is the logical size of a Dynamic Island iPhone: the wallet
    // content starts below the shell chrome, keeps footer clearance, and the
    // amount field keeps the 16px floor so iOS never zooms on focus.
    setViewportWidth(390, 844);
    render(
      <FinancePanel
        finance={makeFinance()}
        section="banking"
        busy={false}
        onAction={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Banking" })).toBeVisible();
    expect(screen.getByLabelText(/amount/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /deposit/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /withdraw/i })).toBeVisible();
    expect(screen.getByLabelText(/amount/i).className).toMatch(/ahd-input/);
    expect(css).toMatch(
      /\.ahd-input,\s*\.ahd-select\s*\{[^}]*font-size:\s*16px/,
    );
    expect(css).toMatch(
      /\.ahd-wallet\s*\{[^}]*max\([^}]*env\(safe-area-inset-bottom\)/,
    );
  });
});

const SAVED_AT = "2026-09-10T00:00:00.000Z";

/** Wallet action/save-reload through the real GameSession (the same
 * create/act/serialize/load/view path the app drives, including the session
 * projectFinance projector). GameSession works under vitest.ui.config.ts:
 * the NominationsPanel live-session flow creates, acts, saves, reloads, and
 * advances through it in this same config. */
function liveWalletSession() {
  const session = new GameSession();
  session.create({
    era: "1953",
    countryId: "US",
    seed: "native-finance-v1",
    playerName: "Alex",
  });
  return session;
}

describe("wallet action and save-reload through the real session", () => {
  it("renders exact reloaded balances after a real deposit and save round-trip", async () => {
    // Every value here is session-produced: the session opens with 10000
    // cash, the real deposit command moves 2000 to savings, the session
    // serializes, a fresh session loads the save string, and the reloaded
    // finance view renders through the real panel, which then dispatches
    // withdraw.
    const user = userEvent.setup();
    const session = liveWalletSession();
    expect(session.view().finance).toMatchObject({ cash: 10000, savings: 0 });

    expect(session.act("depositSavings", { amount: 2000 }).ok).toBe(true);

    const reloaded = new GameSession();
    reloaded.load(session.serialize(SAVED_AT));
    expect(reloaded.view().finance).toMatchObject({
      cash: 8000,
      savings: 2000,
    });

    const finance = reloaded.view().finance;
    expect(finance).toMatchObject({
      cash: 8000,
      savings: 2000,
      currency: "USD",
    });

    const onAction = vi.fn();
    render(
      <FinancePanel
        finance={finance}
        section="banking"
        busy={false}
        onAction={onAction}
      />,
    );
    expect(screen.getByText(finance.savingsHolder)).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Amount"));
    await user.type(screen.getByLabelText("Amount"), "500");
    await user.click(screen.getByRole("button", { name: /withdraw/i }));
    expect(onAction).toHaveBeenCalledWith("withdrawSavings", { amount: 500 });
  });
});

describe("wallet holding company drill", () => {
  // Reference HoldingsTables links each stock row to its corporation page
  // (/corporation/[id]); the Native counterpart is the markets company
  // detail, reachable because the holding id is the corporation id shared
  // with market listings (session projectFinance id: corp.id; projectMarkets
  // listing id: corp.id).
  it("links each holding to its company with a 44px keyboard-focusable control", async () => {
    const user = userEvent.setup();
    const onOpenCompany = vi.fn();
    render(
      <FinancePanel
        finance={makeFinance()}
        section="portfolio"
        busy={false}
        onAction={vi.fn()}
        onOpenCompany={onOpenCompany}
      />,
    );
    const links = screen.getAllByRole("button", { name: /view .* company/i });
    expect(links).toHaveLength(3);
    for (const link of links) {
      expect((link as HTMLElement).style.minHeight).toBe("44px");
    }
    (links[0] as HTMLElement).focus();
    expect(document.activeElement).toBe(links[0]);
    await user.click(
      screen.getByRole("button", { name: "View Yen Works company" }),
    );
    expect(onOpenCompany).toHaveBeenCalledWith("h2");
  });

  it("renders no company link without a handler", () => {
    render(
      <FinancePanel
        finance={makeFinance()}
        section="portfolio"
        busy={false}
        onAction={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /view .* company/i }),
    ).not.toBeInTheDocument();
  });

  it("exposes the company link in the single-holding layout", async () => {
    const user = userEvent.setup();
    const onOpenCompany = vi.fn();
    const single = makeFinance().holdings[0]!;
    render(
      <FinancePanel
        finance={makeFinance({ holdings: [single] })}
        section="portfolio"
        busy={false}
        onAction={vi.fn()}
        onOpenCompany={onOpenCompany}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "View Acme Steel company" }),
    );
    expect(onOpenCompany).toHaveBeenCalledWith("h1");
  });

  it("passes the real session holding id to the drill", async () => {
    // Session-produced id: buyShares for corpId "US-media" records the
    // holding under that corporation id, the same id space the markets
    // detail resolves, so the drilled target is real, not a display key.
    const user = userEvent.setup();
    const session = liveWalletSession();
    expect(
      session.act("buyShares", { corpId: "US-media", shares: 1 }).ok,
    ).toBe(true);
    const reloaded = new GameSession();
    reloaded.load(session.serialize(SAVED_AT));
    const finance = reloaded.view().finance;
    const holding = finance.holdings.find((h) => h.id === "US-media");
    expect(holding).toBeDefined();
    const onOpenCompany = vi.fn();
    render(
      <FinancePanel
        finance={finance}
        section="portfolio"
        busy={false}
        onAction={vi.fn()}
        onOpenCompany={onOpenCompany}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: `View ${holding!.name} company` }),
    );
    expect(onOpenCompany).toHaveBeenCalledWith("US-media");
  });

  it("keeps the company link operable at 320px and present on desktop", () => {
    setViewportWidth(320, 568);
    const { unmount } = render(
      <FinancePanel
        finance={makeFinance()}
        section="portfolio"
        busy={false}
        onAction={vi.fn()}
        onOpenCompany={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "View Acme Steel company" }),
    ).toBeVisible();
    for (const element of document.querySelectorAll(
      ".ahd-wallet button, .ahd-wallet input, .ahd-wallet summary, .ahd-wallet .ahd-card",
    )) {
      expect((element as HTMLElement).style.width).not.toMatch(/^[0-9]{3,}px$/);
    }
    unmount();
    setViewportWidth(1280, 800);
    render(
      <FinancePanel
        finance={makeFinance()}
        section="portfolio"
        busy={false}
        onAction={vi.fn()}
        onOpenCompany={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "View Acme Steel company" }),
    ).toBeInTheDocument();
  });
});

describe("wallet holdings and trend after shares, a turn, and reload", () => {
  it("renders reloaded holdings and recorded trend after shares, a turn, and reload", () => {
    const session = liveWalletSession();
    expect(
      session.act("buyShares", {
        corpId: "US-media",
        shares: 1,
      }).ok,
    ).toBe(true);
    expect(session.act("depositSavings", { amount: 2000 }).ok).toBe(true);
    session.advance();

    const reloaded = new GameSession();
    reloaded.load(session.serialize(SAVED_AT));
    const finance = reloaded.view().finance;
    const holding = finance.holdings.find((h) => h.id === "US-media");
    expect(holding).toBeDefined();
    expect(finance.wealthHistory).toHaveLength(1);

    render(
      <FinancePanel
        finance={finance}
        section="portfolio"
        busy={false}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByText(holding!.name)).toBeInTheDocument();
    expect(screen.getByText(`(${holding!.ticker})`)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Portfolio trend" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/no portfolio history recorded yet/i),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/only one savings account is available offline/i),
    ).toBeInTheDocument();
  });
});
