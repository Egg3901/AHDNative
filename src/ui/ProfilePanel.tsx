/**
 * ProfilePanel: own character profile.
 *
 * Layout hierarchy adapted from the public AHDGame reference:
 *   src/app/profile/components/ProfileHeader.tsx (banner strip with custom
 *   header or accent-gradient fallback, overlap identity row with portrait and
 *   initials fallback, name, party chip, home region and country links, office
 *   label, inline biography) plus the overlap offsets in
 *   src/lib/constants/profileHeroLayout.ts. The banner strip is a RouteHero
 *   using the bundled offline politicians asset (#371) instead of the
 *   reference gradient, and server-only elements (Patreon/admin badges,
 *   copy-link, wiki link, member-since, CountryFlag) are omitted: no lawful
 *   flag asset is bundled and offline play has no supporter tiers.
 *   src/app/profile/components/PoliticalStanding.tsx (actions with cap and
 *   per turn rate plus Campaign Office link, state influence, national
 *   influence, favorability, infamy, conditional party influence),
 *   src/app/profile/components/FinancialStrip.tsx (donor network level, cash,
 *   campaign funds, savings, income details, portfolio link),
 *   src/app/profile/components/PolicyDemographicsCard.tsx and
 *   src/components/PoliticalCompass.tsx (the "Policy and demographics" card: the
 *   player's projected policy axes on a plain-SVG compass, a party marker from
 *   world.parties[].economicPosition/socialPosition, and the honest unavailable
 *   state for the home-region lean the engine does not record — so no region
 *   marker is ever fabricated).
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
import { RouteHero, profileHeroImage } from "./RouteHero";
import { CampaignSongPlayer } from "./CampaignSongPlayer";
import { PolicyCompass, policyAxisLabel, type CompassMarker } from "./PolicyCompass";
import { ResourceBreakdown } from "./ResourceBreakdown";
import { CountryFlag } from "./CountryFlag";
import { STAT_KEYS } from "@ahdclient/engine";
import "./profile.css";

/** Canonical stat display order and labels (reference statsConstants.ts / statMeta.ts). */
const STAT_META_ORDER = STAT_KEYS;
const STAT_LABELS: Record<string, string> = {
  charisma: "Charisma",
  debate: "Debate",
  energy: "Energy",
  fundraising: "Fundraising",
  businessAcumen: "Business Acumen",
  statecraft: "Statecraft",
  intellect: "Intellect",
};

/** Reference demographic option labels (creatorOptions.ts labelFor). */
const DEMOGRAPHIC_LABELS: Record<string, string> = {
  white: "White", black: "Black", hispanic: "Hispanic", asian: "Asian", other: "Other",
  male: "Male", female: "Female", nonbinary: "Non-binary",
  no_college: "No degree", college: "College", graduate: "Graduate",
  low: "Low Income", middle: "Middle Income", high: "High Income",
};
function demographicLabel(value: string): string {
  return DEMOGRAPHIC_LABELS[value] ?? value;
}

export interface ProfilePanelProps {
  profile: ProfileView;
  era?: string;
  busy: boolean;
  onNavigate: (route: DrawerRouteId, id?: string) => void;
  onUpdateProfile: (update: ProfileUpdate) => Promise<boolean>;
  onSelectConstituency: (constituencyId: string) => Promise<boolean>;
  viewerDisablesAutoplay?: boolean;
}

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_EDGE = 256;
// Reference profile-header preset (imageOptimize.ts profileHeader: 1400x400 @ 80).
const HEADER_MAX_BYTES = 4 * 1024 * 1024;
const HEADER_WIDTH = 1400;
const HEADER_HEIGHT = 400;
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

function toAvatarDataUrl(file: File, dataUrl: string): Promise<string> {
  return toResizedDataUrl(file, dataUrl, AVATAR_EDGE, AVATAR_EDGE);
}

async function toResizedDataUrl(file: File, dataUrl: string, maxWidth: number, maxHeight: number): Promise<string> {
  // decodeImage rejects on a corrupt raster, so raw bytes are never persisted.
  const img = await decodeImage(dataUrl);
  const width = img.naturalWidth || img.width || 0;
  const height = img.naturalHeight || img.height || 0;
  // A decoder that yields no intrinsic size (e.g. a test double) cannot be
  // resized; the already-decoded data URL is what the browser accepted.
  if (!width || !height) return dataUrl;
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  if (scale >= 1) return dataUrl;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(file.type === "image/png" ? "image/png" : "image/jpeg", 0.85);
}

