import type { PoliticsView, PoliticalMetricsView } from '../game/politics';
import { PoliticsPanel, PoliticalMetricsSection, type PoliticsPanelProps } from './PoliticsPanel';
import { DetailQuery } from './DetailQuery';

export function PoliticsRoute({ load, loadMetrics, revision, contextKey, ...panel }: Omit<PoliticsPanelProps, 'politics'> & {
  load: () => Promise<PoliticsView>; revision: object; contextKey?: string;
  loadMetrics?: () => Promise<PoliticalMetricsView>;
}) {
  if (panel.section === "metrics" && loadMetrics) return <DetailQuery load={loadMetrics} revision={revision} label="Political metrics" contextKey={contextKey}>
    {politics => <PoliticalMetricsSection politics={politics} nation={panel.nation} era={panel.era} onNavigate={panel.onNavigate} />}
  </DetailQuery>;
  return <DetailQuery load={load} revision={revision} label="Political details" retainOnRevision={panel.section === "politicians"} contextKey={contextKey}>
    {politics => <PoliticsPanel {...panel} politics={politics} />}
  </DetailQuery>;
}
