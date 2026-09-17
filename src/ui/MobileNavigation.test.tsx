import { createRef } from "react";
import { readFileSync } from "node:fs";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BottomNav, GameDrawer, MENU_GROUPS, drawerRouteIds } from "./MobileNavigation";

describe("MobileNavigation", () => {
  it("bottom nav has exactly four labeled items", () => {
    const ref = createRef<HTMLButtonElement | null>();
    render(
      <BottomNav route="profile" menuOpen={false} menuButtonRef={ref} onNavigate={vi.fn()} onOpenMenu={vi.fn()} />,
    );
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav).toBeInTheDocument();
    for (const label of ["Profile", "Actions", "Ask", "Menu"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Profile" })).toHaveAttribute("aria-current", "page");
  });

  it.each([
    ["portfolio", "Profile"], ["markets", "Profile"],
    ["partyDetails", "Menu"], ["caucuses", "Menu"],
    ["regions", "Menu"], ["economy", "Menu"], ["ask", "Ask"],
  ] as const)("keeps the parent destination marked while viewing %s", (route, label) => {
    render(<BottomNav route={route} menuOpen={false} menuButtonRef={createRef()} onNavigate={vi.fn()} onOpenMenu={vi.fn()} />);
    expect(screen.getByRole("button", { name: label })).toHaveAttribute("aria-current", route === label.toLowerCase() ? "page" : "location");
    expect(screen.getByRole("button", { name: "Menu" })).toHaveAttribute("aria-expanded", "false");
  });

  it("mirrors the reference menu hierarchy: no Character group, Actions top-level, Nation/World sub-groups", () => {
    // Top-level order matches the reference menu: profile header links, the
    // Actions tab, the Native Ask entry (#358), State, Nation, World, Help.
    expect(MENU_GROUPS.map((g) => g.label)).toEqual(["Profile", "Actions", "Ask", "State", "Nation", "World", "Help"]);
    expect(MENU_GROUPS.some((g) => g.label === "Character")).toBe(false);

    // Nation sections and their in-section order match nationDetailsSections.
    const nation = MENU_GROUPS.find((g) => g.label === "Nation")!;
    expect(nation.sections?.map((s) => s.label)).toEqual(["Politics", "Government", "Economy"]);
    expect(nation.sections?.[0]!.items.map((i) => i.label)).toEqual([
      "Elections", "Parties", "Start a party", "Caucuses", "Politicians",
      "Presidential election", "Political metrics", "Referendums",
    ]);
    expect(nation.sections?.[1]!.items.map((i) => i.label)).toEqual(["Legislature", "Bills and proposals", "Policy", "Cabinet office"]);
    expect(nation.sections?.[2]!.items.map((i) => i.label)).toEqual(["Economy", "National Budget", "National Metrics"]);

    // World sections and their in-section order match worldNavItems groupings;
    // Stock market and Bonds sit under World, not a "Character" group.
    const world = MENU_GROUPS.find((g) => g.label === "World")!;
    expect(world.sections?.map((s) => s.label)).toEqual(["Economy", "Diplomacy", "Other"]);
    expect(world.sections?.[0]!.items.map((i) => i.id)).toEqual(["markets", "bonds", "banking"]);
    expect(world.sections?.[1]!.items.map((i) => i.id)).toEqual(["nations", "worldMap"]);
    expect(world.sections?.[2]!.items.map((i) => i.id)).toEqual(["news", "worldSettings"]);
  });

  it("drawer exposes every reachable destination exactly once", () => {
    const ids = drawerRouteIds();
    for (const id of [
      "actions", "parties", "legislature", "elections", "news", "profile", "portfolio", "banking",
      "politicians", "economy", "budget", "policy", "nations", "state", "help", "settings",
      "legislationDetails", "markets", "search", "partyManagement", "bonds", "caucuses",
      "referendums", "notifications", "regions", "presidentialDetails", "politicalMetrics",
      "ask", "government",
    ]) {
      expect(ids).toContain(id);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("drawer renders the reference group and sub-section headings and keeps turn actions open", async () => {
    const user = userEvent.setup();
    const ref = createRef<HTMLButtonElement | null>();
    const onNavigate = vi.fn();
    const onAdvanceTurn = vi.fn();
    const onSave = vi.fn();
    const onClose = vi.fn();
    const { container } = render(
      <GameDrawer
        open
        route="profile"
        busy={false}
        playerName="Ada"
        playerParty="Labor"
        countryName="United States"
        turn={1}
        date="1953-01-08"
        menuButtonRef={ref}
        onNavigate={onNavigate}
        onAdvanceTurn={onAdvanceTurn}
        onSave={onSave}
        onExit={vi.fn()}
        onClose={onClose}
      />,
    );
    const menu = screen.getByRole("dialog", { name: "Game menu" });
    expect(menu).toBe(container.querySelector("#ahd-drawer"));
    expect(screen.getByText("Ada")).toBeInTheDocument();
    for (const label of ["Profile", "Actions", "Ask", "State", "Nation", "World", "Help"]) {
      expect(within(menu).getByRole("group", { name: label })).toBeInTheDocument();
    }
    const nation = within(menu).getByRole("group", { name: "Nation" });
    await user.click(within(nation).getByRole("button", { name: "Nation" }));
    for (const label of ["Politics", "Government", "Economy"]) {
      expect(within(nation).getByRole("group", { name: label })).toBeInTheDocument();
    }
    const world = within(menu).getByRole("group", { name: "World" });
    await user.click(within(world).getByRole("button", { name: "World" }));
    expect(within(world).getByRole("group", { name: "Economy" })).toBeInTheDocument();
    expect(within(world).getByRole("button", { name: "Stock market" })).toBeInTheDocument();
    expect(within(world).getByRole("button", { name: "Bonds" })).toBeInTheDocument();
    expect(within(world).getByRole("button", { name: "Banking" })).toBeInTheDocument();
    // #352: the in-game World administration surface lives under World > Other.
    expect(within(world).getByRole("button", { name: "World settings" })).toBeInTheDocument();
    await user.click(within(world).getByRole("button", { name: "World settings" }));
    expect(onNavigate).toHaveBeenCalledWith("worldSettings");
    expect(within(nation).getByRole("button", { name: "National Budget" })).toBeInTheDocument();
    expect(within(nation).getByRole("button", { name: "National Metrics" })).toBeInTheDocument();
    // #69: the reference Politics group also carries the presidential race page
    // and the political-metrics registry.
    expect(within(nation).getByRole("button", { name: "Presidential election" })).toBeInTheDocument();
    expect(within(nation).getByRole("button", { name: "Political metrics" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "End turn" }));
    expect(onAdvanceTurn).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save game" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Bills and proposals" }));
    expect(onNavigate).toHaveBeenCalledWith("legislationDetails");
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("collapses deep groups into touch-friendly disclosure controls", async () => {
    const user = userEvent.setup();
    render(
      <GameDrawer open route="profile" busy={false} playerName="Ada" playerParty="Labor"
        countryName="United States" turn={1} date="1953-01-08" menuButtonRef={createRef()}
        onNavigate={vi.fn()} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onClose={vi.fn()} />,
    );
    const nationToggle = screen.getByRole("button", { name: "Nation" });
    expect(nationToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "National Budget" })).not.toBeInTheDocument();
    await user.click(nationToggle);
    expect(nationToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "National Budget" })).toBeInTheDocument();
  });

  it("expands the active deep group when opened on its route (#366)", () => {
    // Reaching a Nation/World destination while the drawer is closed (search
    // result, notification target, resource link) must not leave that group
    // collapsed on the next open: the active route's own entry stays visible.
    const props = {
      busy: false, playerName: "Ada", playerParty: "Labor", countryName: "United States",
      turn: 1, date: "1953-01-08", menuButtonRef: createRef<HTMLButtonElement | null>(),
      onNavigate: vi.fn(), onAdvanceTurn: vi.fn(), onSave: vi.fn(), onExit: vi.fn(), onClose: vi.fn(),
    };
    const { rerender } = render(<GameDrawer open route="profile" {...props} />);
    expect(screen.getByRole("button", { name: "Nation" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "National Budget" })).not.toBeInTheDocument();
    rerender(<GameDrawer open={false} route="profile" {...props} />);
    rerender(<GameDrawer open route="economy" {...props} />);
    expect(screen.getByRole("button", { name: "Nation" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "World" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "National Budget" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Economy" })).toHaveAttribute("aria-current", "page");
  });

  it("resets deep groups to collapsed when reopened on a shallow route (#366)", async () => {
    const user = userEvent.setup();
    const props = {
      busy: false, playerName: "Ada", playerParty: "Labor", countryName: "United States",
      turn: 1, date: "1953-01-08", menuButtonRef: createRef<HTMLButtonElement | null>(),
      onNavigate: vi.fn(), onAdvanceTurn: vi.fn(), onSave: vi.fn(), onExit: vi.fn(), onClose: vi.fn(),
    };
    const { rerender } = render(<GameDrawer open route="profile" {...props} />);
    await user.click(screen.getByRole("button", { name: "Nation" }));
    expect(screen.getByRole("button", { name: "Nation" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "National Budget" })).toBeInTheDocument();
    rerender(<GameDrawer open={false} route="profile" {...props} />);
    rerender(<GameDrawer open route="profile" {...props} />);
    expect(screen.getByRole("button", { name: "Nation" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "World" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "National Budget" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stock market" })).not.toBeInTheDocument();
  });

  it("keeps the unread badge on the Notifications entry (#366)", () => {
    const props = {
      open: true, route: "profile" as const, busy: false, playerName: "Ada", playerParty: "Labor",
      countryName: "United States", turn: 1, date: "1953-01-08",
      menuButtonRef: createRef<HTMLButtonElement | null>(),
      onNavigate: vi.fn(), onAdvanceTurn: vi.fn(), onSave: vi.fn(), onExit: vi.fn(), onClose: vi.fn(),
    };
    const { rerender } = render(<GameDrawer {...props} unreadCount={3} />);
    // The entry keeps its stable accessible name (GameScreenNotifications
    // navigates by it); the count rides in the visual badge beside the label.
    const entry = screen.getByRole("button", { name: "Notifications" });
    expect(within(entry).getByText("3")).toBeInTheDocument();
    rerender(<GameDrawer {...props} unreadCount={0} />);
    expect(within(screen.getByRole("button", { name: "Notifications" })).queryByText("3")).not.toBeInTheDocument();
  });

  it("keeps phone chrome compact: narrow drawer, 44px targets, safe areas (#366)", () => {
    const css = readFileSync("src/ui/ui.css", "utf8");
    // Drawer never covers the full phone width, so the backdrop stays tappable.
    expect(css).toMatch(/\.ahd-drawer[^{]*\{[^}]*width:\s*min\(19rem,\s*calc\(100vw - 3\.5rem\)\)/);
    // Bottom nav keeps four phone columns; every nav touch target is 44px+.
    expect(css).toMatch(/\.ahd-bottomnav[^{]*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
    expect(css).toMatch(/\.ahd-bottomnav-item[^{]*\{[^}]*min-height:\s*56px/);
    expect(css).toMatch(/\.ahd-drawer-item[^{]*\{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.ahd-drawer-disclosure[^{]*\{[^}]*min-height:\s*44px/);
    // Drawer and footer respect the phone safe areas.
    expect(css).toMatch(/\.ahd-drawer[^{]*\{[^}]*env\(safe-area-inset-top\)/);
    expect(css).toMatch(/\.ahd-footer[^{]*\{[^}]*env\(safe-area-inset-bottom\)/);
  });

  it("gives the footer identity link a 24px hit area without growing the compact footer", () => {
    const css = readFileSync("src/ui/ui.css", "utf8");
    // The Profile identity button is an inline text target (~14px tall) between
    // truncated context text: the only footer control below the WCAG 2.5.8
    // minimum while resource buttons (44px) and bottom nav (56px) comply.
    // Hit padding with equal negative margins expands the tap area to 24px+
    // with zero net layout growth, so the 160px footer budget is untouched.
    const rule = css.match(/\.ahd-status-identity-name\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    const body = rule![1]!;
    const padding = body.match(/padding:\s*([\d.]+)rem\s+([\d.]+)rem/);
    const margin = body.match(/margin:\s*(-?[\d.]+)rem\s+(-?[\d.]+)rem/);
    expect(padding).not.toBeNull();
    expect(margin).not.toBeNull();
    // 0.72rem type at 1.2 line-height is ~13.8px; 2 x 0.35rem hit padding
    // reaches ~25px tall, clearing the 24px minimum at the default root size.
    expect(parseFloat(padding![1]!)).toBeGreaterThanOrEqual(0.35);
    // Negative margins cancel the hit padding exactly: no layout growth.
    expect(parseFloat(margin![1]!)).toBeCloseTo(-parseFloat(padding![1]!), 5);
    expect(parseFloat(margin![2]!)).toBeCloseTo(-parseFloat(padding![2]!), 5);
    // Long names still truncate in place: the fix must not unwrap or widen.
    expect(body).toMatch(/white-space:\s*nowrap/);
    expect(body).toMatch(/text-overflow:\s*ellipsis/);
    expect(body).toMatch(/max-width:\s*9rem/);
  });

  it("renders a compact identity header with every fact truncated (#366)", () => {
    const css = readFileSync("src/ui/ui.css", "utf8");
    const ref = createRef<HTMLButtonElement | null>();
    render(
      <GameDrawer
        open route="profile" busy={false} playerName="Ada Lovelace the First of Her Very Long Name"
        playerParty="Labor" countryName="United States" turn={12} date="1953-12-01"
        menuButtonRef={ref} onNavigate={vi.fn()} onAdvanceTurn={vi.fn()} onSave={vi.fn()}
        onExit={vi.fn()} onClose={vi.fn()}
      />,
    );
    // All three reference profile-card facts stay player-visible.
    const name = screen.getByText("Ada Lovelace the First of Her Very Long Name");
    expect(name.tagName).toBe("STRONG");
    expect(name).toHaveAttribute("title", "Ada Lovelace the First of Her Very Long Name");
    expect(screen.getByText("Labor · United States")).toBeInTheDocument();
    expect(screen.getByText(/Turn 12/)).toBeInTheDocument();
    // Compact, truncated header: tight padding, single-line ellipsis.
    expect(css).toMatch(/\.ahd-drawer-identity\s*\{[^}]*padding:\s*0\.35rem 0\.9rem 0\.5rem/);
    expect(css).toMatch(/\.ahd-drawer-identity-name\s*\{[^}]*text-overflow:\s*ellipsis/);
    expect(css).toMatch(/\.ahd-drawer-identity-meta\s*\{[^}]*white-space:\s*nowrap/);
  });

  it("disclosures expose counts and controlled sections without renaming groups (#366)", async () => {
    const user = userEvent.setup();
    const css = readFileSync("src/ui/ui.css", "utf8");
    render(
      <GameDrawer open route="profile" busy={false} playerName="Ada" playerParty="Labor"
        countryName="United States" turn={1} date="1953-01-08" menuButtonRef={createRef()}
        onNavigate={vi.fn()} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onClose={vi.fn()} />,
    );
    // Counts ride in an aria-hidden badge, so the stable accessible names the
    // app navigates by ("Nation"/"World") are unchanged.
    const nation = screen.getByRole("button", { name: "Nation" });
    const world = screen.getByRole("button", { name: "World" });
    expect(within(nation).getByText("15")).toBeInTheDocument();
    expect(within(world).getByText("7")).toBeInTheDocument();
    expect(nation).toHaveAttribute("aria-controls", "ahd-drawer-section-nation");
    expect(world).toHaveAttribute("aria-controls", "ahd-drawer-section-world");
    // Collapsed sections render no controlled region; expanding reveals it.
    expect(document.getElementById("ahd-drawer-section-nation")).toBeNull();
    await user.click(nation);
    expect(nation).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById("ahd-drawer-section-nation")).not.toBeNull();
    expect(screen.getByRole("button", { name: "National Budget" })).toBeInTheDocument();
    // No destination added or removed by the composition pass.
    const ids = drawerRouteIds();
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(32);
    expect(css).toMatch(/\.ahd-drawer-group\s*\+\s*\.ahd-drawer-group\s*\{[^}]*border-top:/);
  });

  it("keeps Ask/Actions pinned in a quick bar without removing destinations (#366)", async () => {
    const user = userEvent.setup();
    const css = readFileSync("src/ui/ui.css", "utf8");
    const onNavigate = vi.fn();
    const props = {
      open: true, route: "ask" as const, busy: false, playerName: "Ada", playerParty: "Labor",
      countryName: "United States", turn: 1, date: "1953-01-08",
      menuButtonRef: createRef<HTMLButtonElement | null>(),
      onNavigate, onAdvanceTurn: vi.fn(), onSave: vi.fn(), onExit: vi.fn(), onClose: vi.fn(),
    };
    render(<GameDrawer {...props} />);
    // The bar duplicates no hierarchy destination: its targets are the same
    // Actions/Ask ids the drawer groups already expose.
    const quick = screen.getByRole("group", { name: "Quick actions" });
    const goActions = within(quick).getByRole("button", { name: "Go to Actions" });
    const goAsk = within(quick).getByRole("button", { name: "Go to Ask" });
    expect(goAsk).toHaveAttribute("aria-current", "page");
    expect(goActions).not.toHaveAttribute("aria-current");
    await user.click(goActions);
    expect(onNavigate).toHaveBeenCalledWith("actions");
    await user.click(goAsk);
    expect(onNavigate).toHaveBeenCalledWith("ask");
    // The hierarchy entries themselves are untouched.
    expect(screen.getByRole("button", { name: "Actions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask" })).toBeInTheDocument();
    // Pinned below the scrolling sections, with phone-safe padding.
    expect(css).toMatch(/\.ahd-drawer-quick\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    expect(css).toMatch(/\.ahd-drawer-quick\s*\{[^}]*env\(safe-area-inset-bottom\)/);
  });

  it("holds phone safe-area, backdrop and focus behavior at 320/390px (#366)", async () => {
    const user = userEvent.setup();
    const css = readFileSync("src/ui/ui.css", "utf8");
    const menuRef = createRef<HTMLButtonElement | null>();
    const onClose = vi.fn();
    const props = {
      route: "profile" as const, busy: false, playerName: "Ada", playerParty: "Labor",
      countryName: "United States", turn: 1, date: "1953-01-08", menuButtonRef: menuRef,
      onNavigate: vi.fn(), onAdvanceTurn: vi.fn(), onSave: vi.fn(), onExit: vi.fn(), onClose,
    };
    const { rerender } = render(
      <>
        <button ref={menuRef}>Menu</button>
        <GameDrawer open {...props} />
      </>,
    );
    const drawer = screen.getByRole("dialog", { name: "Game menu" });
    expect(drawer).toHaveAttribute("aria-modal", "true");
    // Opening moves focus inside the drawer, never onto End turn.
    expect(drawer.contains(document.activeElement)).toBe(true);
    expect(screen.getByRole("button", { name: "End turn" })).not.toBe(document.activeElement);
    // Backdrop dismisses; closing returns focus to the Menu button.
    await user.click(document.querySelector(".ahd-drawer-backdrop") as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
    rerender(
      <>
        <button ref={menuRef}>Menu</button>
        <GameDrawer open={false} {...props} />
      </>,
    );
    expect(screen.getByRole("button", { name: "Menu" })).toBe(document.activeElement as HTMLElement);
    // Phone sheet rules: left safe area, full-bleed backdrop, narrow-column
    // tightening at 320/390px, drawer width unchanged.
    expect(css).toMatch(/\.ahd-drawer\s*\{[^}]*padding-left:\s*max\(0,\s*env\(safe-area-inset-left\)\)/);
    expect(css).toMatch(/\.ahd-drawer-backdrop\s*\{[^}]*position:\s*fixed;\s*inset:\s*0/);
    expect(css).toMatch(/@media\s*\(max-width:\s*390px\)[\s\S]*?\.ahd-drawer-nav\s*\{[^}]*gap:\s*0\.2rem/);
    expect(css).toMatch(/\.ahd-drawer\s*\{[^}]*width:\s*min\(19rem,\s*calc\(100vw - 3\.5rem\)\)/);
  });

  it("drawer busy state disables turn actions", () => {
    const ref = createRef<HTMLButtonElement | null>();
    render(
      <GameDrawer
        open
        route="profile"
        busy
        playerName="Ada"
        playerParty="Labor"
        countryName="United States"
        turn={1}
        date="1953-01-08"
        menuButtonRef={ref}
        onNavigate={vi.fn()}
        onAdvanceTurn={vi.fn()}
        onSave={vi.fn()}
        onExit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "End turn" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save game" })).toBeDisabled();
  });

  it("exposes the reference avatar/profile identity flow and the wallet destination", () => {
    const groups = new Map(MENU_GROUPS.map((g) => [g.label, g]));
    // Avatar/profile menu entry: the reference profile-card links
    // (ExperimentalMobileMenu.tsx:169-197) map to Native's Profile group, and the
    // reference "Wallet" entry (nav.json:10) maps to Native's Portfolio route.
    expect(groups.get("Profile")!.items.map((i) => i.id)).toEqual([
      "profile", "notifications", "settings", "portfolio",
    ]);
    // Actions is a top-level destination (reference's top-level tab), reachable
    // without a desktop avatar menu.
    expect(groups.get("Actions")!.items.map((i) => i.id)).toEqual(["actions"]);
    // World > Diplomacy carries the Nations browse destination (browse context).
    const diplomacy = groups.get("World")!.sections?.find((s) => s.label === "Diplomacy");
    expect(diplomacy?.items.map((i) => i.id)).toEqual(["nations", "worldMap"]);
  });

  it("docks the drawer as an in-flow navigation pane without modal behavior (#438)", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const ref = createRef<HTMLButtonElement | null>();
    const { container } = render(
      <GameDrawer
        docked
        open={false}
        route="parties"
        busy={false}
        playerName="Ada"
        playerParty="Labor"
        countryName="United States"
        turn={1}
        date="1953-01-01"
        menuButtonRef={ref}
        onNavigate={onNavigate}
        onAdvanceTurn={vi.fn()}
        onSave={vi.fn()}
        onExit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    // Visible even when the modal sheet is closed, with no backdrop or dialog.
    const pane = screen.getByRole("complementary", { name: "Game navigation" });
    expect(pane).toHaveAttribute("data-pane", "navigation");
    expect(container.querySelector(".ahd-drawer-backdrop")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).not.toBe("hidden");
    // Same destinations and turn controls through the caller's handlers.
    expect(within(pane).getByRole("button", { name: "End turn" })).toBeInTheDocument();
    await user.click(within(pane).getByRole("button", { name: "Elections" }));
    expect(onNavigate).toHaveBeenCalledWith("elections");
  });

  it("omits reference-only destinations Native cannot reach instead of adding placeholders", () => {
    // Reference worldNavItems.ts / nationDetailsSections.ts expose Crises,
    // Hall of Fame, International Orgs, Sectors, Currency Exchange, Trade, IMF,
    // Unions and My Corporation. Native has no route or data surface for them, so
    // they must not appear as drawer rows (NAVIGATION-PARITY.md sections 2-3).
    const ids = drawerRouteIds() as string[];
    for (const id of ["crises", "hallOfFame", "myCorporation", "unions", "sectors", "forex", "trade", "imf", "internationalOrgs"]) {
      expect(ids).not.toContain(id);
    }
    const labels = MENU_GROUPS
      .flatMap((group) => [...group.items, ...(group.sections ?? []).flatMap((section) => section.items)])
      .map((item) => item.label);
    for (const label of ["Hall of Fame", "My Corporation", "Unions", "Crises", "Sectors", "Currency Exchange", "Trade", "IMF", "International Orgs"]) {
      expect(labels).not.toContain(label);
    }
    expect(ids).toContain("worldMap");
  });
});
