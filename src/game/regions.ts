/**
 * Detached country-scoped region directory plus one selected region detail.
 * projectRegions(WorldState, query?) never attaches WorldState. Browsing
 * another region does not change the player's home or country.
 *
 * Seat labels come from the country's legislature chambers. US congressional
 * fields (senate classes, census region) stay US-only. Office and seated
 * members appear only when the save records them.
 *
 * Chamber mapping mirrors packages/engine/src/government/constants.ts
 * LOWER_CHAMBER_PER_REGION / SUBNATIONAL_CHAMBER_PER_REGION, plus US house
 * and UK commons constituency counts stored on region.houseSeats.
 */
import type { WorldState } from "@ahdclient/engine";

export const REGION_DIRECTORY_PAGE_SIZE = 20;
export const REGION_ELECTION_PAGE_SIZE = 20;

/** houseSeats -> chamber key. US house and UK commons are per-region counts even when the race is national. */
const LOWER_SEAT_CHAMBER: Record<string, string> = {
  US: "house",
  UK: "commons",
  JP: "shugiin",
  DE: "bundestag",
  CN: "npc",
  BR: "chamber",
  IE: "dail",
};

/** senateSeats -> subnational chamber key. */
const SUBNATIONAL_SEAT_CHAMBER: Record<string, string> = {
  US: "stateSenate",
  UK: "regionalCouncil",
  RU: "republicSupremeSoviet",
  DD: "landAssembly",
  JP: "regionalCouncil",
  DE: "landtag",
  CN: "peoplesCongress",
  IE: "localCouncil",
};

export interface RegionsQuery {
  /** Selected region id. Ignored when it is not in the player's country. */
  regionId?: string | null;
  directoryQuery?: string;
  directoryPage?: number;
  directoryPageSize?: number;
  electionQuery?: string;
  electionStatus?: "upcoming" | "active" | "resolved";
  electionPage?: number;
  electionPageSize?: number;
}

export interface RegionPartyRef {
  id: string;
  name: string;
  abbreviation: string;
  color: string | null;
}

export interface RegionOfficialView {
  id: string | null;
  name: string;
  party: RegionPartyRef | null;
}

export interface RegionDirectoryRow {
  id: string;
  name: string;
  isHome: boolean;
  population: number | null;
  gdpMillions: number | null;
}

export interface RegionPartySupport {
  party: RegionPartyRef;
  organization: number;
  registration: number;
  chair: RegionOfficialView | null;
}

export interface RegionElectionView {
  id: string;
  electionType: string;
  status: string;
  cycle: number;
  startTurn: number;
  primaryEndTurn: number;
  endTurn: number;
  totalSeats: number;
  chamberKey: string;
  chamberName: string;
  candidateCount: number;
  previewNames: string[];
  winnerNames: string[];
}

export interface RegionOfficeView {
  kind: string;
  holder: RegionOfficialView | null;
  termStartTurn: number | null;
  availableActions: number | null;
  lastAddressTurn: number | null;
}

export interface RegionChamberMember {
  id: string;
  name: string;
  party: RegionPartyRef | null;
  senateClass: 1 | 2 | 3 | null;
}

export interface RegionChamberView {
  key: string;
  name: string;
  seats: number | null;
  elected: boolean;
  seatedCount: number;
  members: RegionChamberMember[];
}

export interface RegionBudgetLine {
  id: string;
  label: string;
  amount: number;
}

export interface RegionBudgetView {
  revenue: { councilTax: number; businessRates: number; grant: number; total: number };
  spending: RegionBudgetLine[];
  spendingTotal: number;
  balance: number;
  consecutiveDeficits: number;
}

export interface RegionEconomyView {
  gdpMillions: number | null;
  currency: string | null;
  budget: RegionBudgetView | null;
}

export interface RegionDemographicGroup {
  id: string;
  name: string;
  /** StateDemographics.groups.population share recorded on the save. */
  populationShare: number;
  economicLean: number;
  socialLean: number;
  turnout: number;
}

export interface RegionDemographicsView {
  votingEligiblePopulation: number | null;
  workingAgePopulation: number | null;
  militaryServicePopulation: number | null;
  laborForce: number | null;
  /** US census region only. Null for other countries even when the seed copies a grouping string. */
  censusRegion: string | null;
  independenceDesire: number | null;
  groups: RegionDemographicGroup[];
}

