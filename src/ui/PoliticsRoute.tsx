import type { PoliticsView } from '../game/politics';
import { PoliticsPanel, type PoliticsPanelProps } from './PoliticsPanel';
import { DetailQuery } from './DetailQuery';

export function PoliticsRoute({ load, revision, ...panel }: Omit<PoliticsPanelProps, 'politics'> & {
  load: () => Promise<PoliticsView>; revision: object;
}) {
  return <DetailQuery load={load} revision={revision} label="Political details">
    {politics => <PoliticsPanel {...panel} politics={politics} />}
  </DetailQuery>;
}
