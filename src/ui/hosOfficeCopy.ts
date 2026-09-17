/**
 * HoS banner copy (#240 slice).
 *
 * The in-world GameScreen banner derives its office/system text from the
 * already-projected `player.currentOffice` type string only
 * (`player.currentOffice?.type ?? null` in `src/game/session.ts`, seated from
 * the generated `EXECUTIVE_OFFICE_BY_COUNTRY` registry in
 * `packages/engine/src/world.ts`). No schema change: no new persisted or
 * projected field.
 *
 * Office titles follow the AHDGame office-type labels
 * (`src/lib/constants/countries.ts`: "President", "Prime Minister",
 * "Chancellor", "Taoiseach", "First Minister", "Premier",
 * "General Secretary", "First Secretary") rendered in the same sentence case
 * as `HosOfficeMark`. The system bucket follows the AHDGame `governmentType`:
 * parliamentary offices (parliamentaryRepublic / parliamentaryMonarchy) read
 * "Parliamentary executive", one-party offices (onePartyState:
 * generalSecretary, firstSecretary, premier) read "One-party executive", and
 * only "president" reads "Presidential executive". Unknown or missing offices
 * keep the neutral "executive office" fallback and never claim a presidential
 * system.
 */

export interface HosOfficeCopy {
  /** Human office title for the banner heading ("Chancellor", "executive office"). */
  title: string;
  /** One-line system description naming how the office governs. */
  system: string;
}

const OFFICE_TITLES: Record<string, string> = {
  president: "President",
  primeMinister: "Prime minister",
  chancellor: "Chancellor",
  taoiseach: "Taoiseach",
  firstMinister: "First minister",
  premier: "Premier",
  generalSecretary: "General secretary",
  firstSecretary: "First secretary",
};

/** AHDGame parliamentaryRepublic / parliamentaryMonarchy executives. */
const PARLIAMENTARY_OFFICES = new Set(["primeMinister", "chancellor", "taoiseach", "firstMinister"]);

/** AHDGame onePartyState executives. */
const ONE_PARTY_OFFICES = new Set(["generalSecretary", "firstSecretary", "premier"]);

export function hosOfficeCopy(office: string | null | undefined): HosOfficeCopy {
  const title = (typeof office === "string" && OFFICE_TITLES[office]) || "executive office";
  if (office === "president") {
    return { title, system: "Presidential executive: you occupy the national president record." };
  }
  if (typeof office === "string" && PARLIAMENTARY_OFFICES.has(office)) {
    return { title, system: `Parliamentary executive: you govern through the appointed ${title.toLowerCase()} office.` };
  }
  if (typeof office === "string" && ONE_PARTY_OFFICES.has(office)) {
    return { title, system: "One-party executive: you govern through the ruling party and legislature-appointment system." };
  }
  return { title, system: "Executive office: you occupy the national executive record." };
}
