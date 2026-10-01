import type { PoliticsView } from '../game/politics';
import { PoliticsPanel, type PoliticsPanelProps } from './PoliticsPanel';
import { DetailQuery } from './DetailQuery';

export function PoliticsRoute({ load, revision, contextKey, ...panel }: Omit<PoliticsPanelProps, 'politics'> & {
  load: () => Promise<PoliticsView>; revision: object; contextKey?: string;
}) {
  return <DetailQuery load={load} revision={revision} label="Political details" retainOnRevision={panel.section === "politicians"} contextKey={contextKey}>
    {politics => <PoliticsPanel {...panel} politics={politics} />}
  </DetailQuery>;
}
