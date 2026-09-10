import type { RegimeClassification, WorldState } from "@ahdclient/engine";

export interface WorldPartyRef {
  id: string;
  name: string;
  abbreviation: string;
  color: string | null;
}

export interface WorldEconomyView {
  /** Country.economy.gdp, in millions of the engine's in-game dollars. */
  gdpMillions: number;
  /** Annualized rate stored as a fraction. */
  growthRate: number;
  /** Annualized rate stored as a fraction. */
  inflationRate: number;
  /** Annualized rate stored as a fraction. */
  unemploymentRate: number;
  /** Output gap stored as percentage points. */
  outputGap: number;
}

export interface WorldOfficialView {
  id: string | null;
  name: string;
  party: WorldPartyRef | null;
}

export interface WorldChamberPartySeats {
  party: WorldPartyRef;
  seats: number;
}

export interface WorldChamberView {
  key: string;
  name: string;
  shortName: string;
  seats: number;
  elected: boolean;
  vacancies: number;
  seatsByParty: WorldChamberPartySeats[];
}

export interface WorldLegislatureView {
  name: string;
  bicameral: boolean;
  chambers: WorldChamberView[];
}

export interface WorldExecutiveView {
  president: WorldOfficialView | null;
  vicePresident: WorldOfficialView | null;
  termStartTurn: number | null;
}

export interface WorldGovernmentView {
  /** CountryPoliticalOverview values, when that record exists. */
  governmentType: string | null;
  regime: RegimeClassification | null;
  approval: number | null;
  legitimacy: number | null;
  unrest: number | null;
  /** GovernmentState values, when a government has been formed. */
  status: "pending" | "formed" | null;
  formationType: "majority" | "coalition" | "minority" | null;
  confidence: number | null;
  governingParty: WorldPartyRef | null;
  headOfGovernment: WorldOfficialView | null;
  executive: WorldExecutiveView | null;
  legislature: WorldLegislatureView | null;
}

export interface WorldNationView {
  id: string;
  name: string;
  playable: boolean;
  /** Currency code from the country's budget or exchange-rate record. */
  currency: string | null;
  economy: WorldEconomyView;
  government: WorldGovernmentView;
}

export interface WorldRegionPartySupport {
  party: WorldPartyRef;
  /** PartyRegion.organization, stored as a percentage value. */
  organization: number;
  /** PartyRegion.registration, stored as a percentage value. */
  registration: number;
}

export interface WorldRegionElectionCandidate {
  id: string;
  name: string;
  party: WorldPartyRef | null;
  incumbent: boolean;
}

export interface WorldRegionElectionView {
  id: string;
  electionType: string;
  status: string;
  cycle: number;
  startTurn: number;
  primaryEndTurn: number;
  endTurn: number;
  totalSeats: number;
  chamberKey: string;
  candidates: WorldRegionElectionCandidate[];
  winnerNames: string[];
}

export interface WorldRegionOfficeView {
  kind: "governor";
  holder: WorldOfficialView | null;
  termStartTurn: number | null;
  availableActions: number | null;
  lastAddressTurn: number | null;
}

export interface WorldRegionView {
  id: string;
  name: string;
  countryId: string;
  /** Optional fields stay null when the region source does not provide them. */
  population: number | null;
  gdpMillions: number | null;
  houseSeats: number | null;
  senateSeats: number | null;
  senateClasses: [1 | 2 | 3, 1 | 2 | 3] | null;
  censusRegion: string | null;
  votingEligiblePopulation: number | null;
  workingAgePopulation: number | null;
  militaryServicePopulation: number | null;
  partySupport: WorldRegionPartySupport[];
  electoratePool: { independent: number; unregistered: number } | null;
  elections: WorldRegionElectionView[];
  office: WorldRegionOfficeView | null;
}

