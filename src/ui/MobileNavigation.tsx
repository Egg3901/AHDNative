import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatGameDate } from "../game/gameDate";

export type DrawerRouteId =
  | "actions" | "parties" | "legislature" | "elections" | "news"
  | "profile" | "portfolio" | "banking" | "partyDetails" | "electionDetails" | "campaignDetails"
  | "politicians" | "presidentialDetails" | "politicalMetrics"
  | "economy" | "budget" | "policy" | "metrics" | "nations" | "worldMap" | "state" | "government"
  | "help" | "settings" | "legislationDetails" | "markets" | "search"
  | "partyManagement" | "bonds" | "caucuses" | "regions" | "notifications" | "referendums"
  | "worldSettings" | "ask";

export type BottomTabId = "profile" | "actions" | "ask";

export interface DrawerNavLink {
  id: DrawerRouteId;
  label: string;
}

/** A named sub-section inside a drawer group (the reference's collapsible categories). */
export interface DrawerNavSection {
  label: string;
  items: DrawerNavLink[];
}

/**
 * One drawer section. `items` are the group's loose/pinned links; `sections`
 * are the reference's collapsible sub-categories (Nation: Politics /
 * Government / Economy; World: Economy / Diplomacy / Other / Leaderboards).
 */
export interface DrawerNavGroup {
  label: string;
  items: DrawerNavLink[];
  sections?: DrawerNavSection[];
}

/**
 * Drawer hierarchy, aligned to the reference game menu:
 *
 *   Profile header links (Profile / Notifications / Settings / Wallet)
 *     — ExperimentalMobileMenu.tsx:169-197 (profile-card links)
 *   Actions                 — ExperimentalNavbar.tsx:279 top-level tab
 *   Ask                     — Native Ask panel (#358), beside Actions
 *   State                   — reference State section
 *   Nation                  — Politics / Government / Economy groups
 *     — nationDetailsSections.ts:88-237 (order: Politics, Government, Economy)
 *   World                   — Economy / Diplomacy / Other groups
 *     — worldNavItems.ts:234-262 (order: Economy, Diplomacy, Other, Leaderboards)
 *   Help
 *
 * Intentional Native deviations, recorded here per the standing rule:
 *  - The reference World's Map and Nation's "Other" (Map) entries are covered
 *    by one offline Native destination: "World map" under World > Diplomacy
 *    (#73). It is a directory over the actual projected nations and regions,
 *    not a plotted geographic surface: the save records no coordinates.
 *    World's "Leaderboards" (Hall of Fame) and the remaining Diplomacy extras
 *    have no reachable destination, so those rows are omitted rather than
 *    shown as placeholders.
 *  - Search is a routed destination in Native, so it sits under Help (the
 *    reference renders an inline search field above the profile card).
 *  - The reference profile-card link labelled Wallet maps to Native's
 *    Portfolio route/label.
 *  - Nation's unreferenced "Other" (Map) group and the reference's Executive /
 *    Supreme Court entries are Native Nation-detail gaps tracked in
 *    docs/NAVIGATION-PARITY.md, not drawer structure.
 *  - "World settings" (#352) is the intentional Native counterpart of
 *    AHDGame's /singleplayer/admin running-world gates (Egg3901/AHDGame#1903):
 *    the reference has no in-drawer world-admin destination, but the local SP
 *    player owns the world, so the saved world's simulation rules are editable
 *    here with no auth gate. It sits under World > Other next to News.
 */
