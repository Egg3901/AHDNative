import type { Preferences, ReducedMotion, TextSize } from "../preferences";
import "./ui.css";

export interface SettingsPanelProps {
  value: Preferences;
  onChange: (value: Preferences) => void;
  error?: string | null;
}

function Choice({
  name,
  value,
  label,
  description,
  checked,
  onChange,
}: {
  name: string;
  value: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  const descriptionId = `${name}-${value}-description`;
  return (
    <label
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "0.65rem",
        border: "1px solid var(--ahd-border)",
        borderRadius: "var(--ahd-radius-sm)",
        padding: "0.7rem",
        background: checked ? "color-mix(in srgb, var(--ahd-primary) 10%, var(--ahd-card-elevated))" : "var(--ahd-card-elevated)",
        cursor: "pointer",
      }}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        aria-label={label}
        aria-describedby={descriptionId}
        style={{ marginTop: "0.18rem", flexShrink: 0 }}
      />
      <span style={{ display: "flex", flexDirection: "column", gap: "0.18rem" }}>
        <span style={{ fontSize: "0.82rem", fontWeight: 700 }}>{label}</span>
        <span id={descriptionId} className="ahd-muted" style={{ fontSize: "0.74rem", lineHeight: 1.45 }}>{description}</span>
      </span>
    </label>
  );
}

function TextSizeChoices({ value, onChange }: { value: TextSize; onChange: (value: TextSize) => void }) {
  return (
    <fieldset className="ahd-stack" style={{ border: 0, margin: 0, padding: 0, gap: "0.45rem" }}>
      <legend className="ahd-label" style={{ marginBottom: "0.2rem" }}>Text size</legend>
      <Choice
        name="settings-text-size"
        value="standard"
        label="Standard"
        description="Use the default text size."
        checked={value === "standard"}
        onChange={() => onChange("standard")}
      />
      <Choice
        name="settings-text-size"
        value="large"
        label="Large"
        description="Increase reading size across the app."
        checked={value === "large"}
        onChange={() => onChange("large")}
      />
    </fieldset>
  );
}

function ReducedMotionChoices({ value, onChange }: { value: ReducedMotion; onChange: (value: ReducedMotion) => void }) {
  return (
    <fieldset className="ahd-stack" style={{ border: 0, margin: 0, padding: 0, gap: "0.45rem" }}>
      <legend className="ahd-label" style={{ marginBottom: "0.2rem" }}>Reduced motion</legend>
      <Choice
        name="settings-reduced-motion"
        value="system"
        label="Use device setting"
        description="Follow the device setting for reduced motion."
        checked={value === "system"}
        onChange={() => onChange("system")}
      />
      <Choice
        name="settings-reduced-motion"
        value="on"
        label="Reduce motion"
        description="Limit interface movement and transitions."
        checked={value === "on"}
        onChange={() => onChange("on")}
      />
      <Choice
        name="settings-reduced-motion"
        value="off"
        label="Allow motion"
        description="Keep interface movement and transitions enabled."
        checked={value === "off"}
        onChange={() => onChange("off")}
      />
    </fieldset>
  );
}

export function SettingsPanel({ value, onChange, error }: SettingsPanelProps) {
  const update = (changes: Partial<Preferences>) => onChange({ ...value, ...changes });
  return (
    <div className="ahd-stack" aria-label="Settings">
      <header className="ahd-card ahd-card-pad">
        <div className="ahd-eyebrow">Device settings</div>
        <h1 className="ahd-h1" style={{ marginTop: "0.22rem" }}>Settings</h1>
        <p className="ahd-muted" style={{ fontSize: "0.8rem", lineHeight: 1.5, margin: "0.4rem 0 0" }}>
          These presentation choices apply to this app on this device. They do not change world rules, actions, saves, or account access.
        </p>
      </header>

      {error ? <div className="ahd-alert" role="alert">{error}</div> : null}

      <section className="ahd-card ahd-card-pad" aria-labelledby="settings-appearance">
        <h2 id="settings-appearance" className="ahd-h2">Appearance</h2>
        <div className="ahd-stack" style={{ marginTop: "0.75rem", gap: "1rem" }}>
          <TextSizeChoices value={value.textSize} onChange={(textSize) => update({ textSize })} />
          <ReducedMotionChoices value={value.reducedMotion} onChange={(reducedMotion) => update({ reducedMotion })} />
        </div>
      </section>
    </div>
  );
}

export default SettingsPanel;
