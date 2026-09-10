/**
 * NewGameScreen — AHDNative new-game flow.
 *
 * Visual baseline adapted from public AHDGame singleplayer UI:
 *   src/app/singleplayer/SingleplayerHome.tsx (era preset cards, card-muted/border tokens)
 *   src/app/globals.css (default theme: bg #14141c, card #1d1d2a, border #2a2a3d, primary #dc2626)
 * Source is public (Egg3901/AHDGame). Tokens reused for parity; layout adapted for
 * responsive Tauri web (touch targets, safe-area insets). No proprietary assets copied.
 */
import { useEffect, useMemo, useState } from "react";
import type { EraChoice, NewGameOptions, NewGameScreenProps } from "../game/types";
import "./ui.css";

function validate(opts: NewGameOptions, eras: EraChoice[]): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!opts.era) errs.era = "Choose an era.";
  if (!opts.countryId) errs.countryId = "Choose a country.";
  else {
    const era = eras.find((e) => e.id === opts.era);
    if (era && !era.countries.some((c) => c.id === opts.countryId)) {
      errs.countryId = "Country not available in this era.";
    }
  }
  if (!opts.playerName.trim()) errs.playerName = "Enter your name.";
  else if (opts.playerName.trim().length < 2) errs.playerName = "Name must be at least 2 characters.";
  else if (opts.playerName.trim().length > 40) errs.playerName = "Name must be 40 characters or fewer.";
  if (opts.seed && opts.seed.length > 64) errs.seed = "Seed must be 64 characters or fewer.";
  if (opts.seed && !/^[a-zA-Z0-9_-]*$/.test(opts.seed)) errs.seed = "Seed may only contain letters, numbers, hyphen and underscore.";
  return errs;
}

