/// <reference lib="webworker" />
import { GameSession, gameChoices, creationChoices } from "./session";
import type { GameRequest, GameResponse } from "./protocol";

const session = new GameSession();
self.addEventListener("message", (event: MessageEvent<GameRequest>) => {
  const { id, command } = event.data;
  try {
    let value: unknown;
    switch (command.type) {
      case "choices": value = gameChoices(); break;
      case "creationChoices": value = creationChoices(command.era, command.countryId); break;
      case "create": value = session.create(command.options); break;
      case "legislation": value = session.legislation(command.selection); break;
      case "worldOverview": value = session.worldOverview(); break;
      case "hallOfFame": value = session.hallOfFame(command.query); break;
      case "search": value = session.search(command.query, command.filter); break;
      case "bondMarket": value = session.bondMarket(); break;
      case "regions": value = session.regions(command.query); break;
      case "cabinetOffice": value = session.cabinetOffice(); break;
      case "issueCabinetOrder": value = session.issueCabinetOrder({ positionId: command.positionId, orderId: command.orderId, ...(command.targetRegionId ? { targetRegionId: command.targetRegionId } : {}) }); break;
      case "caucusManagement": value = session.caucusManagement(); break;
      case "partyManagement": value = session.partyManagement(); break;
      case "markets": value = session.markets(); break;
      case "unionManagement": value = session.unionManagement(); break;
      case "politics": value = session.politics(); break;
      case "profile": value = session.profile(); break;
      case "profileDestination": value = session.profileDestination(); break;
      case "imperialProfile": value = session.imperialProfile(); break;
      case "updateProfile": value = session.updateProfile(command.update); break;
      case "allocateStats": value = session.allocateStats(command.stats); break;
      case "reallocateStats": value = session.reallocateStats(command.stats); break;
      case "selectConstituency": value = session.selectConstituency(command.constituencyId); break;
      case "worldFeatureFlags": value = session.updateWorldFeatureFlags(command.flags); break;
      case "view": value = session.view(); break;
      case "advance": value = session.advance(); break;
      case "action": value = { result: session.act(command.actionId, command.params), view: session.view() }; break;
      case "sectorSale": {
        const result = command.op === "list"
          ? session.listSectorForSale(command.assetId)
          : command.op === "update"
            ? session.updateSectorListing(command.assetId, command.priceAnchor)
            : command.op === "buy"
              ? session.buySectorForSale(command.assetId)
              : session.unlistSectorForSale(command.assetId);
        value = { result, view: session.view() };
        break;
      }
      case "unionCommand": {
        const result = command.op === "organize"
          ? session.organizeUnion(command.unionId)
          : command.op === "organizeSector"
            ? session.organizeUnionSector(command.unionId, command.assetId)
            : command.op === "dues"
              ? session.setUnionDues(command.unionId, command.duesPerWorkerAnnual)
          : command.op === "vote"
            ? session.castUnionLeadershipVote(command.unionId)
            : command.op === "accept"
              ? session.acceptUnionLeadership(command.unionId)
              : command.op === "call"
              ? session.callUnionBargaining(command.unionId, command.employerId, command.terms)
                : command.op === "move"
                  ? session.moveUnionBargaining(command.campaignId, command.action, command.terms)
                  : session.castUnionRatificationBallot(command.campaignId, command.vote);
        value = { result, view: session.view() };
        break;
      }
      case "serialize": value = session.serialize(command.savedAt, command.includeSaveNotice); break;
      case "load": value = session.load(command.contents); break;
      case "notificationsRead": value = session.markNotificationRead(command.id); break;
      case "notificationsDelete": value = session.deleteNotification(command.id); break;
      case "notificationsReadAll": value = session.markAllNotificationsRead(); break;
      case "notificationsSaved": value = session.recordSave(); break;
      default: throw new Error("Unknown game command.");
    }
    self.postMessage({ id, ok: true, value } satisfies GameResponse);
  } catch (error) {
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : "The game operation failed." } satisfies GameResponse);
  }
});
