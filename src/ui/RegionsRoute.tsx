import { useCallback, useState } from "react";
import type { RegionsQuery, RegionsView } from "../game/regions";
import { DetailQuery } from "./DetailQuery";
import { RegionsPanel } from "./RegionsPanel";

export function RegionsRoute({ load, revision, busy }: {
  load: (query?: RegionsQuery) => Promise<RegionsView>; revision: object; busy: boolean;
}) {
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [query, setQuery] = useState<RegionsQuery>({});
  const request = useCallback(() => load(query), [load, query]);
  return <DetailQuery load={request} revision={revision} label="Regions">
    {view => <RegionsPanel query={view} onQueryChange={setQuery} busy={busy} directoryOpen={directoryOpen} onDirectoryOpenChange={setDirectoryOpen} />}
  </DetailQuery>;
}
