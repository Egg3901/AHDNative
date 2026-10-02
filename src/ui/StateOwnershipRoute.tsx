import type { GameScreenProps } from "../game/types";
import { DetailQuery } from "./DetailQuery";
import { MarketsRoute } from "./MarketsRoute";

/** Source country entry resolves a National Corporation and opens Register. */
export function StateOwnershipRoute({ load, loadMarkets, revision, contextKey, busy, onAction, onSectorSale, onOpenCompany }: {
  load: NonNullable<GameScreenProps["loadStateOwnership"]>;
  loadMarkets: GameScreenProps["loadMarkets"];
  revision: object;
  contextKey?: string;
  busy: boolean;
  onAction: GameScreenProps["onAction"];
  onSectorSale?: GameScreenProps["onSectorSale"];
  onOpenCompany: (id: string) => void;
}) {
  return <DetailQuery load={load} revision={revision} contextKey={contextKey} label="State ownership">
    {ownership => ownership.nationalCorporationId ? <MarketsRoute load={loadMarkets} loadStateOwnership={load}
      revision={revision} initialId={ownership.nationalCorporationId} initialCompanyTab="register" hideBrowseBack
      busy={busy} onAction={onAction} onSectorSale={onSectorSale} onOpenCompany={onOpenCompany} />
      : <p role="note" className="ahd-muted">No National Corporation is recorded in {ownership.countryName}.</p>}
  </DetailQuery>;
}
