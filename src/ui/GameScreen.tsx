import { ProfileRoute } from "./ProfileRoute";
import { RegionsRoute } from "./RegionsRoute";
import { CaucusPanel } from "./CaucusPanel";
import { BondMarketRoute } from "./BondMarketRoute";
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
import { BottomNav, GameDrawer } from "./MobileNavigation";
import type { DrawerRouteId } from "./MobileNavigation";
import { ActionsHub, type ActionsCategoryFilter } from "./ActionsHub";
import { NotificationBellButton, NotificationPreview, NotificationsInbox, type NotificationTarget } from "./Notifications";
/**
 * GameScreen: AHDNative primary game shell.
 *
 * Visual baseline adapted from public AHDGame chrome:
 *   src/app/globals.css (default tokens) and navbar/country tab density
 *   (compact cards, primary #dc2626, bg #14141c, border #2a2a3d).
 * Public source Egg3901/AHDGame. Layout is original, responsive for Tauri web.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { GameScreenProps } from "../game/types";
import { FinancePanel, formatFinanceMoney } from "./FinancePanel";
import { LegislaturePanel } from "./LegislaturePanel";
import "./ui.css";

const ELECTIONS_PAGE_SIZE = 20;

function formatCompactMoney(amount: number, currency: string): string {
  if (!Number.isFinite(amount)) return "-";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(amount);
  } catch {
    return formatFinanceMoney(amount, currency);
  }
}

type TabId = "actions" | "parties" | "legislature" | "elections" | "news";
type RouteId = DrawerRouteId;
const TABS: { id: TabId; label: string }[] = [
  { id: "actions", label: "Actions" },
  { id: "parties", label: "Parties" },
  { id: "legislature", label: "Legislature" },
  { id: "elections", label: "Elections" },
  { id: "news", label: "News" },
];

function pageTitle(route: RouteId): string {
  const tab = TABS.find((t) => t.id === route);
  if (tab) return tab.label;
  return REGION_LABELS[route as Exclude<RouteId, TabId>];
}

const REGION_LABELS: Record<Exclude<RouteId, TabId>, string> = {
  nations: "Nations", state: "Home region",
  economy: "Economy", budget: "Budget", policy: "Policy",
  legislationDetails: "Legislation details",
  markets: "Stock market",
  bonds: "Bond market",
  search: "Search",
  partyManagement: "Party management",
  regions: "Regions",
  caucuses: "Caucuses",
  help: "Help", settings: "Settings",
  profile: "Profile",
  portfolio: "Portfolio",
  banking: "Banking",
  partyDetails: "Party details", electionDetails: "Election details", campaignDetails: "Campaign", politicians: "Politicians",
  notifications: "Notifications",
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

export function GameScreen({ loadProfile, onUpdateProfile, preferences, onPreferencesChange, preferencesError, search, loadRegions, loadCaucusManagement, loadBondMarket, loadPartyManagement, loadMarkets, loadLegislation, loadPolitics, loadWorldOverview, world, busy, message, error, onAdvanceTurn, onSave, onExit, onAction, onMarkNotificationRead, onDeleteNotification, onMarkAllNotificationsRead }: GameScreenProps) {
  const [route, setRoute] = useState<RouteId>("profile");
  const [detailId, setDetailId] = useState<string>();
  // Selected hub category survives route changes so Profile/footer deep-links
  // and returns never lose the player's filter selection.
  const [actionsCategory, setActionsCategory] = useState<ActionsCategoryFilter>("all");
  const [menuOpen, setMenuOpen] = useState(false);
  const [openResource, setOpenResource] = useState<ResourceId | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [electionPage, setElectionPage] = useState(0);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const screenRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const footer = footerRef.current;
    if (!footer) return;
    const measure = () => screenRef.current?.style.setProperty("--ahd-footer-height", `${footer.getBoundingClientRect().height}px`);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(footer);
    return () => observer.disconnect();
  }, []);
  const detailsRef = useRef<HTMLDivElement | null>(null);
  const focusPage = useRef(false);
  const resourceButtonRefs = useRef<Partial<Record<ResourceId, HTMLButtonElement | null>>>({});

  const saveNotice = message === "Game saved." || message === "Saved game imported.";

  const tabPanelId = useMemo(() => `ahd-panel-${route}`, [route]);

  const go = (next: RouteId) => {
    focusPage.current = true;
    setDetailId(undefined);
    setRoute(next);
    setMenuOpen(false);
    setOpenResource(null);
    setPreviewOpen(false);
    if (next === route && !menuOpen && openResource === null) {
      focusPage.current = false;
      document.getElementById(tabPanelId)?.focus({ preventScroll: true });
      document.scrollingElement?.scrollTo?.({ top: 0 });
    }
  };

  useEffect(() => {
    if (!focusPage.current) return;
    focusPage.current = false;
    document.getElementById(tabPanelId)?.focus({ preventScroll: true });
    document.scrollingElement?.scrollTo?.({ top: 0 });
  }, [route, menuOpen, openResource, tabPanelId]);

  const openParty = (id: string) => { setDetailId(id); focusPage.current = true; setRoute("partyDetails"); };
  const openElection = (id: string) => { setDetailId(id); focusPage.current = true; setRoute("electionDetails"); };
  const openCampaign = (id: string) => { setDetailId(id); focusPage.current = true; setRoute("campaignDetails"); };

  const openSearchResult = (result: SearchResult) => {
    const destinations: Record<SearchResult['kind'], RouteId> = { nation: 'nations', party: 'partyDetails', company: 'markets', election: 'electionDetails', bill: 'legislationDetails', politician: 'politicians', player: 'profile' };
    setDetailId(result.id); focusPage.current = true; setRoute(destinations[result.kind]);
  };

  const openNotificationTarget = (target: { route: RouteId; detailId?: string }) => {
    focusPage.current = true;
    setDetailId(target.detailId);
    setRoute(target.route);
    setMenuOpen(false);
    setOpenResource(null);
    setPreviewOpen(false);
  };

  const closeDetails = () => {
    const current = openResource;
    setOpenResource(null);
    if (current) {
      resourceButtonRefs.current[current]?.focus();
    }
  };

  const bellWrapRef = useRef<HTMLSpanElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const closePreview = () => {
    setPreviewOpen(false);
    bellWrapRef.current?.querySelector("button")?.focus();
  };
  useEffect(() => {
    if (previewOpen) {
      previewRef.current?.focus();
    }
  }, [previewOpen]);

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

  return (
    <div ref={screenRef} className="ahd-screen">
      <main aria-hidden={menuOpen || undefined} inert={menuOpen} className="ahd-container ahd-main">
        <h1 className="ahd-sr-only">A House Divided · {pageTitle(route)}</h1>
        {busy && message ? <div className="ahd-notice" role="status" aria-live="polite" style={{ marginBottom: "0.6rem" }}>{message}</div> : null}
        {error ? <div className="ahd-alert" role="alert" style={{ marginBottom: "0.6rem" }}>{error}</div> : null}
        {!busy && message && !error && !saveNotice ? <div className="ahd-notice" role="status" style={{ marginBottom: "0.6rem" }}>{message}</div> : null}
        {isTabRoute(route) ? (
        <section
          id={tabPanelId}
          role="region"
          aria-label={pageTitle(route)}
          tabIndex={0}
          style={{ outline: "none" }}
        >
          {route === "actions" ? (
            <div className="ahd-stack">
              <div className="ahd-card ahd-card-pad">
                <h2 className="ahd-h2">Actions</h2>
                <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginTop: "0.4rem", fontSize: "0.78rem" }}>
                  <span><strong>{world.player.name}</strong> · {world.player.partyName || "Independent"}</span>
                  <span className="ahd-badge">{world.player.actions} actions</span>
                  <span className="ahd-badge">{world.player.influence.toLocaleString(undefined, { maximumFractionDigits: 1 })} influence</span>
                </div>
              </div>

              <ActionsHub
                actions={world.actions}
                busy={busy}
                currency={world.finance.currency}
                regions={world.regions}
                parties={world.parties}
                category={actionsCategory}
                onCategoryChange={setActionsCategory}
                onAction={onAction}
              />
            </div>
          ) : null}

          {route === "parties" ? (
            <div className="ahd-stack">
              <div className="ahd-card ahd-card-pad">
                <h2 className="ahd-h2">Parties</h2>
                <button className="ahd-btn ahd-btn-sm" onClick={() => go("partyManagement")}>Start a party</button>
                <button className="ahd-btn ahd-btn-sm" onClick={() => go("caucuses")}>Caucuses</button>
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
                        {e.playerCandidate && e.status !== "resolved" ? <button type="button" className="ahd-btn ahd-btn-ghost ahd-btn-sm" onClick={() => openCampaign(e.id)}>Manage campaign</button> : null}
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
          {route === "regions" && <RegionsRoute load={loadRegions} revision={world} busy={busy} />}
          {route === "caucuses" && <DetailQuery load={loadCaucusManagement} revision={world} label="Caucuses">{management => <CaucusPanel management={management} busy={busy} onAction={onAction} />}</DetailQuery>}
          {route === "bonds" && <BondMarketRoute load={loadBondMarket} revision={world} busy={busy} onAction={onAction} />}
          {route === "partyManagement" && <DetailQuery load={loadPartyManagement} revision={world} label="Party management">{management => <PartyManagementPanel management={management} busy={busy} onAction={onAction} />}</DetailQuery>}
          {route === "search" && <SearchPanel load={search} revision={world} onOpen={openSearchResult} />}
          {route === "markets" && <MarketsRoute initialId={detailId} load={loadMarkets} revision={world} busy={busy} onAction={onAction} />}
          {route === "legislationDetails" && <LegislationRoute initialId={detailId} load={loadLegislation} revision={world} busy={busy} onAction={onAction} />}
          {route === "help" && <HelpPanel />}
          {route === "settings" && <SettingsPanel value={preferences} onChange={onPreferencesChange} error={preferencesError} />}
          {route === "profile" ? <ProfileRoute load={loadProfile} revision={world} busy={busy} onUpdateProfile={onUpdateProfile} viewerDisablesAutoplay={preferences.disableAutoplayOnOtherProfiles} onNavigate={(next, id) => {
            // Profile deep-links into the hub carry the hub category in `id`;
            // detail ids only apply to non-actions destinations.
            if (next === "actions" && (id === "influence" || id === "fundraising" || id === "intelligence")) {
              setActionsCategory(id);
              go(next);
              return;
            }
            go(next);
            if (id) setDetailId(id);
          }} /> : null}
          {route === "portfolio" ? <FinancePanel finance={world.finance} section="portfolio" busy={busy} onAction={onAction} /> : null}
          {(route === "partyDetails" || route === "electionDetails" || route === "campaignDetails") && <button className="ahd-btn ahd-btn-ghost ahd-btn-sm" onClick={() => route === "campaignDetails" ? setRoute("electionDetails") : go(route === "partyDetails" ? "parties" : "elections")}>Back to {route === "partyDetails" ? "parties" : route === "campaignDetails" ? "race" : "elections"}</button>}
          {route === "partyDetails" && <PoliticsRoute load={loadPolitics} revision={world} section="parties" initialId={detailId} busy={busy} onAction={onAction} />}
          {route === "electionDetails" && <PoliticsRoute load={loadPolitics} revision={world} section="elections" initialId={detailId} onOpenCampaign={openCampaign} busy={busy} onAction={onAction} />}
          {route === "campaignDetails" && <PoliticsRoute load={loadPolitics} revision={world} section="campaign" initialId={detailId} busy={busy} onAction={onAction} />}
          {route === "politicians" && <PoliticsRoute load={loadPolitics} revision={world} section="politicians" initialId={detailId} onOpenElection={openElection} busy={busy} onAction={onAction} />}
          {route === "banking" ? <FinancePanel finance={world.finance} section="banking" busy={busy} onAction={onAction} /> : null}
          {route === "notifications" ? (
            <NotificationsInbox
              items={world.notifications.items}
              turn={world.turn}
              busy={busy}
              onRead={onMarkNotificationRead}
              onDelete={onDeleteNotification}
              onReadAll={onMarkAllNotificationsRead}
              onOpen={openNotificationTarget}
              index={{ elections: world.elections, parties: world.parties, bills: world.legislature.bills }}
            />
          ) : null}
        </section>
        )}
      </main>

      <GameDrawer
        open={menuOpen}
        route={route}
        busy={busy}
        playerName={world.player.name}
        playerParty={world.player.partyName || "Independent"}
        countryName={world.countryName}
        turn={world.turn}
        date={world.date}
        message={message}
        error={error}
        menuButtonRef={menuButtonRef}
        onNavigate={go}
        onAdvanceTurn={onAdvanceTurn}
        onSave={onSave}
        onExit={onExit}
        onClose={() => setMenuOpen(false)}
        unreadCount={world.notifications.unread}
      />
      <footer aria-hidden={menuOpen || undefined} inert={menuOpen} ref={footerRef} className="ahd-footer" aria-label="Status and primary navigation">
        <div className="ahd-container ahd-footer-inner">
          <div className="ahd-statusline">
            <span className="ahd-mono">Turn {world.turn} · {world.date}</span>
            {saveNotice && !busy && !error ? <span className="ahd-muted" role="status">{message}</span>
              : <span className="ahd-muted">{busy ? (message ? `Processing: ${message}` : "Processing...") : "Player paced"}</span>}

          </div>
          <div className="ahd-status-resources" role="group" aria-label="Resources">
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
                  className="ahd-status-btn"
                  aria-label={`${r.label}: ${value}`}
                  aria-expanded={open}
                  aria-controls={open ? `ahd-resource-${r.id}` : undefined}
                  onClick={() => { setPreviewOpen(false); setOpenResource(open ? null : r.id); }}
                >
                  <span className="ahd-status-btn-label">{r.id === "influence" ? "INF" : r.id === "favorability" ? "FAV" : r.short}</span>
                  <span className="ahd-mono ahd-status-btn-value">{r.id === "funds" || r.id === "cash"
                    ? formatCompactMoney(r.id === "funds" ? world.player.funds : world.finance.cash, world.finance.currency)
                    : value}</span>
                </button>
              );
            })}
            <span ref={bellWrapRef} style={{ display: "inline-flex" }}>
              <NotificationBellButton
                unread={world.notifications.unread}
                busy={busy}
                expanded={previewOpen}
                onOpen={() => { setOpenResource(null); setPreviewOpen(true); }}
              />
            </span>
          </div>
          <BottomNav
            route={route}
            menuOpen={menuOpen}
            menuButtonRef={menuButtonRef}
            onNavigate={go}
            onOpenMenu={() => { setOpenResource(null); setMenuOpen(true); }}
          />
        </div>
        {previewOpen && !openResource ? (
          <div
            ref={previewRef}
            id="ahd-notification-preview"
            role="dialog"
            aria-modal="false"
            aria-label="Notification preview"
            tabIndex={-1}
            className="ahd-container ahd-resource-popover"
            onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); closePreview(); } }}
            style={{ outline: "none" }}
          >
            <NotificationPreview
              items={world.notifications.items}
              unread={world.notifications.unread}
              busy={busy}
              onRead={onMarkNotificationRead}
              onDelete={onDeleteNotification}
              onOpenInbox={() => openNotificationTarget({ route: "notifications" })}
            />
            <div style={{ marginTop: "0.5rem" }}>
              <button type="button" className="ahd-btn ahd-btn-sm ahd-btn-ghost" onClick={closePreview} aria-label="Close notification preview">
                Close
              </button>
            </div>
          </div>
        ) : null}
        {openResource ? (
          <div
            ref={detailsRef}
            role="dialog"
            aria-modal="false"
            aria-label={`${RESOURCES.find((r) => r.id === openResource)?.label} details`}
            id={`ahd-resource-${openResource}`}
            tabIndex={-1}
            className="ahd-container ahd-resource-popover"
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
                <button
                  type="button"
                  className="ahd-btn ahd-btn-sm"
                  onClick={() => {
                    // Footer details deep-link into the matching hub category;
                    // the world turn and hub selection survive the round trip.
                    setActionsCategory(openResource === "funds" || openResource === "cash" ? "fundraising" : "influence");
                    go("actions");
                  }}
                >Go to Actions</button>
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