export const MENU_GROUPS: DrawerNavGroup[] = [
  {
    label: "Profile",
    items: [
      { id: "profile", label: "Profile" },
      { id: "notifications", label: "Notifications" },
      { id: "settings", label: "Settings" },
      { id: "portfolio", label: "Portfolio" },
    ],
  },
  {
    // Actions is a top-level tab in the reference menu, not a "Character" group.
    label: "Actions",
    items: [{ id: "actions", label: "Actions" }],
  },
  {
    // #358: Ask sits beside Actions as a primary entry. It renders the local
    // panel in place; only the signed-out auth bounce leaves the app view.
    label: "Ask",
    items: [{ id: "ask", label: "Ask" }],
  },
  {
    label: "State",
    items: [
      { id: "state", label: "Home region" },
      { id: "regions", label: "Regions" },
    ],
  },
  {
    label: "Nation",
    items: [],
    sections: [
      {
        label: "Politics",
        items: [
          { id: "elections", label: "Elections" },
          { id: "parties", label: "Parties" },
          { id: "partyManagement", label: "Start a party" },
          { id: "caucuses", label: "Caucuses" },
          { id: "politicians", label: "Politicians" },
          // #69: the reference nationDetailsSections Politics group lists the
          // Presidential Election race page and the Political Metrics registry.
          { id: "presidentialDetails", label: "Presidential election" },
          { id: "politicalMetrics", label: "Political metrics" },
          { id: "referendums", label: "Referendums" },
        ],
      },
      {
        label: "Government",
        items: [
          { id: "legislature", label: "Legislature" },
          { id: "legislationDetails", label: "Bills and proposals" },
          { id: "policy", label: "Policy" },
          { id: "government", label: "Cabinet office" },
        ],
      },
      {
        label: "Economy",
        items: [
          { id: "economy", label: "Economy" },
          { id: "budget", label: "National Budget" },
          { id: "metrics", label: "National Metrics" },
        ],
      },
    ],
  },
  {
    label: "World",
    items: [],
    sections: [
      {
        label: "Economy",
        items: [
          { id: "markets", label: "Stock market" },
          { id: "bonds", label: "Bonds" },
          { id: "banking", label: "Banking" },
        ],
      },
      {
        label: "Diplomacy",
        items: [
          { id: "nations", label: "Nations" },
          { id: "worldMap", label: "World map" },
        ],
      },
      {
        label: "Other",
        items: [
          { id: "news", label: "News" },
          { id: "worldSettings", label: "World settings" },
        ],
      },
    ],
  },
  {
    label: "Help",
    items: [
      { id: "search", label: "Search" },
      { id: "help", label: "Help" },
    ],
  },
];

/** Every destination the drawer exposes, in render order (groups + sub-sections). */
export function drawerRouteIds(): DrawerRouteId[] {
  return MENU_GROUPS.flatMap((group) => [
    ...group.items.map((item) => item.id),
    ...(group.sections ?? []).flatMap((section) => section.items.map((item) => item.id)),
  ]);
}

export const ASK_ICON_PATH = "M5 5h14v10H9l-4 4V5Zm4 4h6M9 12h4";
export const MENU_ICON_PATH = "M4 7h16M4 12h16M4 17h16";
/**
 * Shared Native multiplayer glyph (#369): a stroke globe in the same 24x24
 * icon language as the bottom tabs. Code-native SVG path, bundled offline;
 * no remote icon dependency.
 */
export const MULTIPLAYER_ICON_PATH =
  "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3 12h18M12 3c2.8 2.7 4.2 5.8 4.2 9s-1.4 6.3-4.2 9c-2.8-2.7-4.2-5.8-4.2-9S9.2 5.7 12 3Z";

export const BOTTOM_TABS: { id: BottomTabId; label: string; path: string }[] = [
  {
    id: "profile",
    label: "Profile",
    path: "M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5",
  },
  {
    id: "actions",
    label: "Actions",
    path: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0",
  },
  {
    id: "ask",
    label: "Ask",
    path: ASK_ICON_PATH,
  },
];

// Parent-section indicator for the bottom bar. Retained from the owner-approved
// mobile correction (docs/MOBILE-NAVIGATION.md): the personal-finance cluster
// (Profile/Portfolio/Stock market/Bonds) marks Profile even though the drawer
// now files Stock market and Bonds under the reference World group.
function bottomDestination(route: DrawerRouteId): BottomTabId | "menu" {
  if (route === "actions") return "actions";
  if (["profile", "portfolio", "markets", "bonds"].includes(route)) return "profile";
  if (route === "ask") return "ask";
  return "menu";
}

