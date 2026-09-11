import { useEffect, useState } from "react";

export interface CampaignSongPlayerProps {
  videoId: string;
  ownerAutoplay: boolean;
  viewerDisablesAutoplay: boolean;
  characterName: string;
}

function mediaAvailable(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine
    && (typeof document === "undefined" || document.visibilityState !== "hidden");
}

/** Optional network media. Removing the iframe stops playback on offline/background transitions. */
export function CampaignSongPlayer({ videoId, ownerAutoplay, viewerDisablesAutoplay, characterName }: CampaignSongPlayerProps) {
  const [available, setAvailable] = useState(mediaAvailable);
  useEffect(() => {
    const refresh = () => setAvailable(mediaAvailable());
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  if (!available) {
    return <p className="ahd-muted" role="status">Campaign song is available when this device is online and the app is active.</p>;
  }
  const autoplay = ownerAutoplay && !viewerDisablesAutoplay;
  const source = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=${autoplay ? 1 : 0}&playsinline=1&rel=0`;
  return (
    <iframe
      className="ahd-campaign-song"
      src={source}
      title={`${characterName}'s campaign song`}
      allow="autoplay; encrypted-media; picture-in-picture"
      allowFullScreen
      loading="lazy"
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}
