/**
 * Shared Native bottom-navigation SVG icon primitive (#369).
 *
 * Single-player (`BottomNav`) and multiplayer (`MpModeScreen`) navigation
 * render the same stroke icon language from these inline path strings, so
 * both modes match touch targets, active treatment, safe-area behavior, and
 * focus-visible styling through the shared `.ahd-bottomnav-item` classes.
 * All icons are bundled inline SVG: no remote fetches, no font glyphs.
 */
export const NAV_ICON_PATHS = {
  profile: "M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5",
  actions: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0",
  ask: "M5 5h14v10H9l-4 4V5Zm4 4h6M9 12h4",
  menu: "M4 7h16M4 12h16M4 17h16",
  multiplayer: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M5 7a4 4 0 1 0 8 0 4 4 0 1 0-8 0Zm14 14v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
} as const;

export function NavIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={path} />
    </svg>
  );
}
