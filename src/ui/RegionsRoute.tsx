import { useCallback, useState } from "react";
import type { RegionsQuery, RegionsView } from "../game/regions";
import { DetailQuery } from "./DetailQuery";
import { RegionsPanel } from "./RegionsPanel";

export function RegionsRoute({ load, revision, busy, initialId }: {
  load: (query?: RegionsQuery) => Promise<RegionsView>; revision: object; busy: boolean;
  /** Region to open on mount, e.g. from a search result; browsing does not change home. */
  initialId?: string;
}) {
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [query, setQuery] = useState<RegionsQuery>(initialId ? { regionId: initialId } : {});
  const request = useCallback(() => load(query), [load, query]);
  return <DetailQuery load={request} revision={revision} label="Regions">
    {view => <RegionsPanel query={view} onQueryChange={setQuery} busy={busy} directoryOpen={directoryOpen} onDirectoryOpenChange={setDirectoryOpen} />}
  </DetailQuery>;
}
