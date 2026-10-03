import { useEffect, useMemo, useState } from "react";
import type { MpRunningMateOption } from "../mp/validators";

export interface MpRunningMatePickerProps {
  electionId: string;
  options: MpRunningMateOption[] | null;
  currentRunningMateCharacterId: string | null;
  currentRunningMateName: string | null;
  busy: boolean;
  onLoad: (electionId: string) => void;
  onSave: (electionId: string, runningMateId: string | null) => void;
}

function formatPartyName(party: string): string {
  return party.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function partyLabel(party: string, partyName: string | null): string {
  return partyName ?? formatPartyName(party);
}

/**
 * Native MP control for AHDGame's authenticated presidential-ticket route.
 * The source endpoint supplies eligible human players and enforces that the
 * caller is the active candidate; this view never invents NPC or self options.
 */
export function MpRunningMatePicker({
  electionId,
  options,
  currentRunningMateCharacterId,
  currentRunningMateName,
  busy,
  onLoad,
  onSave,
}: MpRunningMatePickerProps) {
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [partyFilter, setPartyFilter] = useState("");
  const loaded = options !== null;
  const partyOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const option of options ?? []) byId.set(option.party, partyLabel(option.party, option.partyName));
    return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }, [options]);
  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (options ?? []).filter((option) => {
      if (partyFilter && option.party !== partyFilter) return false;
      if (!query) return true;
      return option.name.toLowerCase().includes(query);
    });
  }, [options, partyFilter, search]);
  const selectedOption = options?.find((option) => option.id === selectedId) ?? null;
  const hasSelectionChanged = selectedId !== currentRunningMateCharacterId;
  const visibleOptions = search.trim() ? filteredOptions.slice(0, 8) : filteredOptions.slice(0, 40);
  const canSaveSelection = selectedId !== "" && hasSelectionChanged && options?.some((option) => option.id === selectedId) === true;

  useEffect(() => {
    // A selection is valid only for the race and exact server-provided option
    // set it came from. Requiring a fresh choice prevents stale IDs surviving
    // a race switch or an eligibility refresh.
    setSelectedId("");
  }, [electionId, options, currentRunningMateCharacterId]);

  useEffect(() => {
    setSearch("");
    setPartyFilter("");
  }, [electionId, options]);

  return (
    <section aria-label="Presidential running mate" className="ahd-mp-running-mate">
      <h3 className="ahd-h3">Running mate</h3>
      <p className="ahd-help" role="note">
        Choose an eligible player from your country to join your ticket.
      </p>
      <p className="ahd-muted" role="status">
        Current running mate: {currentRunningMateName ?? (currentRunningMateCharacterId ? "Selected player" : "None selected")}
      </p>
      {currentRunningMateCharacterId !== null && (
        <button type="button" className="ahd-btn ahd-btn-sm" disabled={busy} onClick={() => onSave(electionId, null)}>
          Clear running mate
        </button>
      )}
      {!loaded ? (
        <button type="button" className="ahd-btn ahd-btn-sm" disabled={busy} onClick={() => onLoad(electionId)}>
          Load eligible players
        </button>
      ) : options.length === 0 ? (
        <p className="ahd-muted" role="status">No eligible player characters are available for this ticket.</p>
      ) : (
        <div className="ahd-stack">
          <div className="ahd-mp-row">
            <label className="ahd-field">
              <span className="ahd-label">Search eligible players</span>
              <input type="search" aria-label="Search eligible players" value={search} onChange={(event) => setSearch(event.target.value)} disabled={busy} />
            </label>
            <label className="ahd-field">
              <span className="ahd-label">Party</span>
              <select aria-label="Filter eligible players by party" value={partyFilter} onChange={(event) => setPartyFilter(event.target.value)} disabled={busy}>
                <option value="">All parties</option>
                {partyOptions.map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}
              </select>
            </label>
            <label className="ahd-field">
              <span className="ahd-sr-only">Choose a running mate</span>
              <select aria-label="Choose a running mate" value={selectedId} onChange={(event) => setSelectedId(event.target.value)} disabled={busy}>
                <option value="">Choose an eligible player</option>
                {visibleOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name} · {partyLabel(option.party, option.partyName)} · {option.homeState}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="ahd-btn ahd-btn-sm ahd-btn-primary"
              disabled={busy || !canSaveSelection}
              onClick={() => onSave(electionId, selectedId)}
            >
              Save running mate
            </button>
          </div>
          <section className="ahd-card ahd-card-pad" aria-label="Selected running mate">
            <p className="ahd-label">Selected running mate</p>
            <strong>{selectedOption?.name ?? currentRunningMateName ?? "None selected"}</strong>
            <p className="ahd-help">{selectedOption
              ? `${partyLabel(selectedOption.party, selectedOption.partyName)} · ${selectedOption.homeState}`
              : currentRunningMateName ? "Current server selection" : "Choose a player from the matches above."}</p>
          </section>
          {search.trim() && filteredOptions.length === 0 ? <p className="ahd-muted" role="status">No players match that search yet.</p> : null}
          {!search.trim() && filteredOptions.length === 0 ? <p className="ahd-muted" role="status">No players match the current party filter.</p> : null}
          {search.trim() && filteredOptions.length > visibleOptions.length ? <p className="ahd-muted" role="status">{filteredOptions.length} matching players found. Keep typing to narrow the list.</p> : null}
          {!search.trim() && filteredOptions.length > visibleOptions.length ? <p className="ahd-muted" role="status">Showing the first {visibleOptions.length} players. Search to narrow the list.</p> : null}
        </div>
      )}
    </section>
  );
}
