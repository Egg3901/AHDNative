import { useEffect, useState } from 'react';
import type { ProfileUpdate, ProfileView } from '../game/profileTypes';
import type { DrawerRouteId } from './MobileNavigation';
import { ProfilePanel } from './ProfilePanel';

/** Refresh saved stats without unmounting an in-progress profile editor. */
export function ProfileRoute({ load, revision, busy, onNavigate, onUpdateProfile }: {
  load: () => Promise<ProfileView>; revision: object; busy: boolean;
  onNavigate: (route: DrawerRouteId, id?: string) => void;
  onUpdateProfile: (update: ProfileUpdate) => Promise<boolean>;
}) {
  const [profile, setProfile] = useState<ProfileView>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(undefined);
    void Promise.resolve().then(load).then(value => {
      if (active) setProfile(value);
    }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : 'Profile could not load.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load, revision, attempt]);
  return <>
    {error && <div className="ahd-alert" role="alert">{error} <button type="button" className="ahd-btn" onClick={() => setAttempt(n => n + 1)}>Retry profile</button></div>}
    {!profile && loading && <p role="status">Loading profile...</p>}
    {profile && <ProfilePanel profile={profile} busy={busy || loading || !!error} onNavigate={onNavigate} onUpdateProfile={onUpdateProfile} />}
  </>;
}
