/**
 * ProfilePanel: own character profile.
 *
 * Layout hierarchy adapted from the public AHDGame reference:
 *   src/app/profile/components/ProfileHeader.tsx (portrait with initials
 *   fallback, name, party chip, home region and country links, office label,
 *   inline biography),
 *   src/app/profile/components/PoliticalStanding.tsx (actions with cap and
 *   per turn rate plus Campaign Office link, state influence, national
 *   influence, favorability, infamy, conditional party influence),
 *   src/app/profile/components/FinancialStrip.tsx (donor network level, cash,
 *   campaign funds, savings, income details, portfolio link).
 * No server or Next.js imports; data arrives through the ProfileView DTO and
 * section navigation and profile persistence cross the session boundary. Metrics the local
 * engine does not simulate yet arrive as null and render as unavailable, never
 * as invented zeros. No GDP figure is shown; national statistics stay under
 * the national destinations.
 */
import { useRef, useState } from "react";
import type { ProfileUpdate, ProfileView } from "../game/profileTypes";
import type { DrawerRouteId } from "./MobileNavigation";
import { campaignSongId } from "../game/profileValidation";
import { CampaignSongPlayer } from "./CampaignSongPlayer";
import "./profile.css";

export interface ProfilePanelProps {
  profile: ProfileView;
  busy: boolean;
  onNavigate: (route: DrawerRouteId, id?: string) => void;
  onUpdateProfile: (update: ProfileUpdate) => Promise<boolean>;
  viewerDisablesAutoplay?: boolean;
}

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_EDGE = 256;
const BIO_MAX = 500;