export function NewGameScreen({ eras, busy, error, onStart, onBack }: NewGameScreenProps) {
  const [era, setEra] = useState(() => eras[0]?.id ?? "");
  const [countryId, setCountryId] = useState(() => eras[0]?.countries[0]?.id ?? "");
  const [playerName, setPlayerName] = useState("");
  const [seed, setSeed] = useState("");
  const [touched, setTouched] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const activeEra = useMemo(() => eras.find((e) => e.id === era) ?? null, [eras, era]);

  // Country adjusts with era: if current country not in new era, reset to first available.
  useEffect(() => {
    if (!activeEra) {
      if (countryId) setCountryId("");
      return;
    }
    const ids = new Set(activeEra.countries.map((c) => c.id));
    if (!ids.has(countryId)) {
      setCountryId(activeEra.countries[0]?.id ?? "");
    }
  }, [activeEra, countryId]);

  // If eras prop changes externally (e.g. empty -> loaded), initialise era.
  useEffect(() => {
    if (!era && eras[0]) {
      setEra(eras[0].id);
      setCountryId(eras[0].countries[0]?.id ?? "");
    }
  }, [eras, era]);

  const options: NewGameOptions = { era, countryId, playerName, seed: seed.trim() };
  const fieldErrors = useMemo(() => (touched ? validate(options, eras) : {}), [touched, options, eras]);
  const canSubmit = useMemo(() => Object.keys(validate(options, eras)).length === 0, [options, eras]);

  const handleSubmit = () => {
    setTouched(true);
    setLocalError(null);
    const errs = validate(options, eras);
    if (Object.keys(errs).length > 0) {
      const first = Object.values(errs)[0];
      setLocalError(first);
      return;
    }
    onStart({ era, countryId, playerName: playerName.trim(), seed: seed.trim() });
  };

  return (
    <div className="ahd-screen">
      <div className="ahd-container" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))", paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))", maxWidth: "42rem" }}>
        <header style={{ marginBottom: "1rem" }}>
          <p className="ahd-eyebrow">Singleplayer</p>
          <h1 className="ahd-h1">A House Divided</h1>
          <p className="ahd-muted" style={{ fontSize: "0.84rem", marginTop: "0.3rem", lineHeight: 1.5 }}>
            Start a new world on this device. Era fixes the starting preset and available countries; seed makes the world reproducible.
          </p>
        </header>

        {eras.length === 0 ? (
          <div className="ahd-empty" role="status">No eras available. Engine content not loaded.</div>
        ) : null}

        <div className="ahd-card ahd-card-pad">
          <h2 className="ahd-h2">New game</h2>

          <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: "0.85rem 0 0", display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            <div>
              <p className="ahd-label" id="era-label" style={{ marginBottom: "0.4rem" }}>Era</p>
              <div role="radiogroup" aria-labelledby="era-label" className="ahd-grid ahd-grid-2">
                {eras.map((e) => {
                  const selected = e.id === era;
                  return (
                    <label
                      key={e.id}
                      style={{
                        cursor: busy ? "not-allowed" : "pointer",
                        border: selected ? "1px solid var(--ahd-primary)" : "1px solid var(--ahd-border)",
                        background: selected ? "color-mix(in srgb, var(--ahd-primary) 10%, var(--ahd-card))" : "var(--ahd-card)",
                        borderRadius: "var(--ahd-radius-sm)",
                        padding: "0.62rem 0.7rem",
                        display: "flex", flexDirection: "column", gap: "0.15rem",
                      }}
                    >
                      <input
                        type="radio"
                        name="era"
                        value={e.id}
                        checked={selected}
                        onChange={() => setEra(e.id)}
                        className="sr-only"
                        style={{ position: "absolute", opacity: 0, width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}
                        aria-label={e.label}
                      />
                      <span style={{ fontWeight: 750, fontSize: "0.92rem" }}>{e.label}</span>
                      <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>{e.countries.length} countries</span>
                    </label>
                  );
                })}
              </div>
              {fieldErrors.era ? <p className="ahd-error-text" role="alert">{fieldErrors.era}</p> : null}
            </div>

            <div className="ahd-grid ahd-grid-2">
              <div className="ahd-field">
                <label className="ahd-label" htmlFor="ng-country">Country</label>
                <select
                  id="ng-country"
                  className="ahd-select"
                  value={countryId}
                  onChange={(e) => setCountryId(e.target.value)}
                  aria-describedby={fieldErrors.countryId ? "ng-country-error" : undefined}
                  aria-invalid={!!fieldErrors.countryId}
                >
                  {activeEra?.countries.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                  {!activeEra ? <option value="">Select an era first</option> : null}
                  {activeEra && activeEra.countries.length === 0 ? <option value="">No countries in this era</option> : null}
                </select>
                {fieldErrors.countryId ? <span id="ng-country-error" className="ahd-error-text" role="alert">{fieldErrors.countryId}</span> : null}
              </div>

              <div className="ahd-field">
                <label className="ahd-label" htmlFor="ng-name">Your name</label>
                <input
                  id="ng-name"
                  className="ahd-input"
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Player"
                  maxLength={40}
                  autoComplete="nickname"
                  aria-describedby={fieldErrors.playerName ? "ng-name-error" : undefined}
                  aria-invalid={!!fieldErrors.playerName}
                />
                {fieldErrors.playerName ? <span id="ng-name-error" className="ahd-error-text" role="alert">{fieldErrors.playerName}</span> : <span className="ahd-help">2 to 40 characters</span>}
              </div>
            </div>

            <div className="ahd-field">
              <label className="ahd-label" htmlFor="ng-seed">Seed <span className="ahd-muted" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>(optional, reproducible)</span></label>
              <input
                id="ng-seed"
                className="ahd-input"
                type="text"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                placeholder="Leave empty for random"
                maxLength={64}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                aria-describedby={fieldErrors.seed ? "ng-seed-error" : "ng-seed-help"}
                aria-invalid={!!fieldErrors.seed}
              />
              {fieldErrors.seed ? <span id="ng-seed-error" className="ahd-error-text" role="alert">{fieldErrors.seed}</span> : <span id="ng-seed-help" className="ahd-help">Letters, numbers, hyphen and underscore, up to 64</span>}
            </div>

            {localError ? <div className="ahd-alert" role="alert">{localError}</div> : null}
            {error ? <div className="ahd-alert" role="alert">{error}</div> : null}

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
              <button type="button" className="ahd-btn ahd-btn-primary" onClick={handleSubmit} disabled={busy} aria-busy={busy}>
                {busy ? <span className="ahd-spinner" aria-hidden /> : null}
                {busy ? "Starting" : "Start"}
              </button>
              <button type="button" className="ahd-btn ahd-btn-ghost" onClick={onBack} disabled={busy}>Back</button>
              {!canSubmit && touched ? <span className="ahd-muted" style={{ fontSize: "0.76rem" }}>Fix the highlighted fields to start.</span> : null}
            </div>
          </fieldset>
        </div>

        <p className="ahd-muted" style={{ fontSize: "0.72rem", marginTop: "0.65rem" }}>
          Countries shown are those the local content reports for the chosen era. Multiplayer keeps the authoritative roster on the server.
        </p>
      </div>
    </div>
  );
}

export default NewGameScreen;
