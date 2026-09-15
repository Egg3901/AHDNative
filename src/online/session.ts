import { ONLINE_URL } from "./navigation";

export interface OnlineSessionHost {
  openDedicatedWindow: (destination: OnlineDestination) => Promise<void>;
}

export type OnlineDestination = "home" | "settings" | "feedback";

export type OnlineSessionResult =
  | { status: "opened" }
  | { status: "failed"; message: string };

export async function openOnlineSession(host: OnlineSessionHost, destination: OnlineDestination = "home"): Promise<OnlineSessionResult> {
  try {
    await host.openDedicatedWindow(destination);
    return { status: "opened" };
  } catch {
    return {
      status: "failed",
      message: "Multiplayer could not open. Check your connection and try again.",
    };
  }
}

export function tauriOnlineSessionHost(): OnlineSessionHost {
  return {
    openDedicatedWindow: async (destination) => {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_online_window", { destination });
    },
  };
}

export { ONLINE_URL };