function initials(name: string): string {
  const first = name.trim().charAt(0);
  return first ? first.toUpperCase() : "?";
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toLocaleString()} ${currency}`;
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read"));
    reader.readAsDataURL(file);
  });
}

function decodeImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode"));
    img.src = dataUrl;
  });
}

async function toAvatarDataUrl(file: File, dataUrl: string): Promise<string> {
  const img = await decodeImage(dataUrl);
  const width = img.naturalWidth || img.width || 0;
  const height = img.naturalHeight || img.height || 0;
  if (!width || !height) return dataUrl;
  const scale = Math.min(1, AVATAR_EDGE / Math.max(width, height));
  if (scale >= 1) return dataUrl;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL(file.type === "image/png" ? "image/png" : "image/jpeg", 0.85);
  } catch {
    return dataUrl;
  }
}

function validatePicture(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return "Only JPEG, PNG or WebP pictures are allowed.";
  if (file.size > MAX_BYTES) return "Picture must be under 2 MB.";
  return null;
}

export function ProfilePanel({ profile, busy, onNavigate, onUpdateProfile, viewerDisablesAutoplay = false }: ProfilePanelProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [bioEditing, setBioEditing] = useState(false);
  const [bioDraft, setBioDraft] = useState(profile.bio);
  const [bioError, setBioError] = useState<string | null>(null);
  const [bioSaving, setBioSaving] = useState(false);
  const [songDraft, setSongDraft] = useState(profile.campaignSongUrl);
  const [songAutoplay, setSongAutoplay] = useState(profile.campaignSongAutoplay);
  const [songError, setSongError] = useState<string | null>(null);
  const [songSaving, setSongSaving] = useState(false);

  const photoBusy = busy || photoSaving;
  const formBusy = busy || bioSaving;
  const standing = profile.standing;
  const finances = profile.finances;

  const saveSong = async () => {
    if (busy || songSaving) return;
    if (campaignSongId(songDraft) === null) {
      setSongError("Enter a valid YouTube URL or 11-character video ID.");
      return;
    }
    setSongError(null); setSongSaving(true);
    try {
      if (!await onUpdateProfile({ campaignSongUrl: songDraft, campaignSongAutoplay: songAutoplay })) {
        setSongError("Campaign song could not be saved. Your entry is kept.");
      }
    } catch { setSongError("Campaign song could not be saved. Your entry is kept."); }
    finally { setSongSaving(false); }
  };

  const clearSong = async () => {
    if (busy || songSaving) return;
    setSongError(null); setSongSaving(true);
    try {
      if (await onUpdateProfile({ campaignSongUrl: "", campaignSongAutoplay: false })) {
        setSongDraft(""); setSongAutoplay(false);
      } else setSongError("Campaign song could not be cleared.");
    } catch { setSongError("Campaign song could not be cleared."); }
    finally { setSongSaving(false); }
  };

  const startBioEdit = () => {
    setBioDraft(profile.bio);
    setBioError(null);
    setBioEditing(true);
  };

  const saveBio = async () => {
    if (formBusy) return;
    if (bioDraft.length > BIO_MAX) {
      setBioError(`Biography must be ${BIO_MAX} characters or fewer.`);
      return;
    }
    setBioError(null);
    setBioSaving(true);
    try {
      const ok = await onUpdateProfile({ bio: bioDraft });
      if (ok) {
        setBioEditing(false);
      } else {
        setBioError("Could not save. Your draft is kept.");
      }
    } catch {
      setBioError("Could not save. Your draft is kept.");
    } finally {
      setBioSaving(false);
    }
  };

  const savePictureFile = async (file: File) => {
    if (photoBusy) return;
    const invalid = validatePicture(file);
    if (invalid) {
      setPhotoError(invalid);
      return;
    }
    setPhotoError(null);
    setPhotoSaving(true);
    try {
      const dataUrl = await readAsDataUrl(file);
      const avatarUrl = await toAvatarDataUrl(file, dataUrl);
      const ok = await onUpdateProfile({ avatarUrl });
      if (!ok) setPhotoError("Picture could not be saved.");
    } catch {
      setPhotoError("That file could not be read as a picture.");
    } finally {
      setPhotoSaving(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removePicture = async () => {
    if (photoBusy) return;
    setPhotoError(null);
    setPhotoSaving(true);
    try {
      const ok = await onUpdateProfile({ avatarUrl: null });
      if (!ok) setPhotoError("Picture could not be removed.");
    } catch {
      setPhotoError("Picture could not be removed.");
    } finally {
      setPhotoSaving(false);
    }
  };

  return (
    <div className="ahd-stack ahd-profile">
      <section aria-label="Character" className="ahd-card ahd-card-pad ahd-profile-header">
        <div className="ahd-profile-idrow">
          <div className="ahd-profile-photo">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={`${profile.name} profile picture`}
                className="ahd-profile-photoimg"
              />
            ) : (
              <span aria-hidden="true" className="ahd-profile-initials">
                {initials(profile.name)}
              </span>
            )}
          </div>
          <div className="ahd-profile-idtext">
            <h1 className="ahd-h1 ahd-profile-name">{profile.name}</h1>
            <div className="ahd-profile-chips">
              {profile.party ? (
                <button
                  type="button"
                  className="ahd-profile-chip"
                  style={{ borderColor: profile.party.color, color: profile.party.color }}
                  onClick={() => onNavigate("partyDetails", profile.party?.id)}
                  disabled={busy}
                >
                  {profile.party.name}
                </button>
              ) : (
                <span className="ahd-profile-chip ahd-profile-chip-static">Independent</span>
              )}
              {profile.office && profile.officeDestination ? (
                <button
                  type="button"
                  className="ahd-profile-chip"
                  onClick={() => onNavigate(profile.officeDestination!.route, profile.officeDestination!.id)}
                  disabled={busy}
                >
                  {profile.office}
                </button>
              ) : (
                <span className="ahd-profile-chip ahd-profile-chip-static">
                  {profile.office ?? "No office"}
                </span>
              )}
            </div>

          </div>
        </div>
            <div className="ahd-profile-places">
              {profile.homeRegion ? (
                <button
                  type="button"
                  className="ahd-profile-link"
                  onClick={() => onNavigate("state", profile.homeRegion?.id)}
                  disabled={busy}
                >
                  {profile.homeRegion.name}
                </button>
              ) : (
                <span className="ahd-muted">Home region not recorded</span>
              )}
              <span aria-hidden="true" className="ahd-muted"> · </span>
              <button
                type="button"
                className="ahd-profile-link"
                onClick={() => onNavigate("nations", profile.country.id)}
                disabled={busy}
              >
                {profile.country.name}
              </button>
            </div>
        <div className="ahd-profile-photoactions">
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            className="ahd-profile-file"
            aria-label="Choose profile picture"
            aria-describedby="ahd-profile-photo-hint"
            disabled={photoBusy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void savePictureFile(file);
            }}
          />
          <button
            type="button"
            className="ahd-btn ahd-btn-sm"
            onClick={() => fileRef.current?.click()}
            disabled={photoBusy}
          >
            {profile.avatarUrl ? "Change picture" : "Upload picture"}
          </button>
          {profile.avatarUrl ? (
            <button
              type="button"
              className="ahd-btn ahd-btn-ghost ahd-btn-sm"
              onClick={() => void removePicture()}
              disabled={photoBusy}
            >
              Remove picture
            </button>
          ) : null}
        </div>
        <p id="ahd-profile-photo-hint" className="ahd-help">
          JPEG, PNG or WebP, under 2 MB.
        </p>
        {photoError ? (
          <p className="ahd-alert" role="alert">
            {photoError}
          </p>
        ) : null}
      </section>

      <section aria-label="Campaign song" className="ahd-card ahd-card-pad">
        <h2 className="ahd-h2">Campaign song</h2>
        {profile.campaignSongUrl ? (
          <CampaignSongPlayer videoId={profile.campaignSongUrl} ownerAutoplay={profile.campaignSongAutoplay}
            viewerDisablesAutoplay={viewerDisablesAutoplay} characterName={profile.name} />
        ) : <p className="ahd-muted">No campaign song configured. Offline play never requires one.</p>}
        <div className="ahd-profile-editor" style={{ marginTop: "0.75rem" }}>
          <label className="ahd-field" htmlFor="ahd-profile-song">
            <span className="ahd-label">YouTube URL or video ID</span>
            <input id="ahd-profile-song" className="ahd-input" value={songDraft} maxLength={300}
              disabled={busy || songSaving} onChange={(event) => setSongDraft(event.target.value)} />
          </label>
          <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input type="checkbox" checked={songAutoplay} disabled={busy || songSaving}
              onChange={(event) => setSongAutoplay(event.target.checked)} />
            <span>Play automatically on my profile</span>
          </label>
          <p className="ahd-help">Optional network media. The saved game stores only the YouTube video ID and autoplay choice.</p>
          {songError ? <p className="ahd-alert" role="alert">{songError}</p> : null}
          <div className="ahd-profile-actions">
            <button type="button" className="ahd-btn ahd-btn-primary ahd-btn-sm" disabled={busy || songSaving}
              onClick={() => void saveSong()}>Save campaign song</button>
            <button type="button" className="ahd-btn ahd-btn-ghost ahd-btn-sm" disabled={busy || songSaving || !profile.campaignSongUrl}
              onClick={() => void clearSong()}>Clear campaign song</button>
          </div>
        </div>
      </section>

      <section aria-label="Biography" className="ahd-card ahd-card-pad">
        <h2 className="ahd-h2">Biography</h2>
        {bioEditing ? (
          <div className="ahd-profile-editor">
            <label className="ahd-field" htmlFor="ahd-profile-bio">
              <span className="ahd-label">Biography</span>
              <textarea
                id="ahd-profile-bio"
                className="ahd-input ahd-profile-biobox"
                value={bioDraft}
                maxLength={BIO_MAX}
                rows={4}
                disabled={formBusy}
                onChange={(event) => setBioDraft(event.target.value)}
              />
            </label>
            <p className="ahd-help" aria-live="polite">
              {bioDraft.length} of {BIO_MAX} characters.
            </p>
            {bioError ? (
              <p className="ahd-alert" role="alert">
                {bioError}
              </p>
            ) : null}
            <div className="ahd-profile-actions">
              <button
                type="button"
                className="ahd-btn ahd-btn-primary ahd-btn-sm"
                onClick={() => void saveBio()}
                disabled={formBusy}
              >
                Save biography
              </button>
              <button
                type="button"
                className="ahd-btn ahd-btn-ghost ahd-btn-sm"
                onClick={() => {
                  setBioEditing(false);
                  setBioError(null);
                }}
                disabled={formBusy}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="ahd-profile-editor">
            {profile.bio.trim() ? (
              <p className="ahd-profile-bio">{profile.bio}</p>
            ) : (
              <p className="ahd-muted">No biography yet.</p>
            )}
            <div className="ahd-profile-actions">
              <button
                type="button"
                className="ahd-btn ahd-btn-sm"
                onClick={startBioEdit}
                disabled={busy}
              >
                Edit biography
              </button>
            </div>
          </div>
        )}
      </section>

      <section aria-label="Political standing" className="ahd-card ahd-card-pad">
        <h2 className="ahd-h2">Political standing</h2>
        <dl className="ahd-profile-rows">
          <div className="ahd-profile-row">
            <dt>Actions</dt>
            <dd className="ahd-mono">
              {standing.actions} / {standing.actionCap}
              <span className="ahd-profile-sub">{standing.actionGain} per turn</span>
              <span className="ahd-profile-sub">
                <button
                  type="button"
                  className="ahd-profile-link"
                  onClick={() => onNavigate("actions")}
                  disabled={busy}
                >
                  Campaign Office
                </button>
              </span>
            </dd>
          </div>
          <div className="ahd-profile-row">
            <dt>State influence</dt>
            <dd className="ahd-mono">{standing.politicalInfluence.toFixed(1)}%</dd>
          </div>
          <div className="ahd-profile-row">
            <dt>National influence</dt>
            <dd className="ahd-mono">
              {standing.nationalInfluence == null
                ? "Not available yet"
                : standing.nationalInfluence.toFixed(1)}
            </dd>
          </div>
          <div className="ahd-profile-row">
            <dt>Favorability</dt>
            <dd className="ahd-mono">{standing.favorability.toFixed(1)}%</dd>
          </div>
          <div className="ahd-profile-row">
            <dt>Infamy</dt>
            <dd className="ahd-mono">{standing.infamy.toFixed(1)}%</dd>
          </div>
          {profile.party ? (
            <div className="ahd-profile-row">
              <dt>Party influence</dt>
              <dd className="ahd-mono">
                {standing.partyInfluence == null
                  ? "Not available yet"
                  : standing.partyInfluence.toFixed(1)}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      {profile.stats ? (
        <section aria-label="Character stats" className="ahd-card ahd-card-pad">
          <h2 className="ahd-h2">Character stats</h2>
          <dl className="ahd-profile-rows">
            {profile.stats.energy != null ? <div className="ahd-profile-row"><dt>Energy</dt><dd className="ahd-mono">{profile.stats.energy}</dd></div> : null}
            {profile.stats.debate != null ? <div className="ahd-profile-row"><dt>Debate</dt><dd className="ahd-mono">{profile.stats.debate}</dd></div> : null}
          </dl>
        </section>
      ) : null}

      {profile.policies ? (
        <section aria-label="Policy" className="ahd-card ahd-card-pad">
          <h2 className="ahd-h2">Policy</h2>
          <dl className="ahd-profile-rows">
            <div className="ahd-profile-row"><dt>Economic</dt><dd className="ahd-mono">{profile.policies.economic.toFixed(1)}</dd></div>
            <div className="ahd-profile-row"><dt>Social</dt><dd className="ahd-mono">{profile.policies.social.toFixed(1)}</dd></div>
          </dl>
          <div className="ahd-profile-actions">
            <button type="button" className="ahd-btn ahd-btn-sm" onClick={() => onNavigate("policy")} disabled={busy}>
              View national policy
            </button>
          </div>
        </section>
      ) : null}

      <section aria-label="Finances" className="ahd-card ahd-card-pad">
        <h2 className="ahd-h2">Finances</h2>
        <dl className="ahd-profile-rows">
          <div className="ahd-profile-row">
            <dt>Donor network</dt>
            <dd className="ahd-mono">Level {finances.donorBaseLevel}</dd>
          </div>
          <div className="ahd-profile-row">
            <dt>Cash</dt>
            <dd className="ahd-mono">{money(finances.cash, finances.currency)}</dd>
          </div>
          <div className="ahd-profile-row">
            <dt>Campaign funds</dt>
            <dd className="ahd-mono">
              {money(finances.funds, finances.currency)}
              <span className="ahd-profile-sub">
                <button
                  type="button"
                  className="ahd-profile-link"
                  onClick={() => onNavigate("actions", "fundraising")}
                  disabled={busy}
                >
                  Fundraising actions
                </button>
              </span>
            </dd>
          </div>
          <div className="ahd-profile-row">
            <dt>Savings</dt>
            <dd className="ahd-mono">{money(finances.savings, finances.currency)}</dd>
          </div>
          <div className="ahd-profile-row">
            <dt>Regular income</dt>
            <dd className="ahd-mono">{money(finances.regularIncome, finances.currency)} per turn</dd>
          </div>
          <div className="ahd-profile-row">
            <dt>Donor income</dt>
            <dd className="ahd-mono">{money(finances.donorIncome, finances.currency)} per turn</dd>
          </div>
        </dl>
        <div className="ahd-profile-actions">
          <button
            type="button"
            className="ahd-btn ahd-btn-sm"
            onClick={() => onNavigate("portfolio")}
            disabled={busy}
          >
            View portfolio
          </button>
        </div>
      </section>

      <section aria-label="Career history" className="ahd-card ahd-card-pad">
        <h2 className="ahd-h2">Career history</h2>
        {profile.careerHistory.length > 0 ? (
          <ul className="ahd-profile-history">
            {profile.careerHistory.map((entry) => (
              <li key={entry.id}>
                <strong>{entry.office}</strong>
                <span className="ahd-profile-sub">{entry.result}, turn {entry.turn}</span>
              </li>
            ))}
          </ul>
        ) : <p className="ahd-muted">No election wins recorded yet.</p>}
      </section>

      <section aria-label="Achievements" className="ahd-card ahd-card-pad">
        <h2 className="ahd-h2">Achievements</h2>
        {profile.achievements.length > 0 ? (
          <ul className="ahd-profile-history">
            {profile.achievements.map((achievement) => (
              <li key={achievement.slug}>
                <strong>{achievement.name}</strong>
                <span className="ahd-profile-sub">{achievement.description}</span>
              </li>
            ))}
          </ul>
        ) : <p className="ahd-muted">No achievements earned yet.</p>}
      </section>


    </div>
  );
}

export default ProfilePanel;
