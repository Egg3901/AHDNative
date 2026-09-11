/**
 * Source-backed market sentiment available in Native's offline world.
 *
 * AHDGame's live price pass uses event pulses plus HQ investor confidence.
 * Native does not have the wall-clock `sentimentPulses` collection, but it
 * does persist the country budget's investor-confidence value. This adapter
 * ports that stable input and remains neutral when an old save has no value.
 * Source: AHDGame `src/lib/corporations/sentimentEngine.ts`.
 */

export const HQ_CONFIDENCE_BASELINE = 60;
export const HQ_CONFIDENCE_SENTIMENT_CAP = 0.12;

export function getInvestorConfidenceSentiment(confidence: number | null | undefined): number {
  if (confidence == null || !Number.isFinite(confidence)) return 1;
  const deviation = (confidence - HQ_CONFIDENCE_BASELINE) * 0.003;
  return 1 + Math.max(-HQ_CONFIDENCE_SENTIMENT_CAP, Math.min(HQ_CONFIDENCE_SENTIMENT_CAP, deviation));
}