export interface WorldOverviewView {
  era: string;
  turn: number;
  date: string;
  playerCountryId: string;
  playerHomeRegionId: string | null;
  nations: WorldNationView[];
  homeRegion: WorldRegionView | null;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function partyRef(world: WorldState, partyId: string | null | undefined): WorldPartyRef | null {
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
): WorldOfficialView | null {
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

function projectLegislature(world: WorldState, countryId: string): WorldLegislatureView | null {
  const legislature = world.legislatures[countryId];
  if (!legislature) return null;
  return {
    name: legislature.name,
    bicameral: legislature.bicameral,
    chambers: legislature.chambers.map((chamber) => ({
      key: chamber.key,
      name: chamber.name,
      shortName: chamber.shortName,
      seats: chamber.seats,
      elected: chamber.elected,
      vacancies: chamber.composition.vacancies,
      seatsByParty: Object.entries(chamber.composition.seatsByParty)
        .filter(([, seats]) => Number.isFinite(seats))
        .map(([partyId, seats]) => {
          const party = partyRef(world, partyId);
          return party ? { party, seats } : null;
        })
        .filter((row): row is WorldChamberPartySeats => row !== null)
        .sort((left, right) => right.seats - left.seats || left.party.id.localeCompare(right.party.id)),
    })),
  };
}

function projectGovernment(world: WorldState, countryId: string): WorldGovernmentView {
  const politics = world.countryPolitics?.[countryId];
  const government = world.governments?.[countryId];
  const executive = world.executives?.[countryId];
  return {
    governmentType: politics?.governmentType ?? null,
    regime: politics?.regime ?? null,
    approval: finiteOrNull(politics?.approval),
    legitimacy: finiteOrNull(politics?.legitimacy),
    unrest: finiteOrNull(politics?.unrest),
    status: government?.status ?? null,
    formationType: government?.formationType ?? null,
    confidence: finiteOrNull(government?.confidence),
    governingParty: partyRef(world, government?.governingPartyId),
    headOfGovernment: government
      ? officialRef(world, government.pmPoliticianId, government.governingPartyId)
      : null,
    executive: executive
      ? {
          president: officialRef(world, executive.presidentId, executive.presidentParty),
          vicePresident: officialRef(world, executive.vicePresidentId, executive.vicePresidentParty),
          termStartTurn: finiteOrNull(executive.termStartTurn),
        }
      : null,
    legislature: projectLegislature(world, countryId),
  };
}

function projectElection(world: WorldState, election: WorldState["elections"][number]): WorldRegionElectionView {
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
    candidates: election.candidates.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      party: partyRef(world, candidate.partyId),
      incumbent: candidate.incumbent,
    })),
    winnerNames: (election.winners ?? []).map((winnerId) => {
      if (winnerId === "player") return world.player.name;
      return world.politicians.find((politician) => politician.id === winnerId)?.name ?? winnerId;
    }),
  };
}

function projectRegionOffice(world: WorldState, regionId: string): WorldRegionOfficeView | null {
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

function projectHomeRegion(world: WorldState, countryId: string): WorldRegionView | null {
  const regionId = world.player.homeRegionId;
  if (typeof regionId !== "string" || regionId.length === 0) return null;
  const region = world.regions[regionId];
  if (!region || region.countryId !== countryId) return null;

  const partySupport = Object.values(world.partyRegions)
    .filter((row) => row.regionId === region.id && row.countryId === countryId)
    .map((row) => {
      const party = partyRef(world, row.partyId);
      if (!party || !Number.isFinite(row.organization) || !Number.isFinite(row.registration)) return null;
      return { party, organization: row.organization, registration: row.registration };
    })
    .filter((row): row is WorldRegionPartySupport => row !== null)
    .sort((left, right) => right.organization - left.organization || left.party.id.localeCompare(right.party.id));

  const electorate = world.electoratePools?.[region.id];
  const independent = finiteOrNull(electorate?.independent);
  const unregistered = finiteOrNull(electorate?.unregistered);
  const senateClasses = region.senateClasses
    ? [region.senateClasses[0], region.senateClasses[1]] as [1 | 2 | 3, 1 | 2 | 3]
    : null;

  return {
    id: region.id,
    name: region.name,
    countryId: region.countryId,
    population: finiteOrNull(region.population),
    gdpMillions: finiteOrNull(region.gdp),
    houseSeats: finiteOrNull(region.houseSeats),
    senateSeats: finiteOrNull(region.senateSeats),
    senateClasses,
    censusRegion: region.censusRegion ?? null,
    votingEligiblePopulation: finiteOrNull(region.votingEligiblePopulation),
    workingAgePopulation: finiteOrNull(region.workingAgePopulation),
    militaryServicePopulation: finiteOrNull(region.militaryServicePopulation),
    partySupport,
    electoratePool: independent !== null && unregistered !== null ? { independent, unregistered } : null,
    elections: world.elections
      .filter((election) => election.countryId === countryId && election.state === region.id)
      .map((election) => projectElection(world, election))
      .sort((left, right) => left.startTurn - right.startTurn || left.id.localeCompare(right.id)),
    office: projectRegionOffice(world, region.id),
  };
}

function projectCountry(world: WorldState, country: WorldState["countries"][string]): WorldNationView {
  return {
    id: country.id,
    name: country.name,
    playable: country.playable,
    currency: world.budgets?.[country.id]?.currencyCode ?? world.exchangeRates?.[country.id]?.currencyCode ?? null,
    economy: {
      gdpMillions: country.economy.gdp,
      growthRate: country.economy.growthRate,
      inflationRate: country.economy.inflationRate,
      unemploymentRate: country.economy.unemploymentRate,
      outputGap: country.economy.outputGap,
    },
    government: projectGovernment(world, country.id),
  };
}

/** Projects detached, read-only world browsing data from the current save. */
export function projectWorldOverview(world: WorldState): WorldOverviewView {
  const playerCountry = world.countries[world.player.countryId];
  if (!playerCountry) throw new Error("The save does not contain the player's country.");

  const playerHomeRegionId = typeof world.player.homeRegionId === "string" && world.player.homeRegionId.length > 0
    ? world.player.homeRegionId
    : null;
  return {
    era: world.meta.era,
    turn: world.meta.turn,
    date: world.meta.date,
    playerCountryId: playerCountry.id,
    playerHomeRegionId,
    nations: Object.values(world.countries)
      .map((country) => projectCountry(world, country))
      .sort((left, right) => Number(right.playable) - Number(left.playable) || left.name.localeCompare(right.name)),
    homeRegion: projectHomeRegion(world, playerCountry.id),
  };
}
