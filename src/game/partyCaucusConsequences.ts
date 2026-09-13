import type { PartyCaucusEffect } from "@ahdclient/engine";

/**
 * Human-readable consequence lines for a party/caucus action (#61).
 *
 * Built only from the engine's own `PartyCaucusEffect` projection, so a panel
 * can state exactly what the action does on success — treasury, membership,
 * caucus and cooldown — before the player confirms. Money is printed with
 * deterministic thousands separators; the panel formats currency separately.
 * No engine runtime enters React: this module is consumed by the game layer,
 * which hands plain strings to the DTO.
 */

function groupThousands(value: number): string {
  const whole = Math.trunc(Math.abs(value));
  return whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function describePartyCaucusEffect(effect: PartyCaucusEffect): string[] {
  const lines: string[] = [];
  if (effect.partyFundsDelta < 0) {
    lines.push(`Charges ${groupThousands(effect.partyFundsDelta)} campaign funds`);
  } else if (effect.partyFundsDelta > 0) {
    lines.push(`Adds ${groupThousands(effect.partyFundsDelta)} campaign funds`);
  }
  switch (effect.partyMembership) {
    case "found": lines.push("Creates the party and joins you to it immediately"); break;
    case "join": lines.push("Joins you to this party"); break;
    case "leave": lines.push("Makes you independent"); break;
    default: break;
  }
  switch (effect.caucusMembership) {
    case "create": lines.push("Creates the caucus and makes you its first member"); break;
    case "join": lines.push("Joins you to this caucus"); break;
    case "leave": lines.push("Removes you from this caucus"); break;
    default: break;
  }
  if (effect.clearsCaucusMembership) {
    lines.push("Ends any caucus membership you hold");
  }
  if (effect.startsPartySwitchCooldown) {
    lines.push("Starts the 24-turn party-switch cooldown");
  }
  return lines;
}