/**
 * Shared Native SVG navigation icon primitive (#369). Stroke glyph on a
 * 24x24 grid, matching the bottom-navigation sizing, active treatment,
 * safe-area, and focus-visible behavior through `.ahd-bottomnav-item`.
 */
export function NavIcon({ path, label }: { path: string; label: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <title>{label}</title>
      <path d={path} />
    </svg>
  );
}

export function BottomNav({
  route,
  menuOpen,
  menuButtonRef,
  onNavigate,
  onOpenMenu,
}: {
  route: DrawerRouteId;
  menuOpen: boolean;
  menuButtonRef: React.RefObject<HTMLButtonElement | null>;
  onNavigate: (next: DrawerRouteId) => void;
  onOpenMenu: () => void;
}) {
  const destination = bottomDestination(route);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const order: (BottomTabId | "menu")[] = ["profile", "actions", "ask", "menu"];
    const buttons = Array.from(e.currentTarget.querySelectorAll("button"));
    const focused = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const idx = focused >= 0 ? focused : order.indexOf(destination);
    const next = order[(idx + (e.key === "ArrowRight" ? 1 : order.length - 1)) % order.length];
    if (next === "menu") {
      onOpenMenu();

    } else {
      onNavigate(next);
      requestAnimationFrame(() => {
        document.getElementById(`ahd-bottom-${next}`)?.focus();
      });
    }
  };

  return (
    <nav aria-label="Primary" className="ahd-bottomnav" onKeyDown={onKeyDown}>
      {BOTTOM_TABS.map((t) => {
        const active = destination === t.id;
        return (
          <button
            key={t.id}
            id={`ahd-bottom-${t.id}`}
            type="button"
            className="ahd-bottomnav-item"
            aria-label={t.label}
            aria-current={active ? (route === t.id ? "page" : "location") : undefined}
            data-active={active ? "true" : undefined}
            onClick={() => onNavigate(t.id)}
          >
            <NavIcon path={t.path} label="" />
            <span>{t.label}</span>
          </button>
        );
      })}
      <button
        ref={menuButtonRef}
        type="button"
        className="ahd-bottomnav-item"
        aria-label="Menu"
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        aria-controls="ahd-drawer"
        data-active={menuOpen || destination === "menu" ? "true" : undefined}
        aria-current={destination === "menu" ? "location" : undefined}
        onClick={onOpenMenu}
      >
        <NavIcon path={MENU_ICON_PATH} label="" />
        <span>Menu</span>
      </button>
    </nav>
  );
}