export interface RegionDetailView {
  id: string;
  name: string;
  countryId: string;
  countryName: string;
  isHome: boolean;
  population: number | null;
  currency: string | null;
  senateClasses: [1 | 2 | 3, 1 | 2 | 3] | null;
  economy: RegionEconomyView;
  demographics: RegionDemographicsView;
  partySupport: RegionPartySupport[];
  electoratePool: { independent: number; unregistered: number } | null;
  office: RegionOfficeView | null;
  chambers: RegionChamberView[];
  elections: RegionElectionView[];
  electionQuery: string;
  electionStatus: "all" | "upcoming" | "active" | "resolved";
  electionTotal: number;
  electionPage: number;
  electionPageSize: number;
  electionPageCount: number;
}

export interface RegionsView {
  era: string;
  turn: number;
  date: string;
  playerCountryId: string;
  playerCountryName: string;
  playerHomeRegionId: string | null;
  currency: string | null;
  directoryQuery: string;
  directoryPage: number;
  directoryPageSize: number;
  directoryTotal: number;
  directoryPageCount: number;
  directory: RegionDirectoryRow[];
  selected: RegionDetailView | null;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clampPage(page: number, pageCount: number): number {
  if (pageCount <= 0) return 0;
  if (!Number.isFinite(page) || page < 0) return 0;
  return Math.min(Math.trunc(page), pageCount - 1);
}

function pageSize(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) return fallback;
  return Math.min(Math.trunc(value), 100);
}

function normalize(text: string): string {
  return text.trim().toLocaleLowerCase();
}

function humanize(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^\w/, (char) => char.toUpperCase());
}

function homeCurrency(world: WorldState, countryId: string): string | null {
  return world.budgets?.[countryId]?.currencyCode ?? world.exchangeRates?.[countryId]?.currencyCode ?? null;
}

function partyRef(world: WorldState, partyId: string | null | undefined): RegionPartyRef | null {
  if (!partyId) return null;
  const party = world.parties[partyId];
  return {
    id: partyId,
    name: party?.name ?? partyId,
    abbreviation: party?.abbreviation ?? partyId,
    color: party?.color ?? null,
  };
}

function officialRef(
  world: WorldState,
  officialId: string | null | undefined,
  fallbackPartyId?: string | null,
): RegionOfficialView | null {
  if (!officialId) return null;
  if (officialId === "player") {
    return {
      id: officialId,
      name: world.player.name,
      party: partyRef(world, world.player.partyId) ?? partyRef(world, fallbackPartyId),
    };
  }
  const politician = world.politicians.find((candidate) => candidate.id === officialId);
  return {
    id: officialId,
    name: politician?.name ?? officialId,
    party: partyRef(world, politician?.partyId) ?? partyRef(world, fallbackPartyId),
  };
}

function politicianName(world: WorldState, id: string): string {
  if (id === "player") return world.player.name;
  return world.politicians.find((politician) => politician.id === id)?.name ?? id;
}

function chamberName(world: WorldState, countryId: string, chamberKey: string): string {
  const named = world.legislatures[countryId]?.chambers.find((chamber) => chamber.key === chamberKey)?.name;
  return named ?? humanize(chamberKey);
}

function projectOffice(world: WorldState, regionId: string): RegionOfficeView | null {
  const office = world.governors?.[regionId];
  if (!office) return null;
  const holder = officialRef(world, office.governorId, office.governorParty) ?? (
    office.governorName
      ? { id: null, name: office.governorName, party: partyRef(world, office.governorParty) }
      : null
  );
  return {
    kind: "governor",
    holder,
    termStartTurn: finiteOrNull(office.termStartTurn),
    availableActions: finiteOrNull(office.gubernatorialActions),
    lastAddressTurn: finiteOrNull(office.lastAddressTurn),
  };
}

