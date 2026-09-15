import { WORLD_FEATURE_FLAG_DEFINITIONS, type WorldFeatureFlags } from "@ahdclient/engine";
import "./ui.css";

export interface WorldSettingsPanelProps {
  /** Live rule map from the session view; every toggle submits a complete map. */
  flags: WorldFeatureFlags;
  busy: boolean;
  onChange: (next: WorldFeatureFlags) => void;
}

/**
 * WorldSettingsPanel (#352): the in-game local World administration surface.
 * Renders exactly the engine's canonical WORLD_FEATURE_FLAG_DEFINITIONS with
 * each rule's source label, description, and current saved value. This is the
 * Native counterpart of AHDGame's /singleplayer/admin running-world gates
 * (Egg3901/AHDGame#1903): the local player owns the world, so there is no
 * auth gate, and every control persists through the session/save contract.
 * Device presentation stays in SettingsPanel; this panel only edits the
 * saved world's simulation rules.
 */
export function WorldSettingsPanel({ flags, busy, onChange }: WorldSettingsPanelProps) {
  return (
    <div className="ahd-stack" aria-label="World settings">
      <header className="ahd-card ahd-card-pad ahd-hero">
        <div className="ahd-eyebrow">World</div>
        <h1 className="ahd-h1" style={{ marginTop: "0.22rem" }}>World settings</h1>
        <p className="ahd-muted" style={{ fontSize: "0.8rem", lineHeight: 1.5, margin: "0.4rem 0 0" }}>
          Choose which simulation systems run in this saved world. Changes save
          with the world and gate the simulation from the next turn.
        </p>
      </header>
      <div className="ahd-grid ahd-grid-2">
        {WORLD_FEATURE_FLAG_DEFINITIONS.map((definition) => (
          <label
            key={definition.key}
            className="ahd-era-card"
            style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.45rem", alignItems: "start" }}
          >
            <input
              type="checkbox"
              aria-label={definition.label}
              checked={flags[definition.key]}
              disabled={busy}
              onChange={(event) => onChange({ ...flags, [definition.key]: event.target.checked })}
            />
            <span>
              <span style={{ display: "block", fontWeight: 700, fontSize: "0.82rem" }}>{definition.label}</span>
              <span className="ahd-muted" style={{ display: "block", fontSize: "0.7rem", lineHeight: 1.4 }}>{definition.description}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

export default WorldSettingsPanel;
