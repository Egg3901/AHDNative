import type { GameScreenProps } from "../game/types";
import { DetailQuery } from "./DetailQuery";
import { SectorsPanel } from "./SectorsPanel";

export function SectorsRoute({
  load,
  revision,
  busy,
  onSectorSale,
  onOpenCompany,
  onOpenRegion,
}: {
  load: GameScreenProps["loadMarkets"];
  revision: object;
  busy: boolean;
  onSectorSale?: GameScreenProps["onSectorSale"];
  /** Opens the linked company detail (the existing markets destination). */
  onOpenCompany: (listingId: string) => void;
  /** Opens the linked region detail (the existing regions destination). */
  onOpenRegion: (regionId: string) => void;
}) {
  return (
    <DetailQuery load={load} revision={revision} label="Sectors">
      {(markets) => (
        <SectorsPanel
          markets={markets}
          busy={busy}
          onSectorSale={onSectorSale}
          onOpenCompany={onOpenCompany}
          onOpenRegion={onOpenRegion}
        />
      )}
    </DetailQuery>
  );
}
