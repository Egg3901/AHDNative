/** Source `src/lib/elections/presidentialRuleset.ts` general-vote gates. */
export const CURRENT_PRESIDENTIAL_RULESET_VERSION = 3;

export function presidentialRulesetVersionFor(
  race: { presidentialRulesetVersion?: number | null } | null | undefined,
): number {
  const version = race?.presidentialRulesetVersion;
  if (version == null) return 1; // Game's absent stamp means v1.
  return version === 1 || version === 2 ? version : CURRENT_PRESIDENTIAL_RULESET_VERSION;
}

export function appliesExplicitPresidentialLean(version: number): boolean {
  return version === 1 || version === 2;
}
