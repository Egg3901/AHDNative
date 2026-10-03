import { useState } from "react";
import type { MpRunningMateOption } from "../mp/validators";

export interface MpRunningMatePickerProps {
  electionId: string;
  options: MpRunningMateOption[] | null;
  busy: boolean;
  onLoad: (electionId: string) => void;
  onSave: (electionId: string, runningMateId: string) => void;
}

/**
 * Native MP control for AHDGame's authenticated presidential-ticket route.
 * The source endpoint supplies eligible human players and enforces that the
 * caller is the active candidate; this view never invents NPC or self options.
 */
export function MpRunningMatePicker({ electionId, options, busy, onLoad, onSave }: MpRunningMatePickerProps) {
  const [selectedId, setSelectedId] = useState("");
  const loaded = options !== null;
  return (
    <section aria-label="Presidential running mate" className="ahd-mp-running-mate">
      <h3 className="ahd-h3">Running mate</h3>
      <p className="ahd-help" role="note">
        The live game lets a presidential candidate choose another eligible player from their country.
      </p>
      {!loaded ? (
        <button type="button" className="ahd-btn ahd-btn-sm" disabled={busy} onClick={() => onLoad(electionId)}>
          Load eligible players
        </button>
      ) : options.length === 0 ? (
        <p className="ahd-muted" role="status">No eligible player characters are available for this ticket.</p>
      ) : (
        <div className="ahd-mp-row">
          <label>
            <span className="ahd-sr-only">Choose a running mate</span>
            <select aria-label="Choose a running mate" value={selectedId} onChange={(event) => setSelectedId(event.target.value)} disabled={busy}>
              <option value="">Choose an eligible player</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name} · {option.partyName ?? option.party} · {option.homeState}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="ahd-btn ahd-btn-sm ahd-btn-primary" disabled={busy || !selectedId} onClick={() => onSave(electionId, selectedId)}>
            Save running mate
          </button>
        </div>
      )}
    </section>
  );
}
