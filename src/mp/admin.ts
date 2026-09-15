import { mpFetch, type MpBridgeHost, type MpCallResult } from "./bridge";
import {
  parseClientNavPermissions,
  parseMaintenanceStatus,
  type MpMaintenanceStatus,
} from "./validators";

/**
 * Read-only Native admin session (#359 admin slice). The server alone
 * decides who is an admin: `client-nav` returns the authoritative
 * `user.isAdmin` flag and the maintenance read runs only when it is true.
 * Non-admins (including moderators), signed-out users, and malformed
 * permission bodies never reach the admin endpoint. Nothing here mutates:
 * the maintenance PATCH sibling stays absent from the relay.
 */

export type MpAdminPhase =
  | "idle"
  | "loading"
  | "denied"
  | "signed-out"
  | "offline"
  | "server-error"
  | "ready";

export interface MpAdminSnapshot {
  phase: MpAdminPhase;
  isAdmin: boolean;
  isModerator: boolean;
  status: MpMaintenanceStatus | null;
  notice: string | null;
  error: string | null;
}

const INITIAL_SNAPSHOT: MpAdminSnapshot = {
  phase: "idle",
  isAdmin: false,
  isModerator: false,
  status: null,
  notice: null,
  error: null,
};

export class MpAdminSession {
  private snapshot: MpAdminSnapshot = { ...INITIAL_SNAPSHOT };

  constructor(private readonly host: MpBridgeHost) {}

  get(): MpAdminSnapshot {
    return { ...this.snapshot };
  }

  private set(patch: Partial<MpAdminSnapshot>): MpAdminSnapshot {
    this.snapshot = { ...this.snapshot, ...patch };
    return this.get();
  }

  /** Drop all admin state: mode exit lands here. */
  exit(): MpAdminSnapshot {
    this.snapshot = { ...INITIAL_SNAPSHOT };
    return this.get();
  }

  /** Permission probe first; the admin read runs for server admins only. */
  async enter(): Promise<MpAdminSnapshot> {
    this.set({
      phase: "loading",
      isAdmin: false,
      isModerator: false,
      status: null,
      notice: null,
      error: null,
    });
    const nav = await mpFetch(this.host, "client-nav");
    if (nav.kind !== "ok") return this.applyFailure(nav);
    const perms = parseClientNavPermissions(nav.bodyText);
    if (!perms) {
      return this.set({ phase: "server-error", error: "The permission check answered in an unexpected shape." });
    }
    this.set({ isAdmin: perms.isAdmin, isModerator: perms.isModerator });
    if (!perms.isAdmin) {
      return this.set({ phase: "denied", error: "This account is not an admin on the live game." });
    }
    return this.refreshStatus();
  }

  /** Re-read the status; non-admins re-prove the gate instead. */
  async refresh(): Promise<MpAdminSnapshot> {
    if (!this.snapshot.isAdmin) return this.enter();
    this.set({ phase: "loading", notice: null, error: null });
    return this.refreshStatus();
  }

  private async refreshStatus(): Promise<MpAdminSnapshot> {
    const result = await mpFetch(this.host, "admin-maintenance");
    if (result.kind !== "ok") return this.applyFailure(result);
    const status = parseMaintenanceStatus(result.bodyText);
    if (!status) {
      return this.set({ phase: "server-error", error: "The site status answered in an unexpected shape." });
    }
    return this.set({ phase: "ready", status, error: null });
  }

  private applyFailure(result: MpCallResult): MpAdminSnapshot {
    if (result.kind === "remote") {
      if (result.http === 401) {
        return this.set({
          phase: "signed-out",
          isAdmin: false,
          isModerator: false,
          status: null,
          error: "Your multiplayer session expired. Reconnect to continue.",
        });
      }
      if (result.http === 403) {
        // Belt and braces: the server refused even though the probe passed.
        return this.set({ phase: "denied", status: null, error: result.message });
      }
      if (result.http >= 500) {
        return this.set({ phase: "server-error", error: result.message });
      }
      return this.set({ phase: "server-error", error: result.message });
    }
    if (result.kind === "transport" && result.code === "session-unavailable") {
      return this.set({ phase: "offline", error: "The live-site session closed. Reconnect to continue." });
    }
    return this.set({ phase: "offline", error: "Multiplayer is unreachable. Check your connection and retry." });
  }
}
