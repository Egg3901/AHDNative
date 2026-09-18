# MP capability boundary (#86)

Deferred MP integration scope: presence, live timing, and server-session
controls. Account authentication is active P0 work in #149 and is not deferred
by this issue. This file is the capability-boundary contract from the #86
checklist: what lives offline, what lives behind the authenticated server
adapter, and which reference behavior each side mirrors.

## Offline SP boundary

The offline app is a local singleplayer game with no network dependency:

- `src/game/session.ts` (`GameSession`) owns mutable engine state; only
  detached display data and save strings cross the boundary. There is no
  server adapter, no session phase, and no network call on this path.
- Turn flow is player-paced: End turn advances the local world one turn, and
  the idle footer renders `Player paced` (`src/ui/GameScreen.tsx`, footer
  statusline). The offline footer has no presence, countdown, or server
  control by construction.
- The drawer exposes no presence, countdown, or server routes or labels
  (`src/ui/MobileNavigation.tsx`, `MENU_GROUPS` / `drawerRouteIds`). Rows
  without a reachable Native destination are omitted, never placeholders.
- `src/ui/HelpPanel.tsx` documents MP accounts and live server play as out
  of offline scope (`Still unavailable here`), and keeps account settings,
  feedback, and suggestions inside Multiplayer after AHDGame authenticates
  that surface. The offline app cannot inspect or reuse that account session.

Regression lock: `src/ui/MpBoundaryOffline.test.tsx` asserts the idle footer
shows `Player paced` with no online/countdown/server text, and that the
drawer route ids and labels contain no presence/countdown/server entries.

## Authenticated MP boundary (behind the server adapter)

MP controls render only from the authoritative server adapter. There are no
dead MP controls offline and no synthesized server state anywhere:

- `src/mp/adapter.ts` (`MpModeSession`) is the single adapter. Session
  phases: `idle`, `loading`, `session-required`, `signed-out`, `ready`,
  `auth-expired`, `offline`, `rate-limited`, `server-error`. Failures land in
  a recoverable phase with retry; last loaded state is kept below the notice.
- Presence comes from the public `GET /api/players/online` endpoint
  (`src/mp/endpoints.ts`, players-online block). The reference
  (`AHDGame src/components/StatusBar.tsx:105-143`) polls it every 5 minutes
  plus on visibility return, visible-only, and renders nothing until a fetch
  succeeds. Native mirrors that posture exactly: `PRESENCE_POLL_MS` of
  300_000 plus visibility re-poll (`src/ui/MpModeScreen.tsx:44-49, 219-238`),
  with `loadPresence` outside enter/refresh so every failure mode (refusal,
  rate limit, malformed, offline, surprising 401) leaves the row absent,
  never zero, and never touches phase or error state
  (`src/mp/adapter.ts`, `loadPresence` contract).
- Live timing is projected from the server `nextScheduledTurn` at render
  (`src/ui/MpModeScreen.tsx:496-499`), never synthesized.
  `formatTurnCountdown` in `src/mp/validators.ts` is pinned to the reference
  `formatRealTimeCountdown` (`AHDGame src/lib/utils/formatters.ts`, used by
  `StatusBar.getTimeUntilNextTurn` at `StatusBar.tsx:264-272`): null schedule
  renders no claim, a passed deadline renders `Processing...`, paused renders
  `Paused`. The World turn card states mirror the reference
  (`StatusBar.tsx:382-422`): `Processing: <label> [(<pct>%)]` with an
  independent target-turn row, `Paused[: reason]`, `Live` with the countdown
  or `Player paced` when the world has no schedule, and `Paused` for an
  inactive world. Malformed progress hides the percent while the server
  target still shows.
- Reconnect and session restore: mount chains enter, then on-demand mail,
  then presence; manual Refresh re-reads authoritative state and refreshes
  presence; foreground return re-probes while waiting for a session (#149).
  The blocked card keeps last loaded state with Reconnect; auth expiry
  renders `Session expired` with a provider reconnect path and evicts every
  authed projection, closing open detail panels. Unlink/switch resets
  per-account form state so a shared phone never leaks the previous
  player's mail or drafts (#149, #363). Session material is never persisted
  to web storage. There is no Native token store: AHDGame owns
  authentication and the session, matching the observed AHDClient boundary
  where the live game owns login state.
- Server account controls (account settings, feedback, suggestions board,
  Quick Suggest capture) live inside Multiplayer after AHDGame authenticates
  that surface, as documented in `src/ui/HelpPanel.tsx`.

Reference presentation parity, not behavior drift: `AHDClient
apps/desktop/src/gameShell/GameShell.tsx:64-70, 567` badges or gates
`multiplayerOnly` destinations instead of showing dead controls. Native
follows the same rule: a capability without a reachable destination is
omitted, and an MP control renders only with loaded authoritative data
behind it (detail panels open only after the summary load succeeds).

## Test evidence

- Presence/countdown/processing/paused/failure modes across phone and
  desktop widths: `src/ui/MpModeScreenPresence.test.tsx`.
- Presence shape validation and countdown formatting:
  `src/mp/validators.test.ts`, `src/mp/presence.test.ts`.
- Endpoint contracts: `src/mp/endpoints.test.ts`.
- Reconnect, auth expiry, cold boot, foreground restore, mode transition,
  sign out and unlink residue: `src/mp/sessionLifecycle.test.ts`,
  `src/mp/coldBootRestore.test.ts`, `src/ui/MpModeScreenSessionRestore.test.tsx`,
  `src/ui/MpModeScreenForegroundRestore.test.tsx`,
  `src/ui/MpModeScreenModeTransition.test.tsx`,
  `src/ui/MpModeScreenSignOut.test.tsx`,
  `src/ui/MpModeScreenSessionlessOffline.test.tsx`.
- Offline boundary (no dead controls, MP out of scope):
  `src/ui/MpBoundaryOffline.test.tsx`, `src/ui/HelpPanel.test.tsx`,
  `src/ui/MobileNavigation.test.tsx` (omission test),
  `src/ui/GameScreenStatusline.test.tsx` (idle `Player paced`).

## Residual gaps (stay open under #86)

- Full MP gameplay parity beyond the implemented adapter slices remains
  deferred to the later authoritative MP integration.
- The offline surface must stay free of dead presence, countdown, or server
  actions as destinations evolve; the regression test above is the lock.
- MP controls are added only with a connected authoritative server adapter
  plus reconnect, processing, auth-expiry, and save/session-transition
  tests for each new control.