function projectBudget(world: WorldState, regionId: string): RegionBudgetView | null {
  const budget = world.regionalBudgets?.[regionId];
  if (!budget) return null;
  const spending = Object.entries(budget.spending.byCategory)
    .filter(([, amount]) => Number.isFinite(amount))
    .map(([id, amount]) => ({ id, label: humanize(id), amount }))
    .sort((left, right) => right.amount - left.amount || left.id.localeCompare(right.id));
  return {
    revenue: {
      councilTax: budget.revenue.councilTax,
      businessRates: budget.revenue.businessRates,
      grant: budget.revenue.grant,
      total: budget.revenue.total,
    },
    spending,
    spendingTotal: budget.spending.total,
    balance: budget.balance,
    consecutiveDeficits: budget.consecutiveDeficits,
  };
}

function groupName(world: WorldState, countryId: string, groupId: string): string {
  for (const category of world.demographicCategories?.[countryId] ?? []) {
    const named = category.groups.find((group) => group.id === groupId)?.name;
    if (named) return named;
  }
  return humanize(groupId);
}

function projectDemographics(world: WorldState, region: WorldState["regions"][string]): RegionDemographicsView {
  const table = world.stateDemographics?.[region.id];
  const groups = table
    ? Object.entries(table.groups)
        .filter(([, group]) => Number.isFinite(group.population))
        .map(([id, group]) => ({
          id,
          name: groupName(world, region.countryId, id),
          populationShare: group.population,
          economicLean: group.economicLean,
          socialLean: group.socialLean,
          turnout: group.turnout,
        }))
        .sort((left, right) => right.populationShare - left.populationShare || left.id.localeCompare(right.id))
    : [];
  return {
    votingEligiblePopulation: finiteOrNull(region.votingEligiblePopulation),
    workingAgePopulation: finiteOrNull(region.workingAgePopulation),
    militaryServicePopulation: finiteOrNull(region.militaryServicePopulation),
    laborForce: finiteOrNull(world.laborForces?.[region.id]),
    censusRegion: region.countryId === "US" ? (region.censusRegion ?? null) : null,
    independenceDesire: finiteOrNull(region.independenceDesire),
    groups,
  };
}

function projectPartySupport(world: WorldState, countryId: string, regionId: string): RegionPartySupport[] {
  return Object.values(world.partyRegions)
    .filter((row) => row.regionId === regionId && row.countryId === countryId)
    .map((row) => {
      const party = partyRef(world, row.partyId);
      if (!party || !Number.isFinite(row.organization) || !Number.isFinite(row.registration)) return null;
      return {
        party,
        organization: row.organization,
        registration: row.registration,
        chair: officialRef(world, row.chairId ?? null, row.partyId),
      };
    })
    .filter((row): row is RegionPartySupport => row !== null)
    .sort((left, right) => right.organization - left.organization || left.party.id.localeCompare(right.party.id));
}

