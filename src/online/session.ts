import { ONLINE_URL } from "./navigation";

export interface OnlineSessionHost {
  openDedicatedWindow: () => Promise<void>;
}

export type OnlineSessionResult =
  | { status: "opened" }
  | { status: "failed"; message: string };

export async function openOnlineSession(host: OnlineSessionHost): Promise<OnlineSessionResult> {
  try {
    await host.openDedicatedWindow();
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
    openDedicatedWindow: async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_online_window");
    },
  };
}

export { ONLINE_URL };
