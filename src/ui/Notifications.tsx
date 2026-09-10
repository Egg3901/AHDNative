/**
 * Notification bell, five-item preview, and full inbox for offline SP.
 *
 * Mirrors the reference display hierarchy at the pinned authority revision:
 * navbar preview (limit 5, inline mark-read/delete, unread badge, inbox link)
 * and the inbox rail/reading pane with priority segment and This turn/Earlier
 * grouping. Mail threads are MP-only and stay out of this offline surface.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  previewItems,
  resolveNotificationDestination,
  unreadCount,
  type DestinationIndex,
  type NotificationItem,
  type NotificationRoute,
  type ResolvedDestination,
} from "../game/notifications";

export interface NotificationTarget {
  route: NotificationRoute;
  detailId?: string;
}

// Render page for the inbox rail. Stored history is never trimmed to bound
// render work; Show more only raises this limit.
export const INBOX_PAGE_SIZE = 25;

const CATEGORY_LABELS: Record<NotificationItem["category"], string> = {
  crisis: "Crisis",
  legislation: "Legislation",
  election: "Election",
  party: "Party",
  standing: "Standing",
  treasury: "Treasury",
  system: "System",
};

const DESTINATION_LABELS: Record<NotificationRoute, string> = {
  profile: "View profile",
  actions: "View actions",
  parties: "View parties",
  partyDetails: "View party",
  legislature: "View legislature",
  legislationDetails: "View bill",
  elections: "View elections",
  electionDetails: "View election",
  politicians: "View politicians",
  news: "View news",
  portfolio: "View portfolio",
  banking: "View banking",
  economy: "View economy",
  nations: "View nations",
};

const SECTION_ROUTES: Record<NotificationRoute, string> = {
  profile: "Profile",
  actions: "Actions",
  parties: "Parties",
  partyDetails: "Parties",
  legislature: "Legislature",
  legislationDetails: "Legislature",
  elections: "Elections",
  electionDetails: "Elections",
  politicians: "Politicians",
  news: "News",
  portfolio: "Portfolio",
  banking: "Banking",
  economy: "Economy",
  nations: "Nations",
};

function categoryLabel(item: NotificationItem): string {
  return CATEGORY_LABELS[item.category];
}

export function NotificationBellButton({ unread, busy, expanded, onOpen }: {
  unread: number;
  busy: boolean;
  expanded: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="ahd-status-btn"
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
      aria-expanded={expanded}
      aria-controls="ahd-notification-preview"
      onClick={onOpen}
      disabled={busy}
    >
      <span className="ahd-status-btn-label" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
      </span>
      {unread > 0 ? (
        <span className="ahd-badge" aria-hidden="true" style={{ background: "var(--ahd-primary)", color: "white" }}>
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </button>
  );
}

function ActionMarker() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", fontSize: "0.68rem", fontWeight: 750, color: "var(--ahd-error, #ef4444)" }}>
      <span style={{ width: "0.4rem", height: "0.4rem", borderRadius: 999, background: "currentColor" }} aria-hidden="true" />
      Needs you
    </span>
  );
}

export function NotificationPreview({ items, unread, busy, onRead, onDelete, onOpenInbox }: {
  items: NotificationItem[];
  unread: number;
  busy: boolean;
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenInbox: () => void;
}) {
  const preview = previewItems(items);
  return (
    <div className="ahd-stack">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
        <strong style={{ fontSize: "0.86rem" }}>Notifications</strong>
        <span className="ahd-muted" style={{ fontSize: "0.74rem" }} aria-live="polite">
          {unread > 0 ? `${unread} unread` : "All caught up"}
        </span>
      </div>
      {preview.length === 0 ? (
        <p className="ahd-muted" style={{ fontSize: "0.8rem" }}>No notifications yet. Elections, bills, party changes, and finances will appear here.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {preview.map((item) => (
            <li key={item.id} className="ahd-card ahd-card-pad" style={{ borderLeft: item.unread ? "3px solid var(--ahd-primary)" : undefined }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "baseline" }}>
                <span className="ahd-muted" style={{ fontSize: "0.66rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {categoryLabel(item)} · Turn {item.turn}
                </span>
                {item.unread && item.actionRequired ? <ActionMarker /> : null}
              </div>
              <div style={{ fontWeight: item.unread ? 750 : 500, fontSize: "0.82rem", marginTop: "0.15rem" }}>{item.title}</div>
              <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.4rem", flexWrap: "wrap" }}>
                {item.unread ? (
                  <button type="button" className="ahd-btn ahd-btn-sm" onClick={() => onRead(item.id)} disabled={busy} aria-label={`Mark read: ${item.title}`}>
                    Mark read
                  </button>
                ) : null}
                <button type="button" className="ahd-btn ahd-btn-ghost ahd-btn-sm" onClick={() => onDelete(item.id)} disabled={busy} aria-label={`Delete: ${item.title}`}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="ahd-btn ahd-btn-sm" onClick={onOpenInbox}>
        Open inbox{unread > 0 ? ` (${unread} unread)` : ""}
      </button>
    </div>
  );
}

export function NotificationsInbox({ items, turn, busy, onRead, onDelete, onReadAll, onOpen, index, resolve }: {
  items: NotificationItem[];
  turn: number;
  busy: boolean;
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
  onReadAll: () => void;
  onOpen: (target: NotificationTarget) => void;
  index?: DestinationIndex;
  resolve?: (item: NotificationItem) => ResolvedDestination;
}) {
  const [segment, setSegment] = useState<"all" | "action">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [limit, setLimit] = useState(INBOX_PAGE_SIZE);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const detailHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const focusRowOnCloseRef = useRef(false);
  const mountedRef = useRef(false);
  const resolveDestination = useMemo(() => {
    if (resolve) return resolve;
    const fallback: DestinationIndex = index ?? { elections: [], parties: [], bills: [] };
    return (item: NotificationItem) => resolveNotificationDestination(item, fallback);
  }, [resolve, index]);
  const unread = unreadCount(items);
  const needs = items.filter((item) => item.unread && item.actionRequired);
  const visible = segment === "action" ? needs : items;
  // Selection resolves against the full stored list, never the filtered
  // visible rows, so marking a Needs-you row read (which removes it from the
  // filtered segment) keeps the detail pane on the selected item.
  const selected = (selectedId != null ? items.find((item) => item.id === selectedId) : undefined)
    ?? visible[0]
    ?? items[0]
    ?? null;
  const resolved = selected ? resolveDestination(selected) : null;
  // Render work is bounded by paging the visible rows. Stored history is
  // never trimmed here; Show more only raises the render limit.
  const shown = visible.slice(0, limit);
  const thisTurn = shown.filter((item) => item.turn === turn);
  const earlier = shown.filter((item) => item.turn !== turn);

  const select = (item: NotificationItem) => {
    if (busy) return;
    setSelectedId(item.id);
    setDetailOpen(true);
    if (item.unread) onRead(item.id);
  };

  const backToList = () => {
    focusRowOnCloseRef.current = true;
    setDetailOpen(false);
  };

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (detailOpen) {
      detailHeadingRef.current?.focus();
    } else if (focusRowOnCloseRef.current) {
      focusRowOnCloseRef.current = false;
      if (selected) rowRefs.current.get(selected.id)?.focus();
    }
  }, [detailOpen, selected?.id]);

  const row = (item: NotificationItem) => (
    <li key={item.id} style={{ listStyle: "none" }}>
      <div className="ahd-card ahd-card-pad" style={{
        borderLeft: selected?.id === item.id ? "3px solid var(--ahd-primary)"
          : item.unread ? "3px solid var(--ahd-border)" : undefined,
      }}>
        <button
          type="button"
          ref={(el) => {
            if (el) rowRefs.current.set(item.id, el);
            else rowRefs.current.delete(item.id);
          }}
          className="ahd-btn ahd-btn-ghost ahd-btn-sm"
          style={{ display: "block", width: "100%", textAlign: "left", padding: 0 }}
          onClick={() => select(item)}
          disabled={busy}
          aria-label={`Open notification: ${item.title}`}
          aria-current={selected?.id === item.id ? "true" : undefined}
        >
          <span className="ahd-muted" style={{ fontSize: "0.66rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {categoryLabel(item)} · Turn {item.turn}
          </span>
          <span style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontWeight: item.unread ? 750 : 500, fontSize: "0.84rem" }}>
            {item.unread ? <span style={{ width: "0.45rem", height: "0.45rem", borderRadius: 999, background: "var(--ahd-primary)", flexShrink: 0 }} aria-label="Unread" /> : null}
            {item.title}
          </span>
          {item.unread && item.actionRequired ? <ActionMarker /> : null}
        </button>
        <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.35rem" }}>
          <button type="button" className="ahd-btn ahd-btn-ghost ahd-btn-sm" onClick={() => onDelete(item.id)} disabled={busy} aria-label={`Delete ${item.title}`}>
            Delete
          </button>
        </div>
      </div>
    </li>
  );

  const switchSegment = (next: "all" | "action") => {
    setSegment(next);
    setDetailOpen(false);
    setLimit(INBOX_PAGE_SIZE);
  };

  return (
    <div className="ahd-stack ahd-inbox" data-view={detailOpen ? "detail" : "list"}>
      <div className="ahd-card ahd-card-pad">
        <h2 className="ahd-h2">Inbox</h2>
        <p className="ahd-muted" style={{ fontSize: "0.76rem", marginTop: "0.25rem" }} aria-live="polite">
          {unread} unread{needs.length > 0 ? ` · ${needs.length} need${needs.length === 1 ? "s" : ""} you` : ""}
        </p>
        <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
          <button type="button" className="ahd-btn ahd-btn-sm" aria-pressed={segment === "all"} onClick={() => switchSegment("all")}>
            All ({items.length})
          </button>
          <button type="button" className="ahd-btn ahd-btn-sm" aria-pressed={segment === "action"} onClick={() => switchSegment("action")}>
            Needs you ({needs.length})
          </button>
          <button type="button" className="ahd-btn ahd-btn-sm" onClick={onReadAll} disabled={busy || unread === 0}>
            Mark all read
          </button>
        </div>
      </div>
      {visible.length === 0 && !selected ? (
        <div className="ahd-empty">{segment === "action" ? "Nothing needs you right now." : "No notifications yet."}</div>
      ) : (
        <div className="ahd-inbox-body">
          <div className="ahd-inbox-list ahd-stack">
            {visible.length === 0 ? (
              <div className="ahd-empty">{segment === "action" ? "Nothing needs you right now." : "No notifications yet."}</div>
            ) : null}
            {thisTurn.length > 0 ? (
              <section aria-label="This turn">
                <h3 style={{ fontSize: "0.8rem", fontWeight: 750 }}>This turn</h3>
                <ul style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>{thisTurn.map(row)}</ul>
              </section>
            ) : null}
            {earlier.length > 0 ? (
              <section aria-label="Earlier">
                <h3 style={{ fontSize: "0.8rem", fontWeight: 750 }}>Earlier</h3>
                <ul style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>{earlier.map(row)}</ul>
              </section>
            ) : null}
            {visible.length > limit ? (
              <div>
                <p className="ahd-muted" style={{ fontSize: "0.74rem" }} aria-live="polite">
                  Showing {shown.length} of {visible.length}
                </p>
                <button type="button" className="ahd-btn ahd-btn-sm" onClick={() => setLimit((n) => n + INBOX_PAGE_SIZE)}>
                  Show more ({visible.length - shown.length} remaining)
                </button>
              </div>
            ) : null}
          </div>
          {selected && resolved ? (
            <section role="region" aria-label="Notification detail" className="ahd-card ahd-card-pad ahd-inbox-detail">
              <button type="button" className="ahd-btn ahd-btn-ghost ahd-btn-sm ahd-inbox-back" onClick={backToList}>
                <span aria-hidden="true">←</span> Back to inbox
              </button>
              <span className="ahd-muted" style={{ fontSize: "0.66rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {categoryLabel(selected)} · Turn {selected.turn}
              </span>
              <h3 ref={detailHeadingRef} tabIndex={-1} style={{ margin: "0.2rem 0 0", fontSize: "0.95rem", fontWeight: 750, outline: "none" }}>{selected.title}</h3>
              {selected.body ? <p style={{ fontSize: "0.82rem", lineHeight: 1.55 }}>{selected.body}</p> : null}
              {resolved.fallbackUsed ? (
                <p className="ahd-help" role="note">The original target is no longer available. This opens {SECTION_ROUTES[resolved.route]} instead.</p>
              ) : null}
              <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
                <button
                  type="button"
                  className="ahd-btn ahd-btn-primary ahd-btn-sm"
                  disabled={busy}
                  onClick={() => onOpen({ route: resolved.route, ...(resolved.detailId ? { detailId: resolved.detailId } : {}) })}
                >
                  {DESTINATION_LABELS[resolved.route]}
                </button>
                <button type="button" className="ahd-btn ahd-btn-ghost ahd-btn-sm" onClick={() => onDelete(selected.id)} disabled={busy} aria-label={`Delete ${selected.title}`}>
                  Delete
                </button>
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