function projectChambers(world: WorldState, region: WorldState["regions"][string]): RegionChamberView[] {
  const countryId = region.countryId;
  const legislature = world.legislatures[countryId];
  const byKey = new Map<string, { name: string; seats: number | null; elected: boolean }>();
  const take = (key: string, seats: number | null) => {
    const chamber = legislature?.chambers.find((entry) => entry.key === key);
    if (!chamber) return;
    byKey.set(key, { name: chamber.name, seats, elected: chamber.elected });
  };

  const lowerKey = LOWER_SEAT_CHAMBER[countryId];
  const houseSeats = finiteOrNull(region.houseSeats);
  if (lowerKey && houseSeats !== null) take(lowerKey, houseSeats);

  const subKey = SUBNATIONAL_SEAT_CHAMBER[countryId];
  const senateSeats = finiteOrNull(region.senateSeats);
  if (subKey && senateSeats !== null) take(subKey, senateSeats);

  if (countryId === "US" && region.senateClasses) take("senate", 2);

  const membersByChamber = new Map<string, RegionChamberMember[]>();
  for (const politician of world.politicians) {
    if (politician.countryId !== countryId || politician.electedState !== region.id || !politician.chamberKey) continue;
    const list = membersByChamber.get(politician.chamberKey) ?? [];
    list.push({
      id: politician.id,
      name: politician.name,
      party: partyRef(world, politician.partyId),
      senateClass: countryId === "US" && politician.senateClass ? politician.senateClass : null,
    });
    membersByChamber.set(politician.chamberKey, list);
    if (!byKey.has(politician.chamberKey)) {
      const chamber = legislature?.chambers.find((entry) => entry.key === politician.chamberKey);
      byKey.set(politician.chamberKey, {
        name: chamber?.name ?? humanize(politician.chamberKey),
        seats: null,
        elected: chamber?.elected ?? true,
      });
    }
  }

  const playerSeat = world.player.legislativeSeat;
  if (playerSeat && playerSeat.countryId === countryId) {
    const playerMember = playerMemberForRegion(world, region, playerSeat.chamberKey);
    if (playerMember) {
      const members = membersByChamber.get(playerSeat.chamberKey) ?? [];
      if (!members.some((member) => member.id === playerMember.id)) members.push(playerMember);
      membersByChamber.set(playerSeat.chamberKey, members);
      if (!byKey.has(playerSeat.chamberKey)) {
        const chamber = legislature?.chambers.find((entry) => entry.key === playerSeat.chamberKey);
        byKey.set(playerSeat.chamberKey, {
          name: chamber?.name ?? humanize(playerSeat.chamberKey),
          seats: null,
          elected: chamber?.elected ?? true,
        });
      }
    }
  }

  for (const members of membersByChamber.values()) {
    members.sort((left, right) => (left.senateClass ?? 0) - (right.senateClass ?? 0) || left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  }

  const order = legislature?.chambers.map((chamber) => chamber.key) ?? [];
  return [...byKey.entries()]
    .sort((left, right) => {
      const leftIndex = order.indexOf(left[0]);
      const rightIndex = order.indexOf(right[0]);
      const leftRank = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
      const rightRank = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
      return leftRank - rightRank || left[0].localeCompare(right[0]);
    })
    .map(([key, meta]) => {
      const members = membersByChamber.get(key) ?? [];
      return {
        key,
        name: meta.name,
        seats: meta.seats,
        elected: meta.elected,
        seatedCount: members.length,
        members,
      };
    });
}

function projectElection(world: WorldState, election: WorldState["elections"][number]): RegionElectionView {
  return {
    id: election.id,
    electionType: election.electionType,
    status: election.status,
    cycle: election.cycle,
    startTurn: election.startTurn,
    primaryEndTurn: election.primaryEndTurn,
    endTurn: election.endTurn,
    totalSeats: election.totalSeats,
    chamberKey: election.chamberKey,
    chamberName: chamberName(world, election.countryId, election.chamberKey),
    candidateCount: election.candidates.length,
    previewNames: election.candidates.slice(0, 3).map((candidate) => candidate.name),
    winnerNames: (election.winners ?? []).map((winnerId) => politicianName(world, winnerId)),
  };
}

function playerMemberForRegion(
  world: WorldState,
  region: WorldState["regions"][string],
  chamberKey: string,
): RegionChamberMember | null {
  const seat = world.player.legislativeSeat;
  if (!seat || seat.countryId !== region.countryId || seat.chamberKey !== chamberKey) return null;
  // Player seats do not carry a state id. Use the latest resolved player win
  // for this country and chamber as the only persisted regional provenance.
  const winningRace = world.elections
    .filter((election) =>
      election.status === "resolved" &&
      election.countryId === seat.countryId &&
      election.chamberKey === seat.chamberKey &&
      election.winners?.includes("player"),
    )
    .sort((left, right) =>
      (right.resolvedTurn ?? right.endTurn) - (left.resolvedTurn ?? left.endTurn) ||
      right.endTurn - left.endTurn ||
      right.startTurn - left.startTurn ||
      right.id.localeCompare(left.id),
    )[0];
  if (!winningRace || winningRace.state !== region.id) return null;
  return {
    id: "player",
    name: world.player.name,
    party: partyRef(world, world.player.partyId),
    senateClass: region.countryId === "US" && winningRace.senateClass ? winningRace.senateClass : null,
  };
}

function projectDetail(
  world: WorldState,
  region: WorldState["regions"][string],
  query: RegionsQuery,
  homeId: string | null,
): RegionDetailView {
  const countryId = region.countryId;
  const currency = homeCurrency(world, countryId);
  const electionQuery = typeof query.electionQuery === "string" ? query.electionQuery.trim() : "";
  const electionStatus = query.electionStatus;
  const needle = normalize(electionQuery);
  const matched = world.elections
    .filter((election) => election.countryId === countryId && election.state === region.id)
    .filter((election) => !electionStatus || election.status === electionStatus)
    .filter((election) => {
      if (!needle) return true;
      const chamber = chamberName(world, countryId, election.chamberKey);
      const haystack = `${election.id} ${election.electionType} ${election.status} ${election.chamberKey} ${chamber}`.toLocaleLowerCase();
      return haystack.includes(needle);
    })
    .sort((left, right) => left.startTurn - right.startTurn || left.id.localeCompare(right.id));

  const size = pageSize(query.electionPageSize, REGION_ELECTION_PAGE_SIZE);
  const pageCount = matched.length === 0 ? 0 : Math.ceil(matched.length / size);
  const page = clampPage(query.electionPage ?? 0, pageCount);
  const electorate = world.electoratePools?.[region.id];
  const independent = finiteOrNull(electorate?.independent);
  const unregistered = finiteOrNull(electorate?.unregistered);
  const senateClasses = countryId === "US" && region.senateClasses
    ? [region.senateClasses[0], region.senateClasses[1]] as [1 | 2 | 3, 1 | 2 | 3]
    : null;

  return {
    id: region.id,
    name: region.name,
    countryId,
    countryName: world.countries[countryId]?.name ?? countryId,
    isHome: homeId === region.id,
    population: finiteOrNull(region.population),
    currency,
    senateClasses,
    economy: {
      gdpMillions: finiteOrNull(region.gdp),
      currency,
      budget: projectBudget(world, region.id),
    },
    demographics: projectDemographics(world, region),
    partySupport: projectPartySupport(world, countryId, region.id),
    electoratePool: independent !== null && unregistered !== null ? { independent, unregistered } : null,
    office: projectOffice(world, region.id),
    chambers: projectChambers(world, region),
    elections: matched.slice(page * size, page * size + size).map((election) => projectElection(world, election)),
    electionQuery,
    electionStatus: electionStatus ?? "all",
    electionTotal: matched.length,
    electionPage: page,
    electionPageSize: size,
    electionPageCount: Math.max(pageCount, 1),
  };
}

/** Projects a detached, country-scoped region directory and one selected region. */
export function projectRegions(world: WorldState, query: RegionsQuery = {}): RegionsView {
  const playerCountry = world.countries[world.player.countryId];
  if (!playerCountry) throw new Error("The save does not contain the player's country.");
  const countryId = playerCountry.id;
  const homeId = typeof world.player.homeRegionId === "string" && world.player.homeRegionId.length > 0
    ? world.player.homeRegionId
    : null;
  const countryRegions = Object.values(world.regions)
    .filter((region) => region.countryId === countryId)
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));

  const directoryQuery = typeof query.directoryQuery === "string" ? query.directoryQuery.trim() : "";
  const needle = normalize(directoryQuery);
  const matched = countryRegions.filter((region) => {
    if (!needle) return true;
    return `${region.name} ${region.id}`.toLocaleLowerCase().includes(needle);
  });
  const size = pageSize(query.directoryPageSize, REGION_DIRECTORY_PAGE_SIZE);
  const pageCount = matched.length === 0 ? 0 : Math.ceil(matched.length / size);
  const page = clampPage(query.directoryPage ?? 0, pageCount);

  const requested = typeof query.regionId === "string" && query.regionId.length > 0 ? query.regionId : null;
  const selectedRegion = (requested && countryRegions.find((region) => region.id === requested))
    ?? (homeId ? countryRegions.find((region) => region.id === homeId) : undefined)
    ?? countryRegions[0]
    ?? null;

  return {
    era: world.meta.era,
    turn: world.meta.turn,
    date: world.meta.date,
    playerCountryId: countryId,
    playerCountryName: playerCountry.name,
    playerHomeRegionId: homeId && countryRegions.some((region) => region.id === homeId) ? homeId : null,
    currency: homeCurrency(world, countryId),
    directoryQuery,
    directoryPage: page,
    directoryPageSize: size,
    directoryTotal: matched.length,
    directoryPageCount: Math.max(pageCount, 1),
    directory: matched.slice(page * size, page * size + size).map((region) => ({
      id: region.id,
      name: region.name,
      isHome: homeId === region.id,
      population: finiteOrNull(region.population),
      gdpMillions: finiteOrNull(region.gdp),
    })),
    selected: selectedRegion ? projectDetail(world, selectedRegion, query, homeId) : null,
  };
}
