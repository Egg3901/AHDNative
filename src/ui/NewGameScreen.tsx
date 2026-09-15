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
import { DEFAULT_NPP_AUTONOMY_LEVEL, DEFAULT_WORLD_FEATURE_FLAGS, NPP_AUTONOMY_LEVELS, WORLD_FEATURE_FLAG_DEFINITIONS, isOnePartyCountry } from "@ahdclient/engine";
import type { NppAutonomyLevel } from "@ahdclient/engine";
import type { EraChoice, NewGameOptions, NewGameScreenProps, WorldInitialization } from "../game/types";
import { PartyMark } from "./PartyMark";
import "./ui.css";

function validate(opts: NewGameOptions, eras: EraChoice[]): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!opts.era) errs.era = "Choose an era.";
  if (!opts.countryId) errs.countryId = "Choose a country.";
  const era = eras.find((e) => e.id === opts.era);
  const country = era?.countries.find((c) => c.id === opts.countryId) ?? null;
  if (opts.countryId && era && !era.countries.some((c) => c.id === opts.countryId)) {
    errs.countryId = "Country not available in this era.";
  }
  if (country && country.regions.length > 0) {
    if (!opts.homeRegionId || !country.regions.some((r) => r.id === opts.homeRegionId)) {
      errs.homeRegionId = "Choose a home region.";
    }
  }
  if (opts.mode === "hos" && country) {
    const initialization = opts.initialization ?? "founding";
    if (!country.headOfStateOffice) {
      errs.mode = "No executive office for this country; Head of State is unavailable.";
    } else if (!country.rulingPartyByInitialization[initialization]) {
      errs.mode = "No governing party for this initialization; Head of State is unavailable.";
    }
  }
  const trimmedName = opts.playerName.trim();
  const nameLen = trimmedName.length;
  if (!trimmedName) errs.playerName = "Enter your name.";
  else if (nameLen > 80) errs.playerName = "Name must be 80 characters or fewer.";
  else if (nameLen < 1) errs.playerName = "Enter your name.";
  const seedTrimmed = opts.seed.trim();
  if (seedTrimmed.length > 256) errs.seed = "Seed must be 256 characters or fewer.";
  return errs;
}

const EXECUTIVE_OFFICE_TITLES: Record<string, string> = {
  president: "President",
  primeMinister: "Prime Minister",
  chancellor: "Chancellor",
  premier: "Premier",
  taoiseach: "Taoiseach",
  firstMinister: "First Minister",
  firstSecretary: "First Secretary",
  generalSecretary: "General Secretary",
};

/**
 * HoS seating-path notice (#243 creation-UI slice of #240). The reference
 * seats the singleplayer head of state through office records
 * (AHDGame src/lib/singleplayerHeadOfState.ts): president for presidential
 * systems, the authored executive office otherwise — via parliamentary
 * appointment (appointPrimeMinister) or the one-party legislature-appointment
 * system. The engine binds that same office at creation and marks it
 * permanent (packages/engine/src/world.ts), so the creation screen states
 * the path before the world exists. Unknown office keys fall back to the
 * raw key; no title is invented.
 */
function hosSeatingNotice(country: { id: string; name: string; headOfStateOffice: string | null }): string | null {
  const office = country.headOfStateOffice;
  if (!office) return null;
  const title = EXECUTIVE_OFFICE_TITLES[office] ?? office;
  const permanent = "The office is permanent for this world.";
  if (isOnePartyCountry(country.id)) {
    return `Seated by legislature appointment as ${title} of ${country.name} when the world starts. ${permanent}`;
  }
  if (office === "president") {
    return `Seated as President of ${country.name} when the world starts. ${permanent}`;
  }
  return `Seated by parliamentary appointment as ${title} of ${country.name} when the world starts. ${permanent}`;
}

