import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { defaultStatBuild, STAT_FREE_POINTS, STAT_KEYS, STAT_MAX, STAT_MIN, statBonus, type CharacterStats } from "@ahdclient/engine";
import type { ProfileUpdate, ProfileView, StatAllocationHandler, StatAllocationMode } from "../game/profileTypes";

const LABELS = { charisma: "Charisma", debate: "Debate", energy: "Energy", fundraising: "Fundraising", businessAcumen: "Business Acumen", statecraft: "Statecraft", intellect: "Intellect" };

/** Profile allocation/reminder/reset flow from AHDGame 6ed11a3. */
export function StatAllocationControls({ allocation, busy, onSubmit, onUpdateProfile }: {
  allocation: ProfileView["statAllocation"]; busy: boolean;
  onSubmit?: StatAllocationHandler; onUpdateProfile: (update: ProfileUpdate) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<StatAllocationMode | null>(() => allocation?.needsAllocation && !allocation.dismissed ? "allocate" : null);
  const [stats, setStats] = useState<CharacterStats>(() => allocation?.suggestion ?? defaultStatBuild());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const closeRef = useRef<() => void>(() => {});
  const titleId = useId();
  const remaining = STAT_FREE_POINTS - STAT_KEYS.reduce((sum, key) => sum + stats[key] - STAT_MIN, 0);
  const disabled = busy || saving;

  useEffect(() => {
    if (!onSubmit || !allocation) { setMode(null); return; }
    if (allocation.needsAllocation && !allocation.dismissed && mode !== "allocate") {
      setStats(allocation.suggestion ?? defaultStatBuild()); setError(null); setMode("allocate");
    } else if ((mode === "allocate" && (!allocation.needsAllocation || allocation.dismissed)) ||
      (mode === "reallocate" && !allocation.canReallocate)) setMode(null);
  }, [allocation, mode, onSubmit]);

  async function defer(dismissed: boolean) {
    if (disabled) return;
    setSaving(true); setError(null);
    try {
      const ok = await onUpdateProfile({ statAllocationDismissed: dismissed });
      if (!ok) throw new Error("Your stat allocation reminder could not be saved. Please try again.");
      if (dismissed) setMode(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Your stat allocation reminder could not be saved."); }
    finally { setSaving(false); }
  }
  closeRef.current = () => {
    if (disabled) return;
    if (mode === "allocate") void defer(true); else { setMode(null); setError(null); }
  };
  useEffect(() => {
    if (!mode || !onSubmit) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    headingRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeRef.current(); return; }
      if (event.key !== "Tab") return;
      const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === headingRef.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true); document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
      else document.querySelector<HTMLElement>('[aria-label="Character stats"]')?.focus();
    };
  }, [mode, onSubmit]);

  async function submit() {
    if (!mode || !onSubmit || disabled || remaining !== 0) return;
    setSaving(true); setError(null);
    try {
      if (!await onSubmit(mode, stats)) throw new Error("Your stats could not be saved. Please try again.");
      setMode(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Your stats could not be saved."); }
    finally { setSaving(false); }
  }
  function spreadEvenly() {
    const next = { ...stats };
    let left = remaining;
    while (left > 0) {
      for (const key of STAT_KEYS) if (left > 0 && next[key] < STAT_MAX) { next[key]++; left--; }
    }
    setStats(next);
  }
  if (!allocation || !onSubmit) return null;
  return <>
    {allocation.needsAllocation && allocation.dismissed && <section className="ahd-card ahd-card-pad" aria-label="Stat allocation reminder">
      <h2 className="ahd-h2">Allocate your stats</h2>
      <p className="ahd-help">Your politician has a stat sheet waiting. Choose your 28-point spread when you are ready.</p>
      <button type="button" className="ahd-btn" disabled={disabled} onClick={() => void defer(false)}>Return to stats</button>
      {!mode && error && <p role="alert">{error}</p>}
    </section>}
    {allocation.canReallocate && <button type="button" className="ahd-btn" disabled={disabled} onClick={() => {
      setStats(defaultStatBuild()); setError(null); setMode("reallocate");
    }}>Reallocate (1 free)</button>}
    {mode && createPortal(<div className="ahd-stat-modal-backdrop">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="ahd-card ahd-card-pad ahd-stat-modal">
        <h2 ref={headingRef} id={titleId} tabIndex={-1} className="ahd-h2">{mode === "allocate" ? "Allocate Your Stats" : "Reallocate Your Stats"}</h2>
        <p className="ahd-help">{mode === "allocate"
          ? "We suggested a build from your recorded career. Rearrange it, then lock it in. This is a one-time choice."
          : "This is your one free change. It rewrites your stat sheet from scratch and resets any growth you have earned through play. This cannot be undone."}</p>
        <p className="ahd-mono" role="status">Points remaining: {remaining} of {STAT_FREE_POINTS}</p>
        <div className="ahd-stat-tools">
          <button type="button" className="ahd-btn" disabled={disabled || remaining <= 0} onClick={spreadEvenly}>Spread evenly</button>
          <button type="button" className="ahd-btn" disabled={disabled || remaining >= STAT_FREE_POINTS} onClick={() => setStats(defaultStatBuild())}>Reset</button>
        </div>
        {STAT_KEYS.map(key => <div key={key} className="ahd-stat-row">
          <div><span className="ahd-label">{LABELS[key]}</span><p className="ahd-help">{statBonus(key, stats[key]).detail}</p></div>
          <div className="ahd-stat-stepper">
            <button type="button" className="ahd-btn" aria-label={`Lower ${LABELS[key]}`} disabled={disabled || stats[key] <= STAT_MIN} onClick={() => setStats({ ...stats, [key]: stats[key] - 1 })}>-</button>
            <output className="ahd-mono" aria-label={`${LABELS[key]} value`}>{stats[key]}</output>
            <button type="button" className="ahd-btn" aria-label={`Raise ${LABELS[key]}`} disabled={disabled || stats[key] >= STAT_MAX || remaining <= 0} onClick={() => setStats({ ...stats, [key]: stats[key] + 1 })}>+</button>
          </div>
        </div>)}
        {error && <p className="ahd-alert" role="alert">{error}</p>}
        <div className="ahd-stat-tools">
          <button type="button" className="ahd-btn" disabled={disabled} onClick={() => closeRef.current()}>{mode === "allocate" ? "Maybe later" : "Cancel"}</button>
          <button type="button" className="ahd-btn ahd-btn-primary" disabled={disabled || remaining !== 0} onClick={() => void submit()}>
            {saving ? "Saving..." : mode === "allocate" ? "Lock In Stats" : "Confirm Reallocation"}
          </button>
        </div>
      </div>
    </div>, document.body)}
  </>;
}
