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
  const trimmedName = opts.playerName.trim();
  const nameLen = [...trimmedName].length;
  if (!trimmedName) errs.playerName = "Enter your name.";
  else if (nameLen > 80) errs.playerName = "Name must be 80 characters or fewer.";
  else if (nameLen < 1) errs.playerName = "Enter your name.";
  const seedTrimmed = opts.seed.trim();
  if ([...seedTrimmed].length > 256) errs.seed = "Seed must be 256 characters or fewer.";
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

  useEffect(() => {
    if (!era && eras[0]) {
      setEra(eras[0].id);
      setCountryId(eras[0].countries[0]?.id ?? "");
    }
  }, [eras, era]);

  const options: NewGameOptions = { era, countryId, playerName, seed: seed.trim() };
  const fieldErrors = useMemo(() => (touched ? validate(options, eras) : {}), [touched, options, eras]);
  const canSubmit = useMemo(() => Object.keys(validate(options, eras)).length === 0, [options, eras]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
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

        <form onSubmit={handleSubmit} noValidate>
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
                      className={selected ? "ahd-era-card ahd-era-card-selected" : "ahd-era-card"}
                      style={{
                        cursor: busy ? "not-allowed" : "pointer",
                      }}
                    >
                      <input
                        type="radio"
                        name="era"
                        value={e.id}
                        checked={selected}
                        onChange={() => setEra(e.id)}
                        className="ahd-era-input"
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
                  maxLength={80}
                  autoComplete="nickname"
                  aria-describedby={fieldErrors.playerName ? "ng-name-error" : undefined}
                  aria-invalid={!!fieldErrors.playerName}
                />
                {fieldErrors.playerName ? <span id="ng-name-error" className="ahd-error-text" role="alert">{fieldErrors.playerName}</span> : <span className="ahd-help">1 to 80 characters</span>}
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
                maxLength={256}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                aria-describedby={fieldErrors.seed ? "ng-seed-error" : "ng-seed-help"}
                aria-invalid={!!fieldErrors.seed}
              />
              {fieldErrors.seed ? <span id="ng-seed-error" className="ahd-error-text" role="alert">{fieldErrors.seed}</span> : <span id="ng-seed-help" className="ahd-help">Optional, any characters, up to 256</span>}
            </div>

            {localError ? <div className="ahd-alert" role="alert">{localError}</div> : null}
            {error ? <div className="ahd-alert" role="alert">{error}</div> : null}

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
              <button type="submit" className="ahd-btn ahd-btn-primary" disabled={busy} aria-busy={busy}>
                {busy ? <span className="ahd-spinner" aria-hidden /> : null}
                {busy ? "Starting" : "Start"}
              </button>
              <button type="button" className="ahd-btn ahd-btn-ghost" onClick={onBack} disabled={busy}>Back</button>
              {!canSubmit && touched ? <span className="ahd-muted" style={{ fontSize: "0.76rem" }}>Fix the highlighted fields to start.</span> : null}
            </div>
          </fieldset>
        </div>
        </form>

        <p className="ahd-muted" style={{ fontSize: "0.72rem", marginTop: "0.65rem" }}>
          Countries shown are those the local content reports for the chosen era. Multiplayer keeps the authoritative roster on the server.
        </p>
      </div>
    </div>
  );
}

export default NewGameScreen;
