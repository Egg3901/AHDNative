/**
 * Test-only fixture bootstrap boundary (#506).
 *
 * Smoke tests used to inject save fixtures through the player-facing
 * "Import saved game" file picker. That control is removed; fixtures now
 * enter through this hook instead. The hook is installed by `src/App.tsx`
 * only in dev or an explicitly flagged disposable CI smoke bundle, so
 * ordinary production builds (Vite replaces the flags statically and drops
 * the branch) never install it,
 * never render it, and never expose it as callable. It adds no new
 * capabilities: the fixture bytes travel the same native/session path as a
 * normal resume (`GameClient.load` -> `deserializeSave` with compatibility
 * migration, then `saveRepository.save`). No Tauri command, file-system, or
 * IPC surface is added or widened.
 */

export interface AhdTestHooks {
  /** Load fixture save bytes through the normal worker/store path. */
  loadFixture: (contents: string) => Promise<void>;
}

declare global {
  interface Window {
    __ahdTestHooks?: AhdTestHooks;
  }
}

/** Install hooks only in dev or the explicitly flagged CI smoke bundle. */
export function installTestHooks(hooks: AhdTestHooks): void {
  if (!import.meta.env.DEV && import.meta.env.VITE_AHD_SMOKE_FIXTURES !== '1') return;
  window.__ahdTestHooks = hooks;
}

/** Remove the hooks (app teardown). */
export function clearTestHooks(): void {
  if (typeof window !== "undefined" && window.__ahdTestHooks) {
    delete window.__ahdTestHooks;
  }
}