function DrawerNavButton({
  item,
  route,
  unreadCount,
  onNavigate,
}: {
  item: DrawerNavLink;
  route: DrawerRouteId;
  unreadCount?: number;
  onNavigate: (next: DrawerRouteId) => void;
}) {
  return (
    <button
      type="button"
      className="ahd-drawer-item"
      aria-current={route === item.id ? "page" : undefined}
      data-active={route === item.id ? "true" : undefined}
      onClick={() => onNavigate(item.id)}
    >
      {item.label}
      {item.id === "notifications" && (unreadCount ?? 0) > 0 ? (
        <span className="ahd-badge" aria-hidden="true" style={{ marginLeft: "0.4rem", background: "var(--ahd-primary)", color: "white" }}>
          {unreadCount! > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </button>
  );
}

export function GameDrawer({
  open,
  route,
  busy,
  playerName,
  playerParty,
  countryName,
  turn,
  date,
  message,
  error,
  menuButtonRef,
  onNavigate,
  onAdvanceTurn,
  onSave,
  onExit,
  onClose,
  unreadCount,
  docked,
}: {
  open: boolean;
  /**
   * Dual-pane navigation pane (#438): renders the same destinations, turn
   * controls and handlers as an in-flow pane instead of a modal sheet. No
   * backdrop, focus trap, or scroll lock; the single-pane modal flow below
   * is untouched. Selection/route state stays with the caller.
   */
  docked?: boolean;
  route: DrawerRouteId;
  busy: boolean;
  playerName: string;
  playerParty: string;
  countryName: string;
  turn: number;
  date: string;
  message?: string;
  error?: string;
  menuButtonRef: React.RefObject<HTMLButtonElement | null>;
  onNavigate: (next: DrawerRouteId) => void;
  onAdvanceTurn: () => void;
  onSave: () => void;
  onExit: () => void;
  onClose: () => void;
  unreadCount?: number;
}) {
  const drawerRef = useRef<HTMLElement | null>(null);
  const activeGroup = MENU_GROUPS.find((group) =>
    [...group.items, ...(group.sections ?? []).flatMap((section) => section.items)]
      .some((item) => item.id === route),
  )?.label;
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(activeGroup && ["Nation", "World"].includes(activeGroup) ? [activeGroup] : []),
  );
  // #366: the drawer stays mounted while closed, so routes reached without it
  // (search results, notification targets, resource links) would leave a stale
  // disclosure behind. Every open resets to the compact default: exactly the
  // active deep group expanded, everything else collapsed. Toggles while open
  // are untouched.
  // Reset before paint. A passive effect can race the first tap after the
  // drawer opens: the player expands Nation, then the delayed reset collapses
  // it again before the destination receives the tap.
  useLayoutEffect(() => {
    if (!open) return;
    const deflated = activeGroup && ["Nation", "World"].includes(activeGroup) ? [activeGroup] : [];
    setExpandedGroups((current) => {
      if (current.size === deflated.length && deflated.every((group) => current.has(group))) return current;
      return new Set(deflated);
    });
  }, [open, activeGroup]);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open || docked) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const drawer = drawerRef.current;
    drawer?.querySelector<HTMLButtonElement>('.ahd-drawer-nav [aria-current="page"], .ahd-drawer-nav button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !drawer) return;
      const items = Array.from(drawer.querySelectorAll<HTMLElement>("button:not([disabled])"));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey, true);
      menuButtonRef.current?.focus();
    };
  }, [open, menuButtonRef]);

  if (!open && !docked) return null;

  return (
    <>
      {docked ? null : <div className="ahd-drawer-backdrop" aria-hidden="true" onClick={onClose} />}
      <aside
        ref={drawerRef}
        id={docked ? "ahd-drawer-docked" : "ahd-drawer"}
        role={docked ? "complementary" : "dialog"}
        aria-modal={docked ? undefined : true}
        aria-label={docked ? "Game navigation" : "Game menu"}
        className={docked ? "ahd-drawer ahd-drawer-docked" : "ahd-drawer"}
        data-pane={docked ? "navigation" : undefined}
      >
        {/* #366 composition: compact identity header. Same three facts the
            reference profile card shows (name, party/country, turn/date),
            tightened to two truncated lines so the 320px first viewport keeps
            turn controls and primary destinations above the fold. */}
        <div className="ahd-drawer-identity">
          <strong className="ahd-drawer-identity-name" title={playerName}>{playerName}</strong>
          <span className="ahd-muted ahd-drawer-identity-meta" title={`${playerParty} · ${countryName}`}>{playerParty} · {countryName}</span>
          <span className="ahd-muted ahd-drawer-identity-meta">Turn {turn} · {formatGameDate(date, { turn, date })}</span>
          {/* Identity quick links mirror the reference profile card
              (ExperimentalMobileMenu.tsx:169-197: Profile / Notifications /
              Settings / Wallet plus conditional org rows). Profile, Actions
              and Wallet all have real Native destinations; My Corporation /
              My Union have no Native destination (no CEO/owner or member
              record is projected), so no such row is rendered here. */}
          <span className="ahd-drawer-identity-links" style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", marginTop: "0.35rem" }}>
            <button type="button" className="ahd-profile-link" onClick={() => onNavigate("profile")} aria-label="Go to profile">
              Profile
            </button>
            <button type="button" className="ahd-profile-link" onClick={() => onNavigate("actions")} aria-label="Go to actions">
              Actions
            </button>
            <button type="button" className="ahd-profile-link" onClick={() => onNavigate("portfolio")} aria-label="Go to wallet">
              Wallet
            </button>
          </span>
        </div>

        <div className="ahd-drawer-turn">
          <button
            type="button"
            className="ahd-btn ahd-btn-primary ahd-drawer-endturn"
            onClick={onAdvanceTurn}
            disabled={busy}
            aria-busy={busy}
            aria-label="End turn"
          >
            {busy ? <span className="ahd-spinner" aria-hidden /> : null}
            End turn
          </button>
          <div className="ahd-drawer-turnrow">
            <button type="button" className="ahd-btn ahd-btn-sm" onClick={onSave} disabled={busy} aria-busy={busy} aria-label="Save game">
              {busy ? <span className="ahd-spinner" aria-hidden /> : null}
              Save
            </button>
            <button type="button" className="ahd-btn ahd-btn-ghost ahd-btn-sm" onClick={onExit} disabled={busy} aria-label="Exit game">
              Exit
            </button>
            <button type="button" className="ahd-btn ahd-btn-ghost ahd-btn-sm" onClick={onClose} aria-label="Close menu">
              Close
            </button>
          </div>
        </div>

        {error ? <p className="ahd-alert ahd-drawer-feedback" role="alert">{error}</p>
          : message ? <p className="ahd-notice ahd-drawer-feedback" role="status">{message}</p> : null}
        <nav aria-label="Game sections" className="ahd-drawer-nav">
          {MENU_GROUPS.map((group) => {
            const deep = Boolean(group.sections?.length);
            const expanded = !deep || expandedGroups.has(group.label);
            // Reference Nation/World sub-category counts, so the collapsed
            // disclosure tells the player how many destinations hide inside.
            const deepCount = (group.sections ?? []).reduce((n, section) => n + section.items.length, 0);
            const sectionId = `ahd-drawer-section-${group.label.toLowerCase()}`;
            return (
            <div key={group.label} role="group" aria-label={group.label} className="ahd-drawer-group">
              {deep ? (
                <button
                  type="button"
                  className="ahd-drawer-heading ahd-drawer-disclosure"
                  aria-expanded={expanded}
                  aria-controls={sectionId}
                  onClick={() => setExpandedGroups((current) => {
                    const next = new Set(current);
                    if (next.has(group.label)) next.delete(group.label); else next.add(group.label);
                    return next;
                  })}
                >
                  <span>{group.label}</span>
                  <span aria-hidden="true" className="ahd-drawer-disclosure-meta">
                    <span className="ahd-drawer-count">{deepCount}</span>
                    <span>{expanded ? "−" : "+"}</span>
                  </span>
                </button>
              ) : <div className="ahd-drawer-heading" aria-hidden="true">{group.label}</div>}
              {group.items.map((item) => (
                <DrawerNavButton key={item.id} item={item} route={route} unreadCount={unreadCount} onNavigate={onNavigate} />
              ))}
              {expanded && group.sections ? (
                <div id={sectionId}>
                  {group.sections.map((section) => (
                    <div key={section.label} role="group" aria-label={section.label} className="ahd-drawer-section">
                      <div className="ahd-drawer-subheading" aria-hidden="true">{section.label}</div>
                      {section.items.map((item) => (
                        <DrawerNavButton key={item.id} item={item} route={route} unreadCount={unreadCount} onNavigate={onNavigate} />
                      ))}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )})}
        </nav>
        {/* #366 composition: persistent Ask/Actions quick bar. The reference
            keeps Actions a top-level tab (ExperimentalNavbar.tsx:279) and
            Native keeps Ask beside it (#358); both also live in the drawer
            hierarchy above, so this bar duplicates no destination and removes
            none. It stays pinned while the section list scrolls, so the two
            primary workflows survive an expanded Nation/World on 320px. */}
        <div className="ahd-drawer-quick" role="group" aria-label="Quick actions">
          {(["actions", "ask"] as const).map((id) => (
            <button
              key={id}
              type="button"
              className="ahd-btn ahd-btn-sm ahd-drawer-quick-btn"
              aria-label={id === "actions" ? "Go to Actions" : "Go to Ask"}
              aria-current={route === id ? "page" : undefined}
              data-active={route === id ? "true" : undefined}
              onClick={() => onNavigate(id)}
            >
              {id === "actions" ? "Actions" : "Ask"}
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}