/** Header uses the wider reference preset; the caller resizes to <=1400x400. */
function toHeaderDataUrl(file: File, dataUrl: string): Promise<string> {
  return toResizedDataUrl(file, dataUrl, HEADER_WIDTH, HEADER_HEIGHT);
}

function validatePicture(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return "Only JPEG, PNG or WebP pictures are allowed.";
  if (file.size > MAX_BYTES) return "Picture must be under 2 MB.";
  return null;
}

function validateHeader(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return "Only JPEG, PNG or WebP headers are allowed.";
  if (file.size > HEADER_MAX_BYTES) return "Header must be under 4 MB.";
  return null;
}

export function ProfilePanel({ profile, era, busy, onNavigate, onUpdateProfile, onSelectConstituency, viewerDisablesAutoplay = false }: ProfilePanelProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const headerRef = useRef<HTMLInputElement | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [headerSaving, setHeaderSaving] = useState(false);
  const [bioEditing, setBioEditing] = useState(false);
  const [bioDraft, setBioDraft] = useState(profile.bio);
  const [bioError, setBioError] = useState<string | null>(null);
  const [bioSaving, setBioSaving] = useState(false);
  const [songDraft, setSongDraft] = useState(profile.campaignSongUrl);
  const [songAutoplay, setSongAutoplay] = useState(profile.campaignSongAutoplay);
  const [songError, setSongError] = useState<string | null>(null);
  const [songSaving, setSongSaving] = useState(false);
  const [constituencyId, setConstituencyId] = useState(profile.constituency.selected?.id ?? "");
  const [savedConstituencyId, setSavedConstituencyId] = useState(profile.constituency.selected?.id ?? "");
  const [constituencySaving, setConstituencySaving] = useState(false);
  const [constituencyError, setConstituencyError] = useState<string | null>(null);

  const photoBusy = busy || photoSaving;
  const headerBusy = busy || headerSaving;
  const formBusy = busy || bioSaving;
  const standing = profile.standing;
  const finances = profile.finances;
  const favorabilityDetail = profile.resourceDetails.favorability;
  const nationalInfluenceGain = profile.resourceDetails.nationalInfluence.gain;

  // Policy compass sources. The player dot comes from the projected policy axes;
  // the only secondary marker the engine can back is the party's authored
  // position (world.parties[].economicPosition/socialPosition). No home-region
  // marker is added: the engine's Region carries no economic/social lean and no
  // code writes one (see the card's honest note), so none is fabricated.
  const party = profile.party;
  const compassMarkers: CompassMarker[] = [];
  if (
    party &&
    party.economicPosition != null && Number.isFinite(party.economicPosition) &&
    party.socialPosition != null && Number.isFinite(party.socialPosition)
  ) {
    compassMarkers.push({
      economic: party.economicPosition,
      social: party.socialPosition,
      glyph: "P",
      name: party.name,
      color: party.color,
    });
  }

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

  const saveConstituency = async () => {
    if (busy || constituencySaving || !constituencyId) return;
    setConstituencyError(null);
    setConstituencySaving(true);
    try {
      if (await onSelectConstituency(constituencyId)) setSavedConstituencyId(constituencyId);
      else setConstituencyError("Constituency could not be saved. Your selection is kept.");
    } catch {
      setConstituencyError("Constituency could not be saved. Your selection is kept.");
    } finally {
      setConstituencySaving(false);
    }
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

  const saveHeaderFile = async (file: File) => {
    if (headerBusy) return;
    const invalid = validateHeader(file);
    if (invalid) {
      setHeaderError(invalid);
      return;
    }
    setHeaderError(null);
    setHeaderSaving(true);
    try {
      const dataUrl = await readAsDataUrl(file);
      const profileHeaderUrl = await toHeaderDataUrl(file, dataUrl);
      const ok = await onUpdateProfile({ profileHeaderUrl });
      if (!ok) setHeaderError("Header could not be saved.");
    } catch {
      setHeaderError("That file could not be read as a header image.");
    } finally {
      setHeaderSaving(false);
      if (headerRef.current) headerRef.current.value = "";
    }
  };

  const removeHeader = async () => {
    if (headerBusy) return;
    setHeaderError(null);
    setHeaderSaving(true);
    try {
      const ok = await onUpdateProfile({ profileHeaderUrl: null });
      if (!ok) setHeaderError("Header could not be removed.");
    } catch {
      setHeaderError("Header could not be removed.");
    } finally {
      setHeaderSaving(false);
    }
  };

  return (
    <div className="ahd-stack ahd-profile">
      <section aria-label="Character" className="ahd-card ahd-card-pad ahd-profile-header ahd-hero">
        <RouteHero
          image={profileHeroImage(profile.profileHeaderUrl)}
          alt={profile.profileHeaderUrl ? `${profile.name} profile header` : "Politicians meeting in a national chamber"}
          eyebrow={profile.country.name}
          title={profile.name}
          className="ahd-profile-hero"
        />
        <div className="ahd-profile-hero-id">
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
              <CountryFlag countryId={profile.country.id} countryName={profile.country.name} era={era} size="sm" />
              <button
                type="button"
                className="ahd-profile-link"
                onClick={() => onNavigate("nations", profile.country.id)}
                disabled={busy}
              >
                {profile.country.name}
              </button>
            </div>
          </div>
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
        <div className="ahd-profile-photoactions" style={{ marginTop: "0.5rem" }}>
          <input
            ref={headerRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            className="ahd-profile-file"
            aria-label="Choose profile header"
            aria-describedby="ahd-profile-header-hint"
            disabled={headerBusy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void saveHeaderFile(file);
            }}
          />
          <button
            type="button"
            className="ahd-btn ahd-btn-sm"
            onClick={() => headerRef.current?.click()}
            disabled={headerBusy}
          >
            {profile.profileHeaderUrl ? "Change header" : "Upload header"}
          </button>
          {profile.profileHeaderUrl ? (
            <button
              type="button"
              className="ahd-btn ahd-btn-ghost ahd-btn-sm"
              onClick={() => void removeHeader()}
              disabled={headerBusy}
            >
              Remove header
            </button>
          ) : null}
        </div>
        <p id="ahd-profile-header-hint" className="ahd-help">
          JPEG, PNG or WebP, under 4 MB.
        </p>
        {headerError ? (
          <p className="ahd-alert" role="alert">
            {headerError}
          </p>
        ) : null}
      </section>

      <section aria-label="Constituency" className="ahd-card ahd-card-pad">
        <h2 className="ahd-h2">
          {profile.constituency.officeType === "primeMinister" ? "Prime Minister constituency" : "Commons constituency"}
        </h2>
        {profile.constituency.eligible ? (
          <>
            <p className="ahd-muted">Choose a constituency inside the UK region tied to your elected office.</p>
            <label className="ahd-field" htmlFor="ahd-profile-constituency">
              <span className="ahd-label">Constituency</span>
              <select
                id="ahd-profile-constituency"
                className="ahd-select"
                value={constituencyId}
                disabled={busy || constituencySaving}
                onChange={(event) => { setConstituencyId(event.target.value); setConstituencyError(null); }}
              >
                <option value="">Choose a constituency</option>
                {profile.constituency.options.map((option) => (
                  <option key={option.id} value={option.id}>{option.name} ({option.id})</option>
                ))}
              </select>
            </label>
            <div className="ahd-profile-actions">
              <button
                type="button"
                className="ahd-btn ahd-btn-primary ahd-btn-sm"
                disabled={busy || constituencySaving || !constituencyId}
                onClick={() => void saveConstituency()}
              >
                {constituencySaving ? "Saving..." : "Save constituency"}
              </button>
              {savedConstituencyId && profile.constituency.regionId ? (
                <button
                  type="button"
                  className="ahd-btn ahd-btn-sm"
                  aria-label={`${profile.constituency.options.find((option) => option.id === savedConstituencyId)?.name ?? savedConstituencyId}, view ${profile.homeRegion?.name ?? profile.constituency.regionId} region`}
                  onClick={() => onNavigate("state", profile.constituency.regionId ?? undefined)}
                  disabled={busy}
                >
                  View constituency region
                </button>
              ) : null}
            </div>
            {constituencyError ? <p className="ahd-alert" role="alert">{constituencyError}</p> : null}
          </>
        ) : (
          <p className="ahd-muted">{profile.constituency.unavailableReason}</p>
        )}
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
              {standing.nationalInfluence == null ? (
                "Not available yet"
              ) : (
                <>
                  {standing.nationalInfluence.toFixed(1)}
                  <span className="ahd-profile-sub">
                    {`+${nationalInfluenceGain.toFixed(1)} per turn at current standing (not a forecast)`}
                  </span>
                </>
              )}
            </dd>
          </div>
          <div className="ahd-profile-row">
            <dt>Favorability</dt>
            <dd className="ahd-mono">
              {standing.favorability.toFixed(1)}%
              <span className="ahd-profile-sub">
                {`Tier floor ${favorabilityDetail.tierFloor}% · advertise ${favorabilityDetail.tierCost} AP`}
              </span>
              <span className="ahd-profile-sub">
                {favorabilityDetail.aboveThresholdDecay > 0
                  ? `Decay ${favorabilityDetail.aboveThresholdDecay.toFixed(2)}/turn above ${favorabilityDetail.decayThreshold}%`
                  : `Stable at or below ${favorabilityDetail.decayThreshold}%`}
              </span>
            </dd>
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
        <details>
          <summary style={{ minHeight: 44, cursor: "pointer", padding: ".6rem 0" }}>Action breakdown</summary>
          <ResourceBreakdown details={profile.resourceDetails} resource="ap" currency={finances.currency} />
          {profile.resourceDetails.partyInfluence ? (
            <dl className="ahd-profile-rows">
              <div className="ahd-profile-row"><dt>Platform closeness</dt><dd className="ahd-mono">{profile.resourceDetails.partyInfluence.closeness.toFixed(2)}</dd></div>
              <div className="ahd-profile-row"><dt>Leadership posts</dt><dd className="ahd-mono">{profile.resourceDetails.partyInfluence.leadership}</dd></div>
              <div className="ahd-profile-row"><dt>Infamy penalty</dt><dd className="ahd-mono">{profile.resourceDetails.partyInfluence.infamyPenalty.toFixed(1)}</dd></div>
              <div className="ahd-profile-row"><dt>Party influence gain</dt><dd className="ahd-mono">{profile.resourceDetails.partyInfluence.gain.toFixed(2)} per turn</dd></div>
              <div className="ahd-profile-row"><dt>Influence after decay</dt><dd className="ahd-mono">{profile.resourceDetails.partyInfluence.next.toFixed(1)}</dd></div>
            </dl>
          ) : null}
        </details>
        <p className="ahd-help">
          National-influence gain and the favorability tier and decay are read from the same
          action-refresh and tier tables the turn applies, at your current standing — mechanical
          inputs, not a forecast.
        </p>
      </section>

      {profile.stats ? (
        <section aria-label="Character stats" className="ahd-card ahd-card-pad">
          <h2 className="ahd-h2">Character stats</h2>
          <dl className="ahd-profile-rows">
            {STAT_META_ORDER.map((key) =>
              profile.stats![key] != null ? (
                <div className="ahd-profile-row" key={key}>
                  <dt>{STAT_LABELS[key] ?? key}</dt>
                  <dd className="ahd-mono">{profile.stats![key]}</dd>
                </div>
              ) : null,
            )}
          </dl>
          <p className="ahd-help">
            Every stat ranges 1 to 10 on the engine's own scale. A higher stat shifts the
            corresponding action outcome by a gentle multiplier (see Actions for quoted costs).
          </p>
        </section>
      ) : null}

      <section aria-label="Policy and demographics" className="ahd-card ahd-card-pad">
        <h2 className="ahd-h2">Policy and demographics</h2>
        <PolicyCompass
          economic={profile.policies ? profile.policies.economic : null}
          social={profile.policies ? profile.policies.social : null}
          dotColor={profile.party?.color}
          markers={compassMarkers}
        />
        <dl className="ahd-profile-rows">
          <div className="ahd-profile-row">
            <dt>Economic</dt>
            <dd className="ahd-mono">
              {profile.policies
                ? `${profile.policies.economic.toFixed(1)} · ${policyAxisLabel(profile.policies.economic, "economic")}`
                : "Not recorded yet"}
            </dd>
          </div>
          <div className="ahd-profile-row">
            <dt>Social</dt>
            <dd className="ahd-mono">
              {profile.policies
                ? `${profile.policies.social.toFixed(1)} · ${policyAxisLabel(profile.policies.social, "social")}`
                : "Not recorded yet"}
            </dd>
          </div>
          {profile.demographics ? (
            <>
              <div className="ahd-profile-row"><dt>Gender</dt><dd className="ahd-mono">{demographicLabel(profile.demographics.gender)}</dd></div>
              <div className="ahd-profile-row"><dt>Race</dt><dd className="ahd-mono">{demographicLabel(profile.demographics.race)}</dd></div>
              <div className="ahd-profile-row"><dt>Education</dt><dd className="ahd-mono">{demographicLabel(profile.demographics.education)}</dd></div>
              <div className="ahd-profile-row"><dt>Background</dt><dd className="ahd-mono">{demographicLabel(profile.demographics.wealth)}</dd></div>
            </>
          ) : (
            <div className="ahd-profile-row">
              <dt>Demographics</dt>
              <dd className="ahd-mono ahd-profile-unavailable-note">Not recorded by this save</dd>
            </div>
          )}
          {compassMarkers.map((marker) => (
            <div className="ahd-profile-row" key={marker.name}>
              <dt>Party position</dt>
              <dd className="ahd-mono">{`${marker.economic.toFixed(1)} / ${marker.social.toFixed(1)}`}</dd>
            </div>
          ))}
          <div className="ahd-profile-row">
            <dt>Home-region lean</dt>
            <dd className="ahd-mono ahd-profile-unavailable-note">Not recorded by the engine</dd>
          </div>
        </dl>
        <div className="ahd-profile-actions">
          {profile.party ? (
            <button
              type="button"
              className="ahd-btn ahd-btn-sm"
              onClick={() => onNavigate("partyDetails", profile.party?.id)}
              disabled={busy}
            >
              View party
            </button>
          ) : null}
          {profile.homeRegion ? (
            <button
              type="button"
              className="ahd-btn ahd-btn-sm"
              onClick={() => onNavigate("state", profile.homeRegion?.id)}
              disabled={busy}
            >
              View home region
            </button>
          ) : null}
          <button type="button" className="ahd-btn ahd-btn-sm" onClick={() => onNavigate("policy")} disabled={busy}>
            View national policy
          </button>
        </div>
        <p className="ahd-help">
          {profile.policies
            ? "Your axes are read straight from the save on the engine's -5 to +5 scale; distance to a platform is what primaries and general elections measure."
            : "Your policy axes are not recorded in this save yet, so the compass shows no position for you."}
        </p>
        <p className="ahd-help">
          A home-region lean marker is not shown: the engine does not record a per-region economic/social lean yet.
          Where present, the party marker is that party's authored platform.
        </p>
      </section>

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
        <details>
          <summary style={{ minHeight: 44, cursor: "pointer", padding: ".6rem 0" }}>Income and cash breakdown</summary>
          <ResourceBreakdown details={profile.resourceDetails} resource="funds" currency={finances.currency} />
          <ResourceBreakdown details={profile.resourceDetails} resource="cash" currency={finances.currency} />
        </details>
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
                <button
                  type="button"
                  className="ahd-btn ahd-btn-sm"
                  aria-label={`View race: ${entry.office}`}
                  onClick={() => onNavigate("electionDetails", entry.id)}
                  disabled={busy}
                >
                  View race
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="ahd-muted">No election wins recorded yet.</p>}
      </section>

      <section aria-label="Achievements" className="ahd-card ahd-card-pad">
        <h2 className="ahd-h2">Achievements</h2>
        <p className="ahd-profile-sub">
          {`${profile.achievementProgress.earned} of ${profile.achievementProgress.available} evaluable achievements earned`}
        </p>
        {profile.achievements.length > 0 ? (
          <ul className="ahd-profile-history">
            {profile.achievements.map((achievement) => (
              <li key={achievement.slug}>
                <strong>{achievement.name}</strong>
                <span className="ahd-profile-sub">{achievement.description}</span>
                {achievement.progress ? (
                  <span className="ahd-profile-sub ahd-mono">
                    {`${achievement.progress.current} / ${achievement.progress.target}`}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : <p className="ahd-muted">No achievements earned yet.</p>}
        {profile.lockedAchievements.length > 0 ? (
          <div className="ahd-profile-locked">
            <h3 className="ahd-profile-locked-title">
              {`Locked achievements (${profile.lockedAchievements.length})`}
            </h3>
            <ul className="ahd-profile-history ahd-profile-locked-list">
              {profile.lockedAchievements.map((achievement) => (
                <li key={achievement.slug}>
                  <strong>{achievement.name}</strong>
                  <span className="ahd-profile-sub">{achievement.description}</span>
                  {achievement.progress ? (
                    <span className="ahd-profile-sub ahd-mono">
                      {`${achievement.progress.current} / ${achievement.progress.target}`}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {profile.unavailableAchievements.length > 0 ? (
          <div className="ahd-profile-locked ahd-profile-unavailable">
            <h3 className="ahd-profile-locked-title">
              {`Unavailable achievements (${profile.unavailableAchievements.length})`}
            </h3>
            <ul className="ahd-profile-history ahd-profile-locked-list">
              {profile.unavailableAchievements.map((achievement) => (
                <li key={achievement.slug}>
                  <strong>{achievement.name}</strong>
                  <span className="ahd-profile-sub">{achievement.description}</span>
                  {achievement.blockingSystem ? (
                    <span className="ahd-profile-sub ahd-profile-blocker">
                      {`Not reachable yet: ${achievement.blockingSystem}.`}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="ahd-help">
          The count, locked list and per-achievement progress cover the achievements this solo save can
          evaluate; progress is shown only where the trigger is a countable action, never fabricated.
          Unavailable achievements need systems the local engine has not ported yet — the blocking
          system is named for each.
        </p>
      </section>


    </div>
  );
}

export default ProfilePanel;
