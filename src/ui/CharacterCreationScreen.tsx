/**
 * CharacterCreationScreen - the reference character-creation flow (#242).
 *
 * Mirrors the public AHDGame reference `src/app/create-character/page.tsx` step
 * order and labels exactly:
 *   1 Country -> 2 The politician -> 3 Home region -> 4 Where you stand ->
 *   5 Party -> 6 Stats
 * with the reference sub-components' behaviour: `ChipGroup` option sets
 * (creatorOptions.ts), the -5..+5 compass with `nearestParty`/`alignmentBand`
 * (registration/alignment.ts), `StatPointAllocator` (STAT_FREE_POINTS/STAT_MIN),
 * the one-party briefing (OnePartyStateNotice) and the imperial notice.
 *
 * Layout is mobile-first and differs from the reference (radio groups and a
 * slider instead of a drag grid), but the order, meaning and labels do not.
 * Every captured value maps to a persisted engine field through `onSubmit`;
 * none is UI-only. Source is public (Egg3901/AHDGame); no proprietary assets.
 *
 * Portrait/header identity (#348, slice of #244) mirrors the reference
 * `CandidateFile` composition: a party-accent header band with a gradient
 * fallback, an overlapping portrait with an initial-letter fallback, camera
 * pick affordances with remove controls, and one `role="alert"` error.
 * Images stay local data URLs resized to the reference presets; nothing is
 * uploaded and nothing is fetched. The imperial notice is unchanged: the
 * reference imperial page carries no portrait/header imagery.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  STAT_FREE_POINTS,
  STAT_KEYS,
  STAT_MIN,
  STAT_MAX,
  alignmentBand,
  compassDistance,
  defaultStatBuild,
  ideologyLabel,
  isOnePartyCountry,
  nearestParty,
  statBonus,
  type CharacterStats,
  type StatKey,
} from "@ahdclient/engine";
import type {
  CharacterCreationScreenProps,
  CharacterEducation,
  CharacterGender,
  CharacterRace,
  CharacterWealth,
} from "../game/types";
import { PolicyCompass, policyAxisLabel } from "./PolicyCompass";
import { PartyMark } from "./PartyMark";
import "./ui.css";
import { RouteHero } from "./RouteHero";

// ── Reference option sets (creatorOptions.ts). Byte-identical values. ─────────
const RACE_OPTIONS: { value: CharacterRace; label: string }[] = [
  { value: "white", label: "White" },
  { value: "black", label: "Black" },
  { value: "hispanic", label: "Hispanic" },
  { value: "asian", label: "Asian" },
  { value: "other", label: "Other" },
];
const GENDER_OPTIONS: { value: CharacterGender; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "nonbinary", label: "Non-binary" },
];
const EDUCATION_OPTIONS: { value: CharacterEducation; label: string }[] = [
  { value: "no_college", label: "No degree" },
  { value: "college", label: "College" },
  { value: "graduate", label: "Graduate" },
];
// Reference WEALTH_LEVELS (characterWealth.ts).
const WEALTH_OPTIONS: { value: CharacterWealth; label: string }[] = [
  { value: "low", label: "Low Income" },
  { value: "middle", label: "Middle Income" },
  { value: "high", label: "High Income" },
];

const STAT_LABELS: Record<StatKey, string> = {
  charisma: "Charisma",
  debate: "Debate",
  energy: "Energy",
  fundraising: "Fundraising",
  businessAcumen: "Business Acumen",
  statecraft: "Statecraft",
  intellect: "Intellect",
};

// Reference image caps (AHDGame useImagePick: portrait 2 MB, header 4 MB) and
// resize presets (imageOptimize.ts avatar 256, profileHeader 1400x400 @ 80).
// All images stay local data URLs; nothing is fetched from the network.
const PORTRAIT_MAX_BYTES = 2 * 1024 * 1024;
const HEADER_MAX_BYTES = 4 * 1024 * 1024;
// Reference useImagePick ALLOWED_IMAGE_TYPES, in the same order.
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const IMAGE_TYPE_MESSAGE = "Use a JPEG, PNG, WebP, or GIF image.";

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read"));
    reader.readAsDataURL(file);
  });
}

function decode(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode"));
    img.src = dataUrl;
  });
}

async function resizeLocal(file: File, maxWidth: number, maxHeight: number, quality: number, passthroughMaxBytes: number): Promise<string> {
  const dataUrl = await readDataUrl(file);
  const img = await decode(dataUrl);
  const width = img.naturalWidth || img.width || 0;
  const height = img.naturalHeight || img.height || 0;
  if (!width || !height) throw new Error("decode");
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  // Passthrough keeps an already-small PNG/JPEG/WebP untouched. GIF is never
  // passed through: the save/profile envelope only persists PNG, JPEG and
  // WebP rasters, so a GIF data URL would be rejected on save reload.
  if (scale >= 1 && file.type !== "image/gif" && file.size <= passthroughMaxBytes) return dataUrl;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  // Prefer WebP (the reference upload presets), falling back to JPEG where the
  // canvas encoder does not support it. Never PNG here: lossless PNG would
  // blow past the 2 MB envelope on a photo.
  const webp = canvas.toDataURL("image/webp", quality);
  if (webp.startsWith("data:image/webp")) return webp;
  return canvas.toDataURL("image/jpeg", quality);
}

function spentPoints(stats: CharacterStats): number {
  return STAT_KEYS.reduce((sum, key) => sum + (stats[key] - STAT_MIN), 0);
}

function StepPanel({
  step, title, subtitle, complete, hidden, children, headingRef, focusable,
}: {
  step: number; title: string; subtitle?: string; complete?: boolean; hidden?: boolean; children: React.ReactNode;
  headingRef?: (element: HTMLHeadingElement | null) => void; focusable?: boolean;
}) {
  return (
    <section hidden={hidden} aria-labelledby={`creation-step-${step}`} className="ahd-card ahd-card-pad">
      <header style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", marginBottom: "0.75rem" }}>
        <span
          aria-hidden
          className={complete ? "ahd-creation-step ahd-creation-step-done" : "ahd-creation-step"}
        >
          {step}
        </span>
        <div style={{ minWidth: 0 }}>
          <h2 id={`creation-step-${step}`} className="ahd-h2" style={{ margin: 0 }} ref={headingRef} tabIndex={focusable ? -1 : undefined}>
            {title}
            {complete ? <span className="ahd-creation-done"> Done</span> : null}
          </h2>
          {subtitle ? <p className="ahd-muted" style={{ fontSize: "0.78rem", marginTop: "0.2rem" }}>{subtitle}</p> : null}
        </div>
      </header>
      {children}
    </section>
  );
}

function ChipGroup<T extends string>({
  label, value, options, onChange, required,
}: {
  label: string; value: string; options: { value: T; label: string }[];
  onChange: (value: T) => void; required?: boolean;
}) {
  return (
    <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
      <legend className="ahd-label" style={{ marginBottom: "0.4rem" }}>
        {label}{required ? <span aria-hidden> *</span> : null}
      </legend>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={selected ? "ahd-chip ahd-chip-selected" : "ahd-chip"}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function AxisStepper({
  label, leftLabel, rightLabel, value, onChange,
}: {
  label: string; leftLabel: string; rightLabel: string; value: number; onChange: (value: number) => void;
}) {
  const axisId = label.toLowerCase();
  return (
    <div className="ahd-creation-axis">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.5rem" }}>
        <span className="ahd-label">{label}</span>
        <span className="ahd-mono" aria-live="polite" data-testid={`creation-${axisId}-value`}>
          {value > 0 ? `+${value}` : value} ({policyAxisLabel(value, axisId === "social" ? "social" : "economic")})
        </span>
      </div>
      <div className="ahd-creation-compass-row">
        <button
          type="button"
          className="ahd-btn ahd-btn-sm ahd-creation-stepper"
          aria-label={`Decrease ${label}`}
          disabled={value <= -5}
          onClick={() => onChange(Math.max(-5, value - 1))}
        >
          <span aria-hidden>-</span>
        </button>
        <input
          type="range"
          min={-5}
          max={5}
          step={1}
          value={value}
          onChange={(event) => onChange(Number.parseInt(event.target.value, 10))}
          aria-label={`${label} position`}
          style={{ flex: "1 1 auto", minWidth: 0, minHeight: 44 }}
        />
        <button
          type="button"
          className="ahd-btn ahd-btn-sm ahd-creation-stepper"
          aria-label={`Increase ${label}`}
          disabled={value >= 5}
          onClick={() => onChange(Math.min(5, value + 1))}
        >
          <span aria-hidden>+</span>
        </button>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }} className="ahd-muted">
        <span style={{ fontSize: "0.7rem" }}>{leftLabel} -5</span>
        <span style={{ fontSize: "0.7rem" }}>+5 {rightLabel}</span>
      </div>
    </div>
  );
}

// Reference CandidateFile composition: header band tinted by the party accent
// until a photo is chosen, portrait overlapping the band with an
// initial-letter fallback, camera pick affordances with remove controls.
// Previews are decorative (the name sits adjacent); the single error line
// below carries role="alert". Both images are optional; creation succeeds
// without them and the data URLs ride the submit contract for later display.
function CandidateIdentityCard({
  name,
  accent,
  portraitUrl,
  headerUrl,
  portraitInputId,
  headerInputId,
  accept,
  portraitInputRef,
  headerInputRef,
  onPickPortrait,
  onPickHeader,
  onClearPortrait,
  onClearHeader,
  error,
}: {
  name: string;
  accent: string;
  portraitUrl: string | null;
  headerUrl: string | null;
  portraitInputId: string;
  headerInputId: string;
  accept: string;
  portraitInputRef: React.RefObject<HTMLInputElement | null>;
  headerInputRef: React.RefObject<HTMLInputElement | null>;
  onPickPortrait: (file: File | undefined) => void;
  onPickHeader: (file: File | undefined) => void;
  onClearPortrait: () => void;
  onClearHeader: () => void;
  error: string | null;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      data-testid="candidate-identity"
      style={{ overflow: "hidden", border: "1px solid var(--ahd-border)", borderRadius: "0.6rem" }}
    >
      <div
        data-testid="candidate-header-band"
        style={{
          position: "relative",
          height: "5rem",
          width: "100%",
          backgroundColor: `color-mix(in srgb, ${accent} 13%, transparent)`,
        }}
      >
        {headerUrl ? (
          <img
            src={headerUrl}
            alt=""
            aria-hidden
            data-testid="candidate-header-photo"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div
            aria-hidden
            data-testid="candidate-header-fallback"
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 20%, transparent) 0%, transparent 65%)`,
            }}
          />
        )}
        <span style={{ position: "absolute", right: "0.5rem", top: "0.5rem", display: "inline-flex", gap: "0.3rem" }}>
          <label htmlFor={headerInputId} className="ahd-btn ahd-btn-sm" style={{ cursor: "pointer" }}>
            {headerUrl ? "Change header" : "Add header"}
          </label>
          <input
            id={headerInputId}
            ref={headerInputRef}
            className="ahd-sr-only"
            type="file"
            accept={accept}
            onChange={(event) => { onPickHeader(event.target.files?.[0]); event.target.value = ""; }}
          />
          {headerUrl ? (
            <button type="button" className="ahd-btn ahd-btn-sm" aria-label="Remove header image" onClick={onClearHeader}>
              <span aria-hidden>×</span>
            </button>
          ) : null}
        </span>
      </div>
      <div style={{ padding: "0 0.85rem 0.85rem" }}>
        <div style={{ marginTop: "-2.25rem", marginBottom: "0.5rem", display: "flex", alignItems: "flex-end", gap: "0.5rem" }}>
          <div
            data-testid="candidate-portrait-frame"
            style={{
              position: "relative",
              zIndex: 1,
              width: "4.5rem",
              height: "4.5rem",
              flexShrink: 0,
              overflow: "hidden",
              borderRadius: "0.6rem",
              border: `2px solid ${accent}`,
              background: "var(--ahd-card)",
            }}
          >
            {portraitUrl ? (
              <img
                src={portraitUrl}
                alt=""
                aria-hidden
                data-testid="candidate-portrait-photo"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <span
                data-testid="candidate-portrait-fallback"
                aria-hidden
                style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", fontSize: "1.6rem" }}
              >
                {initial}
              </span>
            )}
          </div>
          <span style={{ display: "inline-flex", gap: "0.3rem", marginBottom: "0.25rem" }}>
            <label htmlFor={portraitInputId} className="ahd-btn ahd-btn-sm" style={{ cursor: "pointer" }}>
              {portraitUrl ? "Change portrait" : "Add portrait"}
            </label>
            <input
              id={portraitInputId}
              ref={portraitInputRef}
              className="ahd-sr-only"
              type="file"
              accept={accept}
              onChange={(event) => { onPickPortrait(event.target.files?.[0]); event.target.value = ""; }}
            />
            {portraitUrl ? (
              <button type="button" className="ahd-btn ahd-btn-sm" aria-label="Remove portrait" onClick={onClearPortrait}>
                <span aria-hidden>×</span>
              </button>
            ) : null}
          </span>
        </div>
        {error ? <p role="alert" className="ahd-error-text" style={{ margin: "0 0 0.4rem" }}>{error}</p> : null}
        <p data-testid="candidate-name-preview" style={{ margin: 0, fontSize: "1.05rem", fontWeight: 650, lineHeight: 1.25 }}>
          {name.trim() || "Unnamed candidate"}
        </p>
        <p className="ahd-muted" style={{ margin: "0.15rem 0 0", fontSize: "0.76rem" }}>
          Portrait under 2 MB and header under 4 MB are optional and stay on this device.
        </p>
      </div>
    </div>
  );
}

export function CharacterCreationScreen({
  selection, initialName, regions, initialHomeRegionId, choices, loading, busy, error, onSubmit, onBack,
}: CharacterCreationScreenProps) {
  const [name, setName] = useState(initialName);
  const [gender, setGender] = useState<CharacterGender | "">("");
  const [race, setRace] = useState<CharacterRace | "">("");
  const [education, setEducation] = useState<CharacterEducation | "">("");
  const [wealth, setWealth] = useState<CharacterWealth | "">("");
  const [homeRegionId, setHomeRegionId] = useState(initialHomeRegionId ?? regions[0]?.id ?? "");
  const [economic, setEconomic] = useState(0);
  const [social, setSocial] = useState(0);
  const [compassTouched, setCompassTouched] = useState(false);
  const [partyId, setPartyId] = useState<string | null>(null);
  const [partyTouched, setPartyTouched] = useState(false);
  const [stats, setStats] = useState<CharacterStats>(() => defaultStatBuild());
  const [localError, setLocalError] = useState<string | null>(null);
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  const [headerUrl, setHeaderUrl] = useState<string | null>(null);
  const [portraitError, setPortraitError] = useState<string | null>(null);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState(1);
  const [maxReachedStep, setMaxReachedStep] = useState(1);
  const [reviewAll, setReviewAll] = useState(false);
  // Headings for the six canonical steps, in order. After a user-initiated
  // step change the new step's heading takes focus so keyboard and screen
  // reader users land at the start of the fresh prompt instead of on a
  // removed Continue button. Mount never steals focus.
  const headingRefs = useRef<(HTMLHeadingElement | null)[]>([]);
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (reviewAll) return;
    headingRefs.current[activeStep - 1]?.focus();
  }, [activeStep, reviewAll]);

  useEffect(() => { setHomeRegionId(initialHomeRegionId ?? regions[0]?.id ?? ""); }, [initialHomeRegionId, regions]);

  const remaining = STAT_FREE_POINTS - spentPoints(stats);
  const regionNoun = choices?.regionNoun ?? selection.regionNoun;
  const parties = choices?.parties ?? [];
  const rulingParty = choices?.rulingParty ?? null;
  const regimeLabel: Record<string, string> = { ruling: "Ruling", approved: "Approved", banned: "Banned" };

  const position = useMemo(() => ({ economic, social }), [economic, social]);
  // nearestParty compares on the compass plane; each candidate carries the party
  // row so the closest match can be named without a second lookup.
  const closest = useMemo(
    () => nearestParty(
      position,
      parties.map((party) => ({ party, economic: party.economicPosition, social: party.socialPosition })),
    ),
    [position, parties],
  );
  const selectedParty = parties.find((party) => party.id === partyId) ?? null;
  const band = closest ? alignmentBand(closest.distance) : null;
  // The closest platform only means something once the player answers the
  // compass; before that every platform distance is unmeasured, not zero.
  const bestPartyId = compassTouched && closest ? closest.party.party.id : null;
  const partyDistance = (party: { economicPosition: number; socialPosition: number }) =>
    compassTouched ? compassDistance(position, { economic: party.economicPosition, social: party.socialPosition }) : null;

  const backgroundComplete = Boolean(gender && race && education && wealth);
  const nameComplete = name.trim().length >= 2;
  const nameLength = name.trim().length;
  const backgroundAnswers = [gender, race, education, wealth];
  const backgroundCount = backgroundAnswers.filter(Boolean).length;
  const missingBackground = (["Gender", "Race", "Education", "Wealth"] as const).filter((_, index) => !backgroundAnswers[index]);
  const selectedRegionIndex = regions.findIndex((region) => region.id === homeRegionId);
  const spent = STAT_FREE_POINTS - remaining;
  const statsComplete = remaining === 0;
  const canSubmit = nameComplete && backgroundComplete && Boolean(homeRegionId) && compassTouched && partyTouched && statsComplete;
  const stepComplete = [true, nameComplete && backgroundComplete, Boolean(homeRegionId), compassTouched, partyTouched, statsComplete];
  // Phone-first guidance: one plain line per step naming exactly what still
  // blocks Continue, using the same completeness rules as the buttons.
  const stepHint = reviewAll
    ? "Reviewing all six sections. Every answer stays editable."
    : activeStep === 1
      ? "Country and era are set in world setup. Continue when ready."
      : activeStep === 2
        ? (!nameComplete
          ? "Enter a name of at least two characters."
          : missingBackground.length > 0
            ? `Still to choose: ${missingBackground.join(", ")}.`
            : "Politician details complete.")
        : activeStep === 3
          ? (regions.length === 0
            ? "No regions are available for this country."
            : homeRegionId
              ? `Home ${regionNoun} set.`
              : `Choose a home ${regionNoun}.`)
          : activeStep === 4
            ? (compassTouched
              ? `Position set: ${ideologyLabel(position)}.`
              : "Move either slider, or use its - and + buttons, to set your position.")
            : activeStep === 5
              ? (partyTouched ? "Party choice recorded." : "Pick a party, or choose Independent on purpose.")
              : (statsComplete ? "All points allocated." : `${remaining} of ${STAT_FREE_POINTS} points remaining.`);
  const stepLabels = ["Country", "The politician", `Home ${regionNoun}`, "Where you stand", "Party", "Stats"];
  const stepSummaries = [
    `${selection.countryName} (${selection.era})`,
    name.trim() || "Not answered",
    regions.find((region) => region.id === homeRegionId)?.name ?? "Not answered",
    compassTouched ? ideologyLabel(position) : "Not answered",
    partyTouched ? (selectedParty?.name ?? "Independent") : "Not answered",
    statsComplete ? "All points allocated" : `${remaining} points remaining`,
  ];

  const selectParty = (id: string | null) => {
    setPartyTouched(true);
    setPartyId(id);
    // Choosing a party records the affiliation only. The compass (step 4) stays
    // the player's own independent answer; the reference does not snap the pin
    // to a platform on party selection, and the party step follows the compass.
  };

  const adjustStat = (key: StatKey, delta: number) => {
    setStats((current) => {
      const next = current[key] + delta;
      if (next < STAT_MIN || next > STAT_MAX) return current;
      if (delta > 0 && remaining <= 0) return current;
      return { ...current, [key]: next };
    });
  };

  const spreadEvenly = () => {
    setStats((current) => {
      const next = { ...current };
      let left = STAT_FREE_POINTS - spentPoints(current);
      while (left > 0) {
        const raisable = STAT_KEYS.filter((key) => next[key] < STAT_MAX);
        if (raisable.length === 0) break;
        for (const key of raisable) {
          if (left <= 0) break;
          next[key] += 1;
          left -= 1;
        }
      }
      return next;
    });
  };

  const resetStats = () => setStats(defaultStatBuild());

  const portraitInputRef = useRef<HTMLInputElement | null>(null);
  const headerInputRef = useRef<HTMLInputElement | null>(null);

  const pickPortrait = async (file: File | undefined) => {
    if (!file) return;
    setPortraitError(null);
    if (!IMAGE_TYPES.includes(file.type)) return setPortraitError(IMAGE_TYPE_MESSAGE);
    if (file.size > PORTRAIT_MAX_BYTES) return setPortraitError("Portrait must be under 2 MB.");
    try { setPortraitUrl(await resizeLocal(file, 256, 256, 0.85, PORTRAIT_MAX_BYTES)); }
    catch { setPortraitError("That file could not be read as an image."); }
  };

  const pickHeader = async (file: File | undefined) => {
    if (!file) return;
    setHeaderError(null);
    if (!IMAGE_TYPES.includes(file.type)) return setHeaderError(IMAGE_TYPE_MESSAGE);
    if (file.size > HEADER_MAX_BYTES) return setHeaderError("Header must be under 4 MB.");
    try { setHeaderUrl(await resizeLocal(file, 1400, 400, 0.80, HEADER_MAX_BYTES)); }
    catch { setHeaderError("That file could not be read as an image."); }
  };

  const clearPortrait = () => {
    setPortraitUrl(null);
    setPortraitError(null);
    if (portraitInputRef.current) portraitInputRef.current.value = "";
  };

  const clearHeader = () => {
    setHeaderUrl(null);
    setHeaderError(null);
    if (headerInputRef.current) headerInputRef.current.value = "";
  };

  const handleSubmit = () => {
    setLocalError(null);
    if (!nameComplete) return setLocalError("Enter a character name of at least two characters.");
    if (!backgroundComplete) return setLocalError("Choose all background options for your character.");
    if (!homeRegionId) return setLocalError(`Choose a home ${regionNoun}.`);
    if (!compassTouched) return setLocalError("Set your position on the compass.");
    if (!partyTouched) return setLocalError("Pick a party, or choose Independent on purpose.");
    if (!statsComplete) return setLocalError(`Allocate all ${remaining} remaining stat point${remaining === 1 ? "" : "s"}.`);
    onSubmit({
      name: name.trim(),
      homeRegionId,
      partyId,
      policies: { economic, social },
      demographics: {
        race: race as CharacterRace,
        gender: gender as CharacterGender,
        education: education as CharacterEducation,
        wealth: wealth as CharacterWealth,
      },
      stats: { ...stats },
      avatarUrl: portraitUrl,
      profileHeaderUrl: headerUrl,
    });
  };

  return (
    <div className="ahd-screen">
      <div className="ahd-container" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))", paddingBottom: "2rem", maxWidth: "42rem" }}>
        <RouteHero image="/static/heroes/politicians.webp" alt="Politicians meeting in a national chamber" eyebrow="New candidate" title="Create your politician" className="ahd-creation-hero">
          <p className="ahd-muted" style={{ fontSize: "0.84rem", marginTop: "0.3rem", lineHeight: 1.5 }}>
            {selection.countryName}. Your choices are persisted and weighed by later primaries and
            elections. Distance from a party platform is what those races actually measure.
          </p>
        </RouteHero>

        {loading ? <div className="ahd-card ahd-card-pad"><p className="ahd-muted">Loading country options...</p></div> : null}

        <nav aria-label="Creation progress" className="ahd-creation-progress-nav">
          <ol className="ahd-creation-progress">
            {stepLabels.map((label, index) => {
              const step = index + 1;
              const reached = step <= maxReachedStep;
              const isActive = !reviewAll && step === activeStep;
              const done = stepComplete[step - 1];
              return (
                <li key={step}>
                  <button
                    type="button"
                    disabled={!reached}
                    aria-current={isActive ? "step" : undefined}
                    aria-label={
                      isActive
                        ? `Current step, step ${step} of 6: ${label}`
                        : reached
                          ? `Go to step ${step} of 6: ${label}${done ? ", done" : ""}`
                          : `Step ${step} of 6: ${label}, not reached yet`
                    }
                    onClick={() => { setReviewAll(false); setActiveStep(step); }}
                    className={
                      isActive
                        ? "ahd-creation-progress-dot ahd-creation-progress-current"
                        : done
                          ? "ahd-creation-progress-dot ahd-creation-progress-done"
                          : "ahd-creation-progress-dot"
                    }
                  >
                    <span aria-hidden>{step}</span>
                    <span aria-hidden>{label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
        <p role="status" className="ahd-creation-live">
          {reviewAll ? "Reviewing all six sections" : `Step ${activeStep} of 6: ${stepLabels[activeStep - 1]}`}
        </p>

        <section className="ahd-creation-conversation" aria-label="Creation conversation">
          <p className="ahd-label">Your candidate file</p>
          {stepLabels.map((label, index) => ({ label, step: index + 1 })).filter(({ step }) => step <= maxReachedStep && step !== activeStep).map(({ label, step }) => (
            <button
              key={step}
              type="button"
              className="ahd-creation-answer"
              aria-label={`Edit ${label}: ${stepSummaries[step - 1]}`}
              onClick={() => { setReviewAll(false); setActiveStep(step); }}
            >
              <span>{label}</span>
              <strong>{stepSummaries[step - 1]}</strong>
            </button>
          ))}
          <button type="button" className="ahd-btn ahd-btn-ghost ahd-btn-sm" aria-expanded={reviewAll} onClick={() => setReviewAll((value) => !value)}>
            {reviewAll ? "Return to conversation" : "Review all details"}
          </button>
        </section>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
          <StepPanel hidden={!reviewAll && activeStep !== 1} step={1} title="Country" subtitle="Sets your offices, parties, currency and electoral rules." complete headingRef={(element) => { headingRefs.current[0] = element; }} focusable={!reviewAll && activeStep === 1}>
            <dl className="ahd-creation-country-card" data-testid="creation-country-card" style={{ margin: 0 }}>
              <div>
                <dt>Country</dt>
                <dd>{selection.countryName}</dd>
              </div>
              <div>
                <dt>Era</dt>
                <dd>{selection.era}</dd>
              </div>
              <div>
                <dt>Home options</dt>
                <dd>{regions.length} {regionNoun}{regions.length === 1 ? "" : "s"}</dd>
              </div>
              <div>
                <dt>Parties</dt>
                <dd>{parties.length}</dd>
              </div>
            </dl>
            <p className="ahd-help" style={{ margin: "0.6rem 0 0" }}>
              Change country or era from world setup.
            </p>
          </StepPanel>

          <StepPanel
            hidden={!reviewAll && activeStep !== 2}
            step={2}
            title="The politician"
            subtitle="Voter groups weigh these when they decide whether you are one of them."
            complete={nameComplete && backgroundComplete}
            headingRef={(element) => { headingRefs.current[1] = element; }}
            focusable={!reviewAll && activeStep === 2}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              <div>
                <label className="ahd-label" htmlFor="creation-name">Name *</label>
                <input
                  id="creation-name"
                  className="ahd-input ahd-creation-name"
                  type="text"
                  value={name}
                  maxLength={80}
                  placeholder="e.g. Eleanor Vance"
                  aria-describedby="creation-name-hint"
                  onChange={(event) => setName(event.target.value)}
                />
                <p id="creation-name-hint" className="ahd-help" style={{ margin: "0.3rem 0 0" }}>
                  {nameLength} of 80 characters. At least two to continue.
                </p>
              </div>
              <p className="ahd-help" data-testid="background-progress" style={{ margin: 0 }} aria-live="polite">
                Background: {backgroundCount} of 4 chosen{missingBackground.length > 0 ? ` (still to choose: ${missingBackground.join(", ")})` : ""}.
              </p>
              <div className="ahd-grid ahd-grid-2 ahd-creation-background">
                <ChipGroup label="Gender" required value={gender} options={GENDER_OPTIONS} onChange={setGender} />
                <ChipGroup label="Race" required value={race} options={RACE_OPTIONS} onChange={setRace} />
                <ChipGroup label="Education" required value={education} options={EDUCATION_OPTIONS} onChange={setEducation} />
                <ChipGroup label="Wealth" required value={wealth} options={WEALTH_OPTIONS} onChange={setWealth} />
              </div>
              <CandidateIdentityCard
                name={name}
                accent={selectedParty?.color ?? "var(--ahd-muted)"}
                portraitUrl={portraitUrl}
                headerUrl={headerUrl}
                portraitInputId="creation-portrait"
                headerInputId="creation-header"
                accept={IMAGE_TYPES.join(",")}
                portraitInputRef={portraitInputRef}
                headerInputRef={headerInputRef}
                onPickPortrait={(file) => void pickPortrait(file)}
                onPickHeader={(file) => void pickHeader(file)}
                onClearPortrait={clearPortrait}
                onClearHeader={clearHeader}
                error={portraitError ?? headerError}
              />
            </div>
          </StepPanel>

          <StepPanel
            hidden={!reviewAll && activeStep !== 3}
            step={3}
            title={`Home ${regionNoun}`}
            subtitle="Your first constituency. Its electorate decides your early races."
            complete={Boolean(homeRegionId)}
            headingRef={(element) => { headingRefs.current[2] = element; }}
            focusable={!reviewAll && activeStep === 3}
          >
            <label className="ahd-label" htmlFor="creation-region">Home {regionNoun}</label>
            <select
              id="creation-region"
              className="ahd-select ahd-creation-region"
              value={homeRegionId}
              onChange={(event) => setHomeRegionId(event.target.value)}
            >
              {regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
              {regions.length === 0 ? <option value="">No regions</option> : null}
            </select>
            <p className="ahd-help" data-testid="creation-region-summary" style={{ margin: "0.4rem 0 0" }}>
              {regions.length === 0
                ? `No home ${regionNoun} options for ${selection.countryName}.`
                : `${regions.find((region) => region.id === homeRegionId)?.name ?? "Choose an option"}: ${selectedRegionIndex >= 0 ? selectedRegionIndex + 1 : 0} of ${regions.length} home ${regionNoun}${regions.length === 1 ? "" : "s"}.`}
            </p>
          </StepPanel>

          <StepPanel
            hidden={!reviewAll && activeStep !== 4}
            step={4}
            title="Where you stand"
            subtitle="Drag your pin. Distance to a platform is what primaries and general elections measure."
            complete={compassTouched}
            headingRef={(element) => { headingRefs.current[3] = element; }}
            focusable={!reviewAll && activeStep === 4}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              <PolicyCompass
                economic={economic}
                social={social}
                dotColor={selectedParty?.color}
                markers={parties.map((party) => ({
                  economic: party.economicPosition,
                  social: party.socialPosition,
                  glyph: party.abbreviation.slice(0, 1),
                  name: party.name,
                  color: party.color,
                }))}
              />
              <AxisStepper label="Economic" leftLabel="Left" rightLabel="Right" value={economic} onChange={(value) => { setCompassTouched(true); setEconomic(value); }} />
              <AxisStepper label="Social" leftLabel="Liberal" rightLabel="Traditional" value={social} onChange={(value) => { setCompassTouched(true); setSocial(value); }} />
              <p className="ahd-help" style={{ margin: 0 }}>
                Position: {ideologyLabel(position)}. Closest platform: {closest ? `${closest.party.party.name} (${band})` : "none"}.
              </p>
            </div>
          </StepPanel>

          <StepPanel
            hidden={!reviewAll && activeStep !== 5}
            step={5}
            title="Party"
            subtitle="A party gives you ballot access, a primary, and a machine. Independent is a real choice, not a default, so pick one deliberately."
            complete={partyTouched}
            headingRef={(element) => { headingRefs.current[4] = element; }}
            focusable={!reviewAll && activeStep === 5}
          >
            {choices?.isOnePartyState || isOnePartyCountry(selection.countryId) ? (
              <div className="ahd-alert" role="note">
                <p style={{ fontWeight: 700 }}>{selection.countryName} is a one-party state.</p>
                <p style={{ marginTop: "0.35rem" }}>
                  Join {rulingParty ? `${rulingParty.name} (${rulingParty.abbreviation})` : "the ruling party"}. Outside it the electoral maths does
                  not work: independents take no seats and cannot be fielded. Reform belongs to the
                  ruling party's leadership, so take the party, then take it somewhere.
                </p>
              </div>
            ) : null}
            <div className="ahd-creation-party-list" style={{ marginTop: "0.5rem" }}>
              {parties.map((party) => {
                const selected = partyId === party.id;
                const distance = partyDistance(party);
                const best = party.id === bestPartyId;
                return (
                  <button
                    key={party.id}
                    type="button"
                    aria-pressed={selected}
                    aria-label={`${party.abbreviation} ${party.name}`}
                    onClick={() => selectParty(party.id)}
                    className={selected ? "ahd-chip ahd-chip-selected ahd-creation-party-card" : "ahd-chip ahd-creation-party-card"}
                  >
                    <PartyMark
                      name={party.name}
                      abbreviation={party.abbreviation}
                      color={party.color}
                      id={party.id}
                      countryId={selection.countryId}
                      logoUrl={party.logoUrl}
                      size={20}
                    />
                    <span className="ahd-creation-party-meta">
                      <span className="ahd-creation-party-name">{party.name}</span>
                      <span className="ahd-muted ahd-creation-party-dist">
                        {party.abbreviation}
                        {party.regimeStatus ? ` · ${regimeLabel[party.regimeStatus]}` : ""}
                        {distance !== null ? ` · ${distance.toFixed(1)} away` : ""}
                      </span>
                    </span>
                    {best ? <span className="ahd-creation-best">Best match</span> : null}
                  </button>
                );
              })}
              <button
                type="button"
                aria-pressed={partyId === null}
                aria-label="Independent"
                onClick={() => selectParty(null)}
                className={partyId === null ? "ahd-chip ahd-chip-selected ahd-creation-party-card" : "ahd-chip ahd-creation-party-card"}
              >
                <span className="ahd-creation-party-meta">
                  <span className="ahd-creation-party-name">Independent</span>
                  <span className="ahd-muted ahd-creation-party-dist">No platform to measure against</span>
                </span>
              </button>
            </div>
          </StepPanel>

          <StepPanel
            hidden={!reviewAll && activeStep !== 6}
            step={6}
            title="Stats"
            subtitle={`Every stat starts at ${STAT_MIN}. Spend ${STAT_FREE_POINTS} points on top of that. These shift as you play.`}
            complete={statsComplete}
            headingRef={(element) => { headingRefs.current[5] = element; }}
            focusable={!reviewAll && activeStep === 6}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <span className="ahd-label">Points remaining</span>
              <span className="ahd-mono" aria-live="polite">{remaining} of {STAT_FREE_POINTS}</span>
            </div>
            <div
              className="ahd-creation-stat-meter"
              role="progressbar"
              aria-label="Stat points spent"
              aria-valuemin={0}
              aria-valuemax={STAT_FREE_POINTS}
              aria-valuenow={spent}
            >
              <span style={{ width: `${STAT_FREE_POINTS === 0 ? 0 : (spent / STAT_FREE_POINTS) * 100}%` }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {STAT_KEYS.map((key) => {
                const bonus = statBonus(key, stats[key]);
                return (
                  <div key={key} className="ahd-creation-stat-row">
                    <span className="ahd-creation-stat-name">{STAT_LABELS[key]}</span>
                    <span className="ahd-muted ahd-mono" style={{ fontSize: "0.7rem" }}>{bonus.label}</span>
                    <button type="button" className="ahd-btn ahd-btn-sm" aria-label={`Decrease ${STAT_LABELS[key]}`} disabled={stats[key] <= STAT_MIN} onClick={() => adjustStat(key, -1)}>-</button>
                    <span className="ahd-mono" style={{ width: "1.6rem", textAlign: "center" }}>{stats[key]}</span>
                    <button type="button" className="ahd-btn ahd-btn-sm" aria-label={`Increase ${STAT_LABELS[key]}`} disabled={stats[key] >= STAT_MAX || remaining <= 0} onClick={() => adjustStat(key, 1)}>+</button>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem" }}>
              <button type="button" className="ahd-btn ahd-btn-sm" onClick={spreadEvenly} disabled={remaining <= 0}>Spread evenly</button>
              <button type="button" className="ahd-btn ahd-btn-sm" onClick={resetStats} disabled={remaining >= STAT_FREE_POINTS}>Reset</button>
            </div>
          </StepPanel>
        </div>

        {choices?.imperialEligible ? (
          <p className="ahd-help" style={{ marginTop: "0.6rem" }}>
            {selection.countryName} has a ceremonial imperial role. This career character is a
            politician; the imperial character is created separately by an administrator.
          </p>
        ) : null}

        {localError ? <div className="ahd-alert" role="alert" style={{ marginTop: "0.75rem" }}>{localError}</div> : null}
        {error ? <div className="ahd-alert" role="alert" style={{ marginTop: "0.75rem" }}>{error}</div> : null}

        <div className="ahd-creation-actions">
          <p className="ahd-creation-hint" data-testid="creation-step-hint" id="creation-step-hint" style={{ flex: "1 1 100%", margin: 0 }}>
            {stepHint}
          </p>
          {reviewAll || activeStep === 6 ? (
            <button type="button" className="ahd-btn ahd-btn-primary" onClick={handleSubmit} disabled={busy} aria-busy={busy} aria-describedby="creation-step-hint">
              {busy ? <span className="ahd-spinner" aria-hidden /> : null}
              {busy ? "Creating" : "Create character"}
            </button>
          ) : (
            <button
              type="button"
              className="ahd-btn ahd-btn-primary"
              disabled={!stepComplete[activeStep - 1] || busy}
              aria-describedby="creation-step-hint"
              onClick={() => {
                const next = Math.min(6, activeStep + 1);
                setActiveStep(next);
                setMaxReachedStep((reached) => Math.max(reached, next));
              }}
            >
              Continue to {stepLabels[activeStep]}
            </button>
          )}
          <button
            type="button"
            className="ahd-btn ahd-btn-ghost"
            onClick={() => activeStep > 1 && !reviewAll ? setActiveStep((step) => step - 1) : onBack()}
            disabled={busy}
          >Back</button>
          {(reviewAll || activeStep === 6) && !canSubmit ? <span className="ahd-muted" style={{ fontSize: "0.76rem" }}>Complete every step to create your politician.</span> : null}
        </div>
      </div>
    </div>
  );
}

export default CharacterCreationScreen;