export function NewGameScreen({ eras, busy, error, onStart, onBack }: NewGameScreenProps) {
  const [era, setEra] = useState(() => eras[0]?.id ?? "");
  const [countryId, setCountryId] = useState(() => eras[0]?.countries[0]?.id ?? "");
  const [mode, setMode] = useState<"career" | "hos" | "worldsim">("career");
  const [difficulty, setDifficulty] = useState<"easy" | "normal" | "hard">("normal");
  const [autonomyLevel, setAutonomyLevel] = useState<NppAutonomyLevel>(DEFAULT_NPP_AUTONOMY_LEVEL);
  const [initialization, setInitialization] = useState<WorldInitialization>("founding");
  const [homeRegionId, setHomeRegionId] = useState(() => eras[0]?.countries[0]?.regions[0]?.id ?? "");
  const [playerName, setPlayerName] = useState("");
  const [seed, setSeed] = useState("");
  const [featureFlags, setFeatureFlags] = useState(() => ({ ...DEFAULT_WORLD_FEATURE_FLAGS }));
  const [touched, setTouched] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const activeEra = useMemo(() => eras.find((e) => e.id === era) ?? null, [eras, era]);
  const activeCountry = useMemo(() => activeEra?.countries.find((c) => c.id === countryId) ?? null, [activeEra, countryId]);
  const previewParty = activeCountry?.rulingPartyByInitialization[initialization] ?? null;
  const hasExecutiveOffice = !!activeCountry?.headOfStateOffice;
  const hosUnavailableReason = !activeCountry
    ? "Select a country."
    : !hasExecutiveOffice
      ? `No executive office is set for ${activeCountry.name}; Head of State is unavailable.`
      : !previewParty
        ? `No governing party exists for the ${initialization} start in ${activeCountry.name}; Head of State is unavailable.`
        : null;
  const hosEligible = !hosUnavailableReason;
  const hosSeating = mode === "hos" && activeCountry && previewParty ? hosSeatingNotice(activeCountry) : null;

  useEffect(() => {
    if (!activeEra) {
      if (countryId) setCountryId("");
      return;
    }
    const ids = new Set(activeEra.countries.map((c) => c.id));
    if (!ids.has(countryId)) {
      const next = activeEra.countries[0] ?? null;
      setCountryId(next?.id ?? "");
      setHomeRegionId(next?.regions[0]?.id ?? "");
    }
  }, [activeEra, countryId]);

  useEffect(() => {
    if (!activeCountry) {
      if (homeRegionId) setHomeRegionId("");
      return;
    }
    if (!activeCountry.regions.some((r) => r.id === homeRegionId)) {
      setHomeRegionId(activeCountry.regions[0]?.id ?? "");
    }
  }, [activeCountry, homeRegionId]);

  useEffect(() => {
    if (mode === "hos" && !hosEligible) setMode("career");
  }, [mode, hosEligible]);

  useEffect(() => {
    if (!era && eras[0]) {
      setEra(eras[0].id);
      setCountryId(eras[0].countries[0]?.id ?? "");
    }
  }, [eras, era]);

  const options: NewGameOptions = { era, countryId, playerName, seed: seed.trim(), mode, homeRegionId, initialization, featureFlags, difficulty, autonomyLevel };
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
    // Never submit HoS with a null governing party; the engine would bind a
    // career-equivalent player while the UI claimed HoS.
    const finalMode = mode === "hos" && !previewParty ? "career" : mode;
    onStart({ era, countryId, playerName: playerName.trim(), seed: seed.trim(), mode: finalMode, homeRegionId, initialization, featureFlags: { ...featureFlags }, difficulty, autonomyLevel });
  };

  return (
    <div className="ahd-screen">
      <div className="ahd-container ahd-newgame" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))", paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))", maxWidth: "42rem" }}>
        <header className="ahd-newgame-hero">
          <p className="ahd-eyebrow">Singleplayer</p>
          <h1 className="ahd-h1">A House Divided</h1>
          <p className="ahd-muted" style={{ fontSize: "0.84rem", marginTop: "0.3rem", lineHeight: 1.5 }}>
            Start a new world on this device. Era fixes the starting preset and available countries; seed makes the world reproducible.
          </p>
        </header>

        {eras.length === 0 ? (
          <div className="ahd-empty" role="status">No eras available. Engine content not loaded.</div>
        ) : null}

        <form className="ahd-newgame-form" onSubmit={handleSubmit} noValidate>
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

            <div>
              <p className="ahd-label" id="mode-label" style={{ marginBottom: "0.4rem" }}>Play as</p>
              <div role="radiogroup" aria-labelledby="mode-label" className="ahd-mode-row">
                <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", minHeight: 44, cursor: busy ? "not-allowed" : "pointer" }}>
                  <input
                    type="radio"
                    name="mode"
                    value="career"
                    checked={mode === "career"}
                    onChange={() => setMode("career")}
                    aria-label="Career"
                  />
                  <span style={{ fontSize: "0.86rem" }}>Career</span>
                </label>
                <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", minHeight: 44, cursor: busy || !hosEligible ? "not-allowed" : "pointer" }}>
                  <input
                    type="radio"
                    name="mode"
                    value="hos"
                    checked={mode === "hos"}
                    onChange={() => setMode("hos")}
                    disabled={!hosEligible}
                    aria-label="Head of State"
                  />
                  <span style={{ fontSize: "0.86rem" }}>Head of State</span>
                </label>
                <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", minHeight: 44, cursor: busy ? "not-allowed" : "pointer" }}>
                  <input
                    type="radio"
                    name="mode"
                    value="worldsim"
                    checked={mode === "worldsim"}
                    onChange={() => setMode("worldsim")}
                    disabled={busy}
                    aria-label="Worldsim"
                  />
                  <span style={{ fontSize: "0.86rem" }}>Worldsim</span>
                </label>
              </div>
              {mode === "worldsim" ? (
                <p className="ahd-help" role="note" style={{ marginTop: "0.3rem" }}>
                  Spectate a world without a player character. Advance turns to run the simulation; character actions are unavailable.
                </p>
              ) : null}
              {activeCountry ? (
                <p className="ahd-help" style={{ marginTop: "0.3rem" }}>
                  {activeCountry.headOfStateOffice
                    ? `Executive office: ${activeCountry.headOfStateOffice}`
                    : "No executive office is set for this country."}
                </p>
              ) : null}
              {previewParty ? (
                mode === "hos" ? (
                  <div className="ahd-preview-row">
                    <PartyMark name={previewParty.name} abbreviation={previewParty.abbreviation} id={previewParty.id} countryId={countryId} logoUrl={previewParty.logoUrl} size={24} />
                    <p className="ahd-help" style={{ margin: 0 }}>
                      Govern as {previewParty.name} ({previewParty.abbreviation}) in {activeCountry?.name ?? "this country"}
                    </p>
                  </div>
                ) : null
              ) : (
                <p className="ahd-help" role="note" style={{ marginTop: "0.3rem" }}>
                  {hosUnavailableReason}
                </p>
              )}
              {hosSeating ? (
                <p className="ahd-help" role="note" style={{ marginTop: "0.3rem" }}>
                  {hosSeating}
                </p>
              ) : null}
              {fieldErrors.mode ? <span className="ahd-error-text" role="alert">{fieldErrors.mode}</span> : null}
            </div>

            <div>
              <p className="ahd-label" id="difficulty-label" style={{ marginBottom: "0.4rem" }}>Difficulty</p>
              <div role="radiogroup" aria-labelledby="difficulty-label" style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                {(["easy", "normal", "hard"] as const).map((level) => (
                  <label key={level} style={{ display: "flex", gap: "0.4rem", alignItems: "center", minHeight: 44, cursor: busy ? "not-allowed" : "pointer", textTransform: "capitalize" }}>
                    <input
                      type="radio"
                      name="difficulty"
                      value={level}
                      checked={difficulty === level}
                      onChange={() => setDifficulty(level)}
                      disabled={busy}
                      aria-label={level[0]!.toUpperCase() + level.slice(1)}
                    />
                    <span style={{ fontSize: "0.86rem", textTransform: "capitalize" }}>{level}</span>
                  </label>
                ))}
              </div>
              <p className="ahd-help" style={{ marginTop: "0.3rem" }}>
                Sets how competently autonomous politicians perform. Normal matches the standard game.
              </p>
            </div>

            <div>
              <p className="ahd-label" id="autonomy-label" style={{ marginBottom: "0.4rem" }}>Autonomy</p>
              <div role="radiogroup" aria-labelledby="autonomy-label" style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                {NPP_AUTONOMY_LEVELS.map((tier) => (
                  <label key={tier} style={{ display: "flex", gap: "0.4rem", alignItems: "center", minHeight: 44, cursor: busy ? "not-allowed" : "pointer" }}>
                    <input
                      type="radio"
                      name="autonomy"
                      value={tier}
                      checked={autonomyLevel === tier}
                      onChange={() => setAutonomyLevel(tier)}
                      disabled={busy}
                      aria-label={`Autonomy: ${tier}`}
                    />
                    <span style={{ fontSize: "0.86rem" }}>{tier}</span>
                  </label>
                ))}
              </div>
              <p className="ahd-help" style={{ marginTop: "0.3rem" }}>
                Sets which activities autonomous politicians may perform. V4 is the standard game.
              </p>
            </div>

            <div className="ahd-field">
              <label className="ahd-label" htmlFor="ng-region">Home region</label>
              <select
                id="ng-region"
                className="ahd-select"
                value={homeRegionId}
                onChange={(e) => setHomeRegionId(e.target.value)}
                disabled={!activeCountry || activeCountry.regions.length === 0}
                aria-describedby={fieldErrors.homeRegionId ? "ng-region-error" : undefined}
                aria-invalid={!!fieldErrors.homeRegionId}
              >
                {activeCountry?.regions.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
                {!activeCountry || activeCountry.regions.length === 0 ? <option value="">No regions</option> : null}
              </select>
              {fieldErrors.homeRegionId ? <span id="ng-region-error" className="ahd-error-text" role="alert">{fieldErrors.homeRegionId}</span> : null}
            </div>

            <div>
              <p className="ahd-label" id="init-label" style={{ marginBottom: "0.4rem" }}>World initialization</p>
              <div role="radiogroup" aria-labelledby="init-label" style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", cursor: busy ? "not-allowed" : "pointer" }}>
                  <input
                    type="radio"
                    name="initialization"
                    value="founding"
                    checked={initialization === "founding"}
                    onChange={() => setInitialization("founding")}
                    aria-label="Founding"
                  />
                  <span style={{ fontSize: "0.86rem" }}>Founding</span>
                </label>
                <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", cursor: busy ? "not-allowed" : "pointer" }}>
                  <input
                    type="radio"
                    name="initialization"
                    value="historical"
                    checked={initialization === "historical"}
                    onChange={() => setInitialization("historical")}
                    aria-label="Historical"
                  />
                  <span style={{ fontSize: "0.86rem" }}>Historical</span>
                </label>
              </div>
            </div>

            <details className="ahd-card" style={{ padding: "0.75rem" }}>
              <summary style={{ cursor: busy ? "not-allowed" : "pointer", fontWeight: 700 }}>Advanced world rules</summary>
              <p className="ahd-help" style={{ margin: "0.45rem 0 0.7rem" }}>
                Choose which simulation systems run in this local world. These rules are saved with the world.
              </p>
              <div className="ahd-grid ahd-grid-2">
                {WORLD_FEATURE_FLAG_DEFINITIONS.map((definition) => (
                  <label key={definition.key} className="ahd-era-card" style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.45rem", alignItems: "start" }}>
                    <input
                      type="checkbox"
                      aria-label={definition.label}
                      checked={featureFlags[definition.key]}
                      onChange={(event) => setFeatureFlags((current) => ({ ...current, [definition.key]: event.target.checked }))}
                    />
                    <span>
                      <span style={{ display: "block", fontWeight: 700, fontSize: "0.82rem" }}>{definition.label}</span>
                      <span className="ahd-muted" style={{ display: "block", fontSize: "0.7rem", lineHeight: 1.4 }}>{definition.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </details>

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
