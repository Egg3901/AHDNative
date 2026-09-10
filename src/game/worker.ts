/// <reference lib="webworker" />
import { GameSession, gameChoices } from "./session";
import type { GameRequest, GameResponse } from "./protocol";

const session = new GameSession();
self.addEventListener("message", (event: MessageEvent<GameRequest>) => {
  const { id, command } = event.data;
  try {
    let value: unknown;
    switch (command.type) {
      case "choices": value = gameChoices(); break;
      case "create": value = session.create(command.options); break;
      case "legislation": value = session.legislation(command.selection); break;
      case "worldOverview": value = session.worldOverview(); break;
      case "search": value = session.search(command.query); break;
      case "markets": value = session.markets(); break;
      case "politics": value = session.politics(); break;
      case "view": value = session.view(); break;
      case "advance": value = session.advance(); break;
      case "action": value = { result: session.act(command.actionId, command.params), view: session.view() }; break;
      case "serialize": value = session.serialize(command.savedAt); break;
      case "load": value = session.load(command.contents); break;
      default: throw new Error("Unknown game command.");
    }
    self.postMessage({ id, ok: true, value } satisfies GameResponse);
  } catch (error) {
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : "The game operation failed." } satisfies GameResponse);
  }
});
