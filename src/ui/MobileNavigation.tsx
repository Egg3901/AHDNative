import { useEffect, useRef } from "react";

export type DrawerRouteId =
  | "overview" | "actions" | "parties" | "legislature" | "elections" | "news"
  | "profile" | "portfolio" | "banking" | "partyDetails" | "electionDetails"
  | "politicians" | "economy" | "budget" | "policy" | "nations" | "state"
  | "help" | "settings" | "legislationDetails" | "markets" | "search"
  | "partyManagement" | "bonds" | "caucuses" | "regions";

export type BottomTabId = "overview" | "actions" | "parties";

export const MENU_GROUPS: { label: string; items: { id: DrawerRouteId; label: string }[] }[] = [
  {
    label: "Character",
    items: [
      { id: "profile", label: "Profile" },
      { id: "actions", label: "Actions" },
      { id: "portfolio", label: "Portfolio" },
      { id: "markets", label: "Stock market" },
      { id: "bonds", label: "Bonds" },
    ],
  },
  {
    label: "State", items: [{ id: "state", label: "Home region" }, { id: "regions", label: "Regions" }],
  },
  {
    label: "Nation",
    items: [
      { id: "overview", label: "Overview" },
      { id: "parties", label: "Parties" },
      { id: "partyManagement", label: "Start a party" },
      { id: "caucuses", label: "Caucuses" },
      { id: "legislature", label: "Legislature" },
      { id: "legislationDetails", label: "Bills and proposals" },
      { id: "elections", label: "Elections" },
      { id: "politicians", label: "Politicians" },
      { id: "economy", label: "Economy" },
      { id: "budget", label: "Budget" },
      { id: "policy", label: "Policy" },
    ],
  },
  {
    label: "World",
    items: [
      { id: "nations", label: "Nations" },
      { id: "banking", label: "Banking" },
      { id: "news", label: "News" },
    ],
  },
  {
    label: "Help",
    items: [
      { id: "search", label: "Search" },
      { id: "help", label: "Help" },
      { id: "settings", label: "Settings" },
    ],
  },
];

export const BOTTOM_TABS: { id: BottomTabId; label: string; path: string }[] = [
  {
    id: "overview",
    label: "Overview",
    path: "M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5",
  },
  {
    id: "actions",
    label: "Character",
    path: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0",
  },
  {
    id: "parties",
    label: "Parties",
    path: "M4 21v-8l5-4 5 4v8M14 21v-9l6-4v13M2 21h20",
  },
];

function bottomDestination(route: DrawerRouteId): BottomTabId | "menu" {
  if (route === "overview") return "overview";
  if (["actions", "profile", "portfolio", "markets", "bonds"].includes(route)) return "actions";
  if (["parties", "partyDetails", "partyManagement", "caucuses"].includes(route)) return "parties";
  return "menu";
}

const MENU_ICON_PATH = "M4 7h16M4 12h16M4 17h16";

function NavIcon({ path, label }: { path: string; label: string }) {
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
    const order: (BottomTabId | "menu")[] = ["overview", "actions", "parties", "menu"];
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
}: {
  open: boolean;
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
}) {
  const drawerRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
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

  if (!open) return null;

  return (
    <>
      <div className="ahd-drawer-backdrop" aria-hidden="true" onClick={onClose} />
      <aside
        ref={drawerRef}
        id="ahd-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Game menu"
        className="ahd-drawer"
      >
        <div className="ahd-drawer-identity">
          <strong>{playerName}</strong>
          <span className="ahd-muted">{playerParty} · {countryName}</span>
          <span className="ahd-muted">Turn {turn} · {date}</span>
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
          {MENU_GROUPS.map((group) => (
            <div key={group.label} role="group" aria-label={group.label} className="ahd-drawer-group">
              <div className="ahd-drawer-heading" aria-hidden="true">{group.label}</div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="ahd-drawer-item"
                  aria-current={route === item.id ? "page" : undefined}
                  data-active={route === item.id ? "true" : undefined}
                  onClick={() => onNavigate(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
