# Offline geographic maps and Hall of Fame

This is partial #73, with #72 and #510 reference only. Game source is
`01797b27082b098fdf3929bb498215c94c8dda24`; existing portable mechanics pin
`954f1c2` and rules pin `08820d1` are unchanged. Current Client was refreshed
through `799a992` without changes to these map/standings paths.

## Reference flow and implementation

Game's world/nation map navigation uses real country shapes and a separate
country-scoped subdivision view. Native preserves world and country contexts
through World map, with the existing Nations and Regions directories and links.
The country picker queries the actual saved country's region roster. Foreign
shapes/rows select within the map; they never change the player country, home
region or save, and never open a foreign row through the player-scoped Regions
route. Player-country rows retain working region links.

Natural Earth world geometry is public domain. Subdivision shards preserve the
source asset provenance in `public/licenses/region-shards.txt`. Nine country
maps share the bundled shards; country/era coverage follows recorded region IDs, with
explicit partial/unavailable text for absent shapes. The US Albers projection
was compared to independent source projection output at 1,187 points, with
maximum normalized discrepancy below 1.6e-13. Country shapes support pointer,
Enter and Space selection; directory controls remain available independently.

The source Hall of Fame at `src/app/world/legacy/page.tsx` ranks by Legacy Score
or FX-normalized net worth, with all-life/current-era scope and a 50-row page.
Native uses those metrics for the recorded local life, including the actual
source office/age/logarithmic components, and links its profile/home/races.
It does not invent NPC player lives or a party/influence leaderboard. The
server's cross-player history is not present on the offline device.

## Public boundary evidence

- Twenty-three query/projection tests and 26 rendered map/standings/overflow
  tests passed after integration with union commands.
- A red-first `GameScreen` regression reproduced unnecessary Hall of Fame
  queries when an unrelated saved-status update rerendered the map. Passing
  the existing stable loader directly preserves the loaded map and standings.
- Real Chromium 390px flow: public new game, real France shape click, US
  subdivisions, UK picker/shape keyboard selection and directory selection,
  return to US, source Hall of Fame filters/profile, normal save/reload, saved
  country-view preference and real source shapes restored. No page errors or
  horizontal overflow. The inspected viewport screenshot shows the actual map.
- Real Chromium 320px flow: public new game and keyboard France shape
  selection, working nation detail, no horizontal overflow. Both widths pass.
- The browser initially exposed stale expected shape/filter labels and a
  helper assuming the world view even after a retained country view. Those
  expectations now follow the recorded source geometry and saved view.

Map section/view preferences are persisted; country selection is a browsing
context reset to the player's country when the map route is opened again.
The final focused integration and full hosted gate are required before merge.
No paid build, physical-device gesture proof or full MP parity is claimed.

## Remaining #73 acceptance

Complete source map modes/metrics, every source country/era subdivision,
server-wide current and historical player standings, and the remaining
conditional drawer/country/deep-regional destinations are still open. #72
retains deep regional government workflows and #510 full destination/device
acceptance. This slice does not close any of those issues.
