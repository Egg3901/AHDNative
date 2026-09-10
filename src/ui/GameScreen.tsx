import { PartyManagementPanel } from "./PartyManagementPanel";
import { LegislationRoute } from "./LegislationRoute";
import { SettingsPanel } from "./SettingsPanel";
import { HelpPanel } from "./HelpPanel";
import { WorldPanel } from "./WorldPanel";
import { DetailQuery } from "./DetailQuery";
import { NationPanel } from "./NationPanel";
import { SearchPanel } from "./SearchPanel";
import type { SearchResult } from "../game/search";
import { MarketsRoute } from "./MarketsRoute";
import { PoliticsRoute } from "./PoliticsRoute";
import { ResourceBreakdown } from "./ResourceBreakdown";
/**
 * GameScreen: AHDNative primary game shell.
 *
 * Visual baseline adapted from public AHDGame chrome:
 *   src/app/globals.css (default tokens) and navbar/country tab density
 *   (compact cards, primary #dc2626, bg #14141c, border #2a2a3d).
 * Public source Egg3901/AHDGame. Layout is original, responsive for Tauri web.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ActionView, GameScreenProps, GameView } from "../game/types";
import { FinancePanel, formatFinanceMoney } from "./FinancePanel";
import { LegislaturePanel } from "./LegislaturePanel";
import "./ui.css";

const ELECTIONS_PAGE_SIZE = 20;

type TabId = "overview" | "actions" | "parties" | "legislature" | "elections" | "news";
type RouteId = TabId | "profile" | "portfolio" | "banking" | "partyDetails" | "electionDetails" | "politicians" | "economy" | "budget" | "policy" | "nations" | "state" | "help" | "settings" | "legislationDetails" | "markets" | "search" | "partyManagement";
const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "actions", label: "Character" },
  { id: "parties", label: "Parties" },
  { id: "legislature", label: "Legislature" },
  { id: "elections", label: "Elections" },
  { id: "news", label: "News" },
];

const MENU_GROUPS: { label: string; items: { id: RouteId; label: string }[] }[] = [
  {
    label: "Character",
    items: [
      { id: "profile", label: "Profile" },
      { id: "actions", label: "Actions" },
      { id: "portfolio", label: "Portfolio" },
      { id: "markets", label: "Stock market" },
    ],
  },
  {
    label: "State", items: [{ id: "state", label: "Home region" }],
  },
  {
    label: "Nation",
    items: [
      { id: "overview", label: "Overview" },
      { id: "parties", label: "Parties" },
      { id: "partyManagement", label: "Start a party" },
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
  { label: "Help", items: [{ id: "search", label: "Search" },
      { id: "help", label: "Help" }, { id: "settings", label: "Settings" }] },
];

const REGION_LABELS: Record<Exclude<RouteId, TabId>, string> = {
  nations: "Nations", state: "Home region",
  economy: "Economy", budget: "Budget", policy: "Policy",
  legislationDetails: "Legislation details",
  markets: "Stock market",
  search: "Search",
  partyManagement: "Party management",
  help: "Help", settings: "Settings",
  profile: "Profile",
  portfolio: "Portfolio",
  banking: "Banking",
  partyDetails: "Party details", electionDetails: "Election details", politicians: "Politicians",
};

function isTabRoute(route: RouteId): route is TabId {
  return TABS.some((t) => t.id === route);
}

function formatCount(v: number): string {
  return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

type ResourceId = "ap" | "funds" | "cash" | "influence" | "favorability";
const RESOURCES: { id: ResourceId; short: string; label: string }[] = [
  { id: "ap", short: "AP", label: "Action points" },
  { id: "funds", short: "Funds", label: "Campaign funds" },
  { id: "cash", short: "Cash", label: "Cash" },
  { id: "influence", short: "Influence", label: "Influence" },
  { id: "favorability", short: "Favorability", label: "Favorability" },
];

function formatMetric(v: number, fmt: GameView["metrics"][number]["format"]): string {
  if (fmt === "money") return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
  if (fmt === "percent") return `${(v * 100).toFixed(1)}%`;
  return new Intl.NumberFormat(undefined).format(v);
}

function ActionRow({
  action,
  busy,
  regions,
  parties,
  onAction,
}: {
  action: ActionView;
  busy: boolean;
  regions: GameView["regions"];
  parties: GameView["parties"];
  onAction: GameScreenProps["onAction"];
}) {
  const [amount, setAmount] = useState("10");
  const [partyId, setPartyId] = useState(parties[0]?.id ?? "");
  const [regionId, setRegionId] = useState(regions[0]?.id ?? "");

  const [amountError, setAmountError] = useState<string | null>(null);
  const disabled = busy || !action.available;
  const hint = !action.available ? action.disabledReason ?? "Unavailable" : `Cost ${action.cost} actions`;

  const handle = () => {
    if (disabled) return;
    const params: Record<string, string | number> = {};
    if (action.requires === "amount") {
      const n = Number(amount);
      if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
        setAmountError("Enter a positive whole amount.");
        return;
      }
      setAmountError(null);
      params.amount = n;
    }
    if (action.requires === "party") {
      if (!partyId || !parties.some((pp) => pp.id === partyId)) {
        return;
      }
      params.partyId = partyId;
    }
    if (action.requires === "region") {
      if (!regionId || !regions.some((rr) => rr.id === regionId)) {
        return;
      }
      params.regionId = regionId;
    }
    onAction(action.id, Object.keys(params).length ? params : undefined);
  };

  return (
    <div className="ahd-card ahd-card-pad" style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
      <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 750, fontSize: "0.86rem" }}>{action.name}</div>
          <div className="ahd-muted" style={{ fontSize: "0.76rem", lineHeight: 1.45 }}>{action.description}</div>
        </div>
        <span className="ahd-badge" aria-label={hint}>{action.available ? `${action.cost}` : "locked"}</span>
      </div>

      {action.requires === "amount" ? (
        <label className="ahd-field" style={{ maxWidth: "12rem" }}>
          <span className="ahd-label">Amount</span>
          <input className="ahd-input" type="number" inputMode="numeric" min={1} value={amount} onChange={(e) => { setAmount(e.target.value); if (amountError) setAmountError(null); }} disabled={busy} aria-label={`Amount for ${action.name}`} aria-invalid={!!amountError} aria-describedby={amountError ? `amount-error-${action.id}` : undefined} />
          {amountError ? <span id={`amount-error-${action.id}`} className="ahd-error-text" role="alert">{amountError}</span> : null}
        </label>
      ) : null}
      {action.requires === "party" ? (
        <label className="ahd-field" style={{ maxWidth: "16rem" }}>
          <span className="ahd-label">Party</span>
          <select className="ahd-select" value={partyId} onChange={(e) => setPartyId(e.target.value)} disabled={busy || parties.length === 0} aria-label={`Party for ${action.name}`}>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.abbreviation})</option>)}
            {parties.length === 0 ? <option value="">No parties</option> : null}
          </select>
        </label>
      ) : null}
      {action.requires === "region" ? (
        <label className="ahd-field" style={{ maxWidth: "16rem" }}>
          <span className="ahd-label">Region</span>
          <select className="ahd-select" value={regionId} onChange={(e) => setRegionId(e.target.value)} disabled={busy || regions.length === 0} aria-label={`Region for ${action.name}`}>
            {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            {regions.length === 0 ? <option value="">No regions</option> : null}
          </select>
        </label>
      ) : null}

      <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="ahd-btn ahd-btn-primary ahd-btn-sm" onClick={handle} disabled={disabled} aria-disabled={disabled} aria-label={`${action.available ? "Take action" : "Unavailable"}: ${action.name}`}>
          {busy ? <span className="ahd-spinner" aria-hidden /> : null}
          {action.available ? `Take action: ${action.name}` : "Unavailable"}
        </button>
        <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>{hint}{action.requires ? ` · requires ${action.requires}` : ""}</span>
      </div>
      {!action.available && action.disabledReason ? <p className="ahd-help" role="note">{action.disabledReason}</p> : null}
    </div>
  );
}

function ProfileSection({ world }: { world: GameView }) {
  return (
    <div className="ahd-stack">
      <div className="ahd-card ahd-card-pad">
        <h2 className="ahd-h2">Profile</h2>
        <div style={{ marginTop: "0.4rem", fontSize: "0.86rem" }}>
          <strong>{world.player.name}</strong>
          <span className="ahd-muted"> · {world.player.partyName || "Independent"}</span>
        </div>
        <p className="ahd-muted" style={{ fontSize: "0.76rem", margin: "0.25rem 0 0" }}>
          {world.countryName} · {world.era} · Turn {world.turn} · {world.date}
        </p>
        <dl style={{ marginTop: "0.65rem", display: "grid", gap: "0.35rem" }}>
          <div className="ahd-kv"><dt>Office</dt><dd>{world.legislature.office ?? "No legislative seat"}</dd></div>
          <div className="ahd-kv"><dt>Action points</dt><dd className="ahd-mono">{formatCount(world.player.actions)}</dd></div>
          <div className="ahd-kv"><dt>Campaign funds</dt><dd className="ahd-mono">{formatFinanceMoney(world.player.funds, world.finance.currency)}</dd></div>
          <div className="ahd-kv"><dt>Cash</dt><dd className="ahd-mono">{formatFinanceMoney(world.finance.cash, world.finance.currency)}</dd></div>
          <div className="ahd-kv"><dt>Influence</dt><dd className="ahd-mono">{formatCount(world.player.influence)}</dd></div>
          <div className="ahd-kv"><dt>Favorability</dt><dd className="ahd-mono">{formatCount(world.player.favorability)}</dd></div>
        </dl>
      </div>
    </div>
  );
}

export function GameScreen({ preferences, onPreferencesChange, preferencesError, search, loadPartyManagement, loadMarkets, loadLegislation, loadPolitics, loadWorldOverview, world, busy, message, error, onAdvanceTurn, onSave, onExit, onAction }: GameScreenProps) {
  const [route, setRoute] = useState<RouteId>("overview");
  const [detailId, setDetailId] = useState<string>();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openResource, setOpenResource] = useState<ResourceId | null>(null);
  const [electionPage, setElectionPage] = useState(0);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const detailsRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const focusPage = useRef(false);
  const resourceButtonRefs = useRef<Partial<Record<ResourceId, HTMLButtonElement | null>>>({});

  const selectedTab: TabId | null = isTabRoute(route) ? route : null;
  const tabPanelId = useMemo(() => `ahd-panel-${route}`, [route]);

  const go = (next: RouteId) => {
    focusPage.current = menuOpen || openResource !== null;
    setDetailId(undefined);
    setRoute(next);
    setMenuOpen(false);
    setOpenResource(null);
  };

  useEffect(() => {
    if (!focusPage.current) return;
    focusPage.current = false;
    document.getElementById(tabPanelId)?.focus({ preventScroll: true });
    document.scrollingElement?.scrollTo?.({ top: 0 });
  }, [route, menuOpen, openResource, tabPanelId]);

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []);
    const index = items.findIndex((item) => item === document.activeElement);
    let next: number | undefined;
    if (e.key === "ArrowDown") next = (index + 1) % items.length;
    if (e.key === "ArrowUp") next = (index - 1 + items.length) % items.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = items.length - 1;
    if (next !== undefined) { e.preventDefault(); items[next]?.focus(); }
    if (e.key === "Tab") {
      e.preventDefault();
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    }
  };

  const openParty = (id: string) => { setDetailId(id); focusPage.current = true; setRoute("partyDetails"); };
  const openElection = (id: string) => { setDetailId(id); focusPage.current = true; setRoute("electionDetails"); };

  const openSearchResult = (result: SearchResult) => {
    const destinations: Record<SearchResult['kind'], RouteId> = { nation: 'nations', party: 'partyDetails', company: 'markets', election: 'electionDetails', bill: 'legislationDetails', politician: 'politicians', player: 'profile' };
    setDetailId(result.id); focusPage.current = true; setRoute(destinations[result.kind]);
  };

  const closeDetails = () => {
    const current = openResource;
    setOpenResource(null);
    if (current) {
      resourceButtonRefs.current[current]?.focus();
    }
  };

  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  useEffect(() => {
    if (openResource) {
      detailsRef.current?.focus();
    }
  }, [openResource]);

  const electionPageCount = Math.max(1, Math.ceil(world.elections.length / ELECTIONS_PAGE_SIZE));
  const safeElectionPage = Math.min(Math.max(0, electionPage), electionPageCount - 1);
  const pagedElections = world.elections.slice(safeElectionPage * ELECTIONS_PAGE_SIZE, (safeElectionPage + 1) * ELECTIONS_PAGE_SIZE);

  useEffect(() => { setElectionPage(0); }, [world.countryId]);
  useEffect(() => {
    setElectionPage((p) => Math.min(Math.max(0, p), Math.max(0, Math.ceil(world.elections.length / ELECTIONS_PAGE_SIZE) - 1)));
  }, [world.elections.length]);

  const activeRaceId = world.elections.find((e) => e.playerCandidate && e.status !== "resolved")?.id;
  useEffect(() => { setElectionPage(0); }, [activeRaceId]);

  const joinPartyAction = world.actions.find((a) => a.id === "joinParty");
  const leavePartyAction = world.actions.find((a) => a.id === "leaveParty");

  const onTabKeyDown = (e: React.KeyboardEvent) => {
    const base = selectedTab ?? TABS[0].id;
    const idx = TABS.findIndex((t) => t.id === base);
    let next: TabId | null = null;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      next = TABS[(idx + 1) % TABS.length].id;
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      next = TABS[(idx - 1 + TABS.length) % TABS.length].id;
    } else if (e.key === "Home") {
      e.preventDefault(); next = TABS[0].id;
    } else if (e.key === "End") {
      e.preventDefault(); next = TABS[TABS.length - 1].id;
    }
    if (next) {
      go(next);
      requestAnimationFrame(() => {
        const el = document.getElementById(`ahd-tab-${next}`);
        el?.focus();
      });
    }
  };

  return (
    <div className="ahd-screen">
      <header className="ahd-header" role="banner">
        <div className="ahd-container ahd-header-inner">
          <div className="ahd-header-title">
            <div className="ahd-eyebrow">A House Divided</div>
            <div style={{ display: "flex", gap: "0.4rem", alignItems: "baseline", flexWrap: "wrap" }}>
              <strong style={{ fontSize: "0.9rem", letterSpacing: "-0.01em" }}>{world.countryName}</strong>
              <span className="ahd-muted ahd-header-context" style={{ fontSize: "0.72rem" }}>{world.era} · Turn {world.turn} · {world.date}</span>
            </div>
            <div className="ahd-header-meta" aria-label="Player summary">
              <span>{world.player.name} · {world.player.partyName || "Independent"}</span>
              <span className="ahd-mono">{formatFinanceMoney(world.player.cash, world.finance.currency)} cash</span>
              <span className="ahd-mono">{world.player.actions} actions</span>
              <span className="ahd-mono">{world.player.influence.toLocaleString(undefined, { maximumFractionDigits: 1 })} influence</span>
            </div>
          </div>

          <div className="ahd-header-actions">
            <div className="ahd-menu-wrap" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setMenuOpen(false); }}>
              <button
                type="button"
                ref={menuButtonRef}
                className="ahd-btn ahd-btn-sm"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-controls="ahd-game-menu"
                onClick={() => { setMenuOpen((o) => !o); setOpenResource(null); }}
              >
                Menu
              </button>
              {menuOpen ? (
                <div ref={menuRef} onKeyDown={onMenuKeyDown} role="menu" id="ahd-game-menu" aria-label="Game menu" className="ahd-menu">
                  {MENU_GROUPS.map((group) => (
                    <div key={group.label} role="group" aria-label={group.label} className="ahd-menu-group">
                      <div className="ahd-menu-heading" aria-hidden>{group.label}</div>
                      {group.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          role="menuitemradio"
                          tabIndex={-1}
                          aria-checked={route === item.id}
                          className="ahd-menu-item"
                          onClick={() => go(item.id)}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <button type="button" className="ahd-btn ahd-btn-ghost ahd-btn-sm" onClick={onExit} disabled={busy} aria-label="Exit game">Exit</button>
            <button type="button" className="ahd-btn ahd-btn-sm" onClick={onSave} disabled={busy} aria-busy={busy} aria-label="Save game">
              {busy ? <span className="ahd-spinner" aria-hidden /> : null}
              Save
            </button>
            <button type="button" className="ahd-btn ahd-btn-primary ahd-btn-sm" onClick={onAdvanceTurn} disabled={busy} aria-busy={busy} aria-label="End turn">
              {busy ? <span className="ahd-spinner" aria-hidden /> : null}
              End turn
            </button>
          </div>
        </div>

        <div className="ahd-container" style={{ paddingBottom: "0.5rem" }}>
          {busy && message ? <div className="ahd-notice" role="status" aria-live="polite" style={{ marginBottom: "0.45rem" }}>{message}</div> : null}
          {error ? <div className="ahd-alert" role="alert" style={{ marginBottom: "0.45rem" }}>{error}</div> : null}
          {!busy && message && !error ? <div className="ahd-notice" role="status" style={{ marginBottom: "0.45rem" }}>{message}</div> : null}

          <nav aria-label="Game sections" onKeyDown={onTabKeyDown}>
            <div role="tablist" aria-label="Game sections" className="ahd-tabs">
              {TABS.map((t, i) => (
                <button
                  key={t.id}
                  role="tab"
                  id={`ahd-tab-${t.id}`}
                  aria-selected={selectedTab === t.id}
                  aria-controls={selectedTab ? tabPanelId : undefined}
                  tabIndex={selectedTab ? (selectedTab === t.id ? 0 : -1) : (i === 0 ? 0 : -1)}
                  className="ahd-tab"
                  onClick={() => go(t.id)}
                  type="button"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </nav>
        </div>
      </header>

      <main className="ahd-container ahd-main">
        {isTabRoute(route) ? (
        <section
          id={tabPanelId}
          role="tabpanel"
          aria-labelledby={`ahd-tab-${selectedTab}`}
          tabIndex={0}
          style={{ outline: "none" }}
        >
          {route === "overview" ? (
            <div className="ahd-stack">
              <div className="ahd-card ahd-card-pad">
                <h2 className="ahd-h2">Overview</h2>
                <p className="ahd-muted" style={{ fontSize: "0.78rem", margin: "0.35rem 0 0" }}>
                  {world.countryName} · {world.era} · Turn {world.turn} · {world.date} · Player {world.player.name}
                </p>
                <dl style={{ marginTop: "0.65rem", display: "grid", gap: "0.35rem" }}>
                  <div className="ahd-kv"><dt>Office</dt><dd>{world.legislature.office ?? "No legislative seat"}</dd></div>
                  <div className="ahd-kv"><dt>Cash</dt><dd className="ahd-mono">{formatFinanceMoney(world.player.cash, world.finance.currency)}</dd></div>
                  <div className="ahd-kv"><dt>Funds</dt><dd className="ahd-mono">{formatFinanceMoney(world.player.funds, world.finance.currency)}</dd></div>
                  <div className="ahd-kv"><dt>Influence</dt><dd className="ahd-mono">{world.player.influence.toLocaleString(undefined, { maximumFractionDigits: 1 })}</dd></div>
                  <div className="ahd-kv"><dt>Favorability</dt><dd className="ahd-mono">{world.player.favorability.toLocaleString(undefined, { maximumFractionDigits: 1 })}</dd></div>
                </dl>
              </div>

              {world.metrics.length === 0 ? (
                <div className="ahd-empty">No metrics for this world.</div>
              ) : (
                <div className="ahd-grid ahd-grid-3">
                  {world.metrics.map((m) => (
                    <div key={m.id} className="ahd-card ahd-card-pad">
                      <div className="ahd-muted" style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>{m.label}</div>
                      <div style={{ fontSize: "1.05rem", fontWeight: 800, marginTop: "0.2rem" }} className="ahd-mono">{formatMetric(m.value, m.format)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {route === "actions" ? (
            <div className="ahd-stack">
              <div className="ahd-card ahd-card-pad">
                <h2 className="ahd-h2">Character</h2>
                <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginTop: "0.4rem", fontSize: "0.78rem" }}>
                  <span><strong>{world.player.name}</strong> · {world.player.partyName || "Independent"}</span>
                  <span className="ahd-badge">{world.player.actions} actions</span>
                  <span className="ahd-badge">{world.player.influence.toLocaleString(undefined, { maximumFractionDigits: 1 })} influence</span>
                </div>
              </div>

              <h3 style={{ fontSize: "0.82rem", fontWeight: 750, margin: "0.2rem 0 0" }}>Actions</h3>
              {world.actions.length === 0 ? (
                <div className="ahd-empty">No actions available.</div>
              ) : (
                <div className="ahd-stack">
                  {world.actions.map((a: ActionView) => (
                    <ActionRow key={a.id} action={a} busy={busy} regions={world.regions} parties={world.parties} onAction={onAction} />
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {route === "parties" ? (
            <div className="ahd-stack">
              <div className="ahd-card ahd-card-pad">
                <h2 className="ahd-h2">Parties</h2>
                <button className="ahd-btn ahd-btn-sm" onClick={() => go("partyManagement")}>Start a party</button>
                <p className="ahd-muted" style={{ fontSize: "0.76rem", marginTop: "0.25rem" }}>{world.parties.length} parties in {world.countryName}</p>
                <p className="ahd-help" role="note" style={{ marginTop: "0.3rem" }}>Switching parties or leaving your party withdraws your candidacy.</p>
              </div>
              {world.parties.length === 0 ? (
                <div className="ahd-empty">No parties in this world.</div>
              ) : (
                <div className="ahd-grid ahd-grid-2">
                  {world.parties.map((p) => {
                    const membershipAction = p.isPlayerParty ? (p.membership?.leave ?? leavePartyAction) : (p.membership?.join ?? joinPartyAction);
                    const label = p.isPlayerParty ? `Leave ${p.name}` : `Join ${p.name}`;
                    const disabled = busy || !membershipAction?.available;
                    const hint = !membershipAction ? "Unavailable"
                      : !membershipAction.available ? (membershipAction.disabledReason ?? "Unavailable")
                      : membershipAction.cost > 0 ? `Cost ${membershipAction.cost} actions` : "Free";
                    const handleMembership = () => {
                      if (disabled || !membershipAction) return;
                      if (p.isPlayerParty) onAction(membershipAction.id, undefined);
                      else onAction(membershipAction.id, { partyId: p.id });
                    };
                    return (
                      <div key={p.id} className="ahd-card ahd-card-pad" style={{ borderLeft: `3px solid ${p.color}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "center" }}>
                          <strong style={{ fontSize: "0.86rem" }}>{p.name} <span className="ahd-muted" style={{ fontWeight: 600 }}>({p.abbreviation})</span></strong>
                          {p.isPlayerParty ? <span className="ahd-pill" style={{ background: "var(--ahd-primary)", color: "white" }}>Yours</span> : null}
                        </div>
                        <div className="ahd-muted" style={{ fontSize: "0.74rem", marginTop: "0.2rem" }}>{p.members.toLocaleString()} members · {formatFinanceMoney(p.treasury, world.finance.currency)} treasury</div>
                        <div style={{ marginTop: "0.3rem", height: "6px", borderRadius: 999, background: "var(--ahd-border)", overflow: "hidden" }}>
                          <div style={{ width: `${Math.min(100, p.members / 50)}%`, height: "100%", background: p.color }} />
                        </div>
                        <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.5rem" }}>
                          <button type="button" className="ahd-btn ahd-btn-primary ahd-btn-sm" onClick={handleMembership} disabled={disabled} aria-disabled={disabled} aria-label={label}>
                            {label}
                          </button>
                          <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>{hint}</span>
                        </div>
                        <button type="button" className="ahd-btn ahd-btn-ghost ahd-btn-sm" onClick={() => openParty(p.id)}>View {p.name} details</button>
                        {!membershipAction?.available && membershipAction?.disabledReason ? <p className="ahd-help" role="note">{membershipAction.disabledReason}</p> : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {route === "legislature" ? (
            <div className="ahd-stack"><button className="ahd-btn" onClick={() => go("legislationDetails")}>Browse bills and proposals</button><LegislaturePanel legislature={world.legislature} busy={busy} onAction={onAction} /></div>
          ) : null}

          {route === "elections" ? (
            <div className="ahd-stack">
              <div className="ahd-card ahd-card-pad">
                <h2 className="ahd-h2">Elections</h2>
                <p className="ahd-muted" style={{ fontSize: "0.76rem", marginTop: "0.25rem" }}>{world.elections.length} elections</p>
                {electionPageCount > 1 ? (
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.4rem" }}>
                    <button type="button" className="ahd-btn ahd-btn-sm" onClick={() => setElectionPage(safeElectionPage - 1)} disabled={busy || safeElectionPage === 0} aria-label="Previous page">
                      Previous
                    </button>
                    <span className="ahd-muted" style={{ fontSize: "0.74rem" }} aria-live="polite">Page {safeElectionPage + 1} of {electionPageCount}</span>
                    <button type="button" className="ahd-btn ahd-btn-sm" onClick={() => setElectionPage(safeElectionPage + 1)} disabled={busy || safeElectionPage >= electionPageCount - 1} aria-label="Next page">
                      Next
                    </button>
                  </div>
                ) : null}
              </div>
              {world.elections.length === 0 ? (
                <div className="ahd-empty">No elections scheduled.</div>
              ) : (
                <div className="ahd-stack">
                  {pagedElections.map((e) => {
                    const candidacy = e.candidacy;
                    const isWithdraw = candidacy?.id === "withdrawCandidacy";
                    const candidacyLabel = isWithdraw ? "Withdraw candidacy" : "Run for office";
                    const candidacyDisabled = busy || !candidacy?.available;
                    const candidacyHint = !candidacy ? "Unavailable"
                      : !candidacy.available ? (candidacy.disabledReason ?? "Unavailable")
                      : candidacy.cost > 0 ? `Cost ${candidacy.cost} actions` : "Free";
                    const handleCandidacy = () => {
                      if (candidacyDisabled || !candidacy) return;
                      onAction(candidacy.id, { electionId: e.id });
                    };
                    return (
                      <article key={e.id} aria-label={e.title} className="ahd-card ahd-card-pad">
                        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                          <div style={{ fontWeight: 700, fontSize: "0.86rem" }}>{e.title}</div>
                          {e.playerCandidate ? <span className="ahd-pill" style={{ background: "var(--ahd-primary)", color: "white" }}>Candidate</span> : null}
                        </div>
                        <div className="ahd-muted" style={{ fontSize: "0.74rem" }}>{e.status} · {e.date}</div>
                        <div className="ahd-muted" style={{ fontSize: "0.74rem" }}>Filing deadline: {e.filingDate ?? "Unknown"}</div>
                        {(e.candidateNames ?? []).length > 0 ? (
                          <div style={{ fontSize: "0.78rem", marginTop: "0.25rem" }}>Candidates: {(e.candidateNames ?? []).join(", ")}</div>
                        ) : null}
                        {(e.winnerNames ?? []).length > 0 ? (
                          <div style={{ fontSize: "0.78rem", marginTop: "0.15rem" }}>Winners: {(e.winnerNames ?? []).join(", ")}</div>
                        ) : null}
                        <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.5rem" }}>
                          <button type="button" className="ahd-btn ahd-btn-primary ahd-btn-sm" onClick={handleCandidacy} disabled={candidacyDisabled} aria-disabled={candidacyDisabled} aria-label={candidacyLabel}>
                            {candidacyLabel}
                          </button>
                          <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>{candidacyHint}</span>
                        </div>
                        <button type="button" className="ahd-btn ahd-btn-ghost ahd-btn-sm" onClick={() => openElection(e.id)}>View race details</button>
                        {!candidacy?.available && candidacy?.disabledReason ? <p className="ahd-help" role="note">{candidacy.disabledReason}</p> : null}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {route === "news" ? (
            <div className="ahd-stack">
              <div className="ahd-card ahd-card-pad">
                <h2 className="ahd-h2">News</h2>
                <p className="ahd-muted" style={{ fontSize: "0.76rem", marginTop: "0.25rem" }}>{world.news.length} items</p>
              </div>
              {world.news.length === 0 ? (
                <div className="ahd-empty">No news yet.</div>
              ) : (
                <div className="ahd-stack">
                  {world.news.map((n) => (
                    <article key={n.id} className="ahd-card ahd-card-pad">
                      <h3 style={{ margin: 0, fontSize: "0.86rem", fontWeight: 750 }}>{n.title}</h3>
                      <p className="ahd-muted" style={{ fontSize: "0.72rem", margin: "0.15rem 0 0" }}>{n.date}</p>
                      <p style={{ fontSize: "0.82rem", lineHeight: 1.55, margin: "0.4rem 0 0" }}>{n.body}</p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </section>
        ) : (
        <section
          id={tabPanelId}
          role="region"
          aria-label={REGION_LABELS[route]}
          tabIndex={0}
          style={{ outline: "none" }}
        >
          {(route === "economy" || route === "budget" || route === "policy") && <NationPanel nation={world.nation} section={route} />}
          {(route === "nations" || route === "state") && <DetailQuery load={loadWorldOverview} revision={world} label="World details">{overview => <WorldPanel overview={overview} section={route} initialId={detailId} />}</DetailQuery>}
          {route === "partyManagement" && <DetailQuery load={loadPartyManagement} revision={world} label="Party management">{management => <PartyManagementPanel management={management} busy={busy} onAction={onAction} />}</DetailQuery>}
          {route === "search" && <SearchPanel load={search} revision={world} onOpen={openSearchResult} />}
          {route === "markets" && <MarketsRoute initialId={detailId} load={loadMarkets} revision={world} busy={busy} onAction={onAction} />}
          {route === "legislationDetails" && <LegislationRoute initialId={detailId} load={loadLegislation} revision={world} busy={busy} onAction={onAction} />}
          {route === "help" && <HelpPanel />}
          {route === "settings" && <SettingsPanel value={preferences} onChange={onPreferencesChange} error={preferencesError} />}
          {route === "profile" ? <ProfileSection world={world} /> : null}
          {route === "portfolio" ? <FinancePanel finance={world.finance} section="portfolio" busy={busy} onAction={onAction} /> : null}
          {(route === "partyDetails" || route === "electionDetails") && <button className="ahd-btn ahd-btn-ghost ahd-btn-sm" onClick={() => go(route === "partyDetails" ? "parties" : "elections")}>Back to {route === "partyDetails" ? "parties" : "elections"}</button>}
          {route === "partyDetails" && <PoliticsRoute load={loadPolitics} revision={world} section="parties" initialId={detailId} busy={busy} onAction={onAction} />}
          {route === "electionDetails" && <PoliticsRoute load={loadPolitics} revision={world} section="elections" initialId={detailId} busy={busy} onAction={onAction} />}
          {route === "politicians" && <PoliticsRoute load={loadPolitics} revision={world} section="politicians" initialId={detailId} onOpenElection={openElection} busy={busy} onAction={onAction} />}
          {route === "banking" ? <FinancePanel finance={world.finance} section="banking" busy={busy} onAction={onAction} /> : null}
        </section>
        )}
      </main>

      <footer className="ahd-footer" aria-label="Character stats and turn timer">
        <div className="ahd-container ahd-footer-inner">
          <div className="ahd-footer-status">
            <span className="ahd-mono">Turn {world.turn} · {world.date}</span>
            <span className="ahd-muted">{busy ? (message ? `Processing: ${message}` : "Processing...") : "Player paced"}</span>
          </div>
          <div className="ahd-footer-resources" role="group" aria-label="Resources">
            {RESOURCES.map((r) => {
              const value = r.id === "ap" ? formatCount(world.player.actions)
                : r.id === "funds" ? formatFinanceMoney(world.player.funds, world.finance.currency)
                : r.id === "cash" ? formatFinanceMoney(world.finance.cash, world.finance.currency)
                : r.id === "influence" ? formatCount(world.player.influence)
                : formatCount(world.player.favorability);
              const open = openResource === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  ref={(el) => { resourceButtonRefs.current[r.id] = el; }}
                  className="ahd-footer-btn"
                  aria-label={`${r.label}: ${value}`}
                  aria-expanded={open}
                  aria-controls={open ? `ahd-resource-${r.id}` : undefined}
                  onClick={() => setOpenResource(open ? null : r.id)}
                >
                  <span className="ahd-footer-btn-label">{r.short}</span>
                  <span className="ahd-mono ahd-footer-btn-value">{value}</span>
                </button>
              );
            })}
          </div>
        </div>
        {openResource ? (
          <div
            ref={detailsRef}
            role="dialog"
            aria-modal="false"
            aria-label={`${RESOURCES.find((r) => r.id === openResource)?.label} details`}
            id={`ahd-resource-${openResource}`}
            tabIndex={-1}
            className="ahd-container"
            onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); closeDetails(); } }}
            style={{ outline: "none" }}
          >
            <div className="ahd-resource-details">
              <div className="ahd-resource-facts">
                {openResource === "ap" ? <span>Available action points: {formatCount(world.player.actions)}.</span> : null}
                {openResource === "funds" ? <span>Campaign funds: {formatFinanceMoney(world.player.funds, world.finance.currency)}.</span> : null}
                {openResource === "cash" ? (
                  <span>Cash: {formatFinanceMoney(world.finance.cash, world.finance.currency)}. Savings: {formatFinanceMoney(world.finance.savings, world.finance.currency)}.</span>
                ) : null}
                {openResource === "influence" ? <span>Influence: {formatCount(world.player.influence)}.</span> : null}
                {openResource === "favorability" ? <span>Favorability: {formatCount(world.player.favorability)}.</span> : null}
              </div>
              <ResourceBreakdown details={world.resources} resource={openResource} currency={world.finance.currency} />
              <div className="ahd-resource-links">
                <button type="button" className="ahd-btn ahd-btn-sm" onClick={() => go("actions")}>Go to Actions</button>
                <button type="button" className="ahd-btn ahd-btn-sm" onClick={() => go("profile")}>Go to Profile</button>
                <button type="button" className="ahd-btn ahd-btn-sm" onClick={() => go("portfolio")}>Go to Portfolio</button>
                <button type="button" className="ahd-btn ahd-btn-sm ahd-btn-ghost" onClick={closeDetails} aria-label="Close details">Close</button>
              </div>
            </div>
          </div>
        ) : null}
      </footer>
    </div>
  );
}

export default GameScreen;
