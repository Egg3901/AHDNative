// Public routes mirrored from AHDGame HelpDropdown at pinned revision
// e364c04954ed628beef73a993a8e9e156650a31e. Native keeps both the wiki and
// guides reachable because only the authenticated web surface knows wikiDisabled.
export const SUPPORT_DESTINATIONS = [
  { id: "wiki", label: "Wiki", url: "https://wiki.ahousedividedgame.com" },
  { id: "guides", label: "Game guides", url: "https://ahousedividedgame.com/guides" },
  { id: "about", label: "About A House Divided", url: "https://ahousedividedgame.com/about" },
  { id: "discord", label: "Discord community", url: "https://discord.gg/DmF8zJJuqN" },
  { id: "patreon", label: "Support the game", url: "https://www.patreon.com/cw/AHouseDividedGame/membership" },
  { id: "supporters", label: "Supporter wall", url: "https://lakesidegames.net/supporters" },
  { id: "email", label: "Email support", url: "mailto:admin@ahousedividedgame.com" },
  { id: "status", label: "Service status", url: "https://ops.ahousedividedgame.com/status" },
] as const;

export type SupportDestination = typeof SUPPORT_DESTINATIONS[number]["id"];

export async function openSupportDestination(destination: SupportDestination): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("open_external_destination", { destination });
}
