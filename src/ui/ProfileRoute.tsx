import { useEffect, useState } from 'react';
import type { ProfileUpdate, ProfileView, ImperialProfileView } from '../game/profileTypes';
import type { DrawerRouteId } from './MobileNavigation';
import { ProfilePanel } from './ProfilePanel';
import { ImperialProfileNotice } from './ImperialProfileNotice';

/**
 * Profile route with the imperial gate (#54). When the destination loaders
 * are provided, an imperial save renders the imperial destination; every
 * ordinary save — and any gate without loaders — renders the ordinary
 * Profile as before.
 */
export function ProfileRoute({ load, loadDestination, loadImperial, revision, busy, onNavigate, onUpdateProfile, onSelectConstituency, viewerDisablesAutoplay }: {
  load: () => Promise<ProfileView>; revision: object; busy: boolean;
  loadDestination?: () => Promise<"profile" | "imperial">;
  loadImperial?: () => Promise<ImperialProfileView | null>;
  onNavigate: (route: DrawerRouteId, id?: string) => void;
  onUpdateProfile: (update: ProfileUpdate) => Promise<boolean>;
  onSelectConstituency: (constituencyId: string) => Promise<boolean>;
  viewerDisablesAutoplay?: boolean;
}) {
  const [profile, setProfile] = useState<ProfileView>();
  const [imperial, setImperial] = useState<ImperialProfileView | null>(null);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(undefined); setImperial(null);
    void (async () => {
      const destination = loadDestination ? await loadDestination() : "profile";
      if (!active) return;
      if (destination === "imperial" && loadImperial) {
        setImperial(await loadImperial());
        return;
      }
      setProfile(await load());
    })().catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : 'Profile could not load.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load, loadDestination, loadImperial, revision, attempt]);
  if (imperial) return <ImperialProfileNotice imperial={imperial} />;
  return <>
    {error && <div className="ahd-alert" role="alert">{error} <button type="button" className="ahd-btn" onClick={() => setAttempt(n => n + 1)}>Retry profile</button></div>}
    {!profile && loading && <p role="status">Loading profile...</p>}
    {profile && <ProfilePanel profile={profile} busy={busy || loading || !!error} onNavigate={onNavigate} onUpdateProfile={onUpdateProfile} onSelectConstituency={onSelectConstituency} viewerDisablesAutoplay={viewerDisablesAutoplay} />}
  </>;
}
