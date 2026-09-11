/**
 * Source-backed Layer-1 referendum inputs for the UK's devolved regions.
 *
 * The values are a Native snapshot of AHDGame's
 * `getBucketProfileForRegion("UK", region, "<era>-default")` output at
 * source revision e364c04954ed628beef73a993a8e9e156650a31e. Keeping the
 * snapshot here makes saves deterministic and keeps the engine independent of
 * the Mongo-backed reference application's demographic pipeline.
 *
 * Shares are percentages within each dimension. `buildReferendumCohorts`
 * applies the reference equal-marginal weighting and re-centers the resulting
 * leans to the region's opening desire.
 */

export interface ReferendumProfileBucket {
  id: string;
  sharePct: number;
  turnout: number;
}

export interface ReferendumProfileSection {
  dim: string;
  buckets: ReferendumProfileBucket[];
}

type Row = readonly [id: string, sharePct: number, turnout: number];

function section(dim: string, rows: readonly Row[]): ReferendumProfileSection {
  return {
    dim,
    buckets: rows.map(([id, sharePct, turnout]) => ({
      id: `${dim}:${id}`,
      sharePct,
      turnout,
    })),
  };
}

function profile(
  ethnicity: Row,
  age: readonly Row[],
  education: readonly Row[],
  income: readonly Row[],
  urbanization: readonly Row[],
): ReferendumProfileSection[] {
  return [
    section("ethnicity", [ethnicity]),
    section("age", age),
    section("education", education),
    section("income", income),
    section("urbanization", urbanization),
  ];
}

export const REFERENDUM_COHORT_PROFILES: Record<
  string,
  ReferendumProfileSection[]
> = {
  "1953:SCO": profile(
    ["white_british", 100, 62.80748021341961],
    [
      ["young", 20.624174442269485, 59.64211362857063],
      ["mid", 27.448269489335736, 62.88919675442001],
      ["mature", 37.17223891938826, 63.90831178418789],
      ["senior", 14.755317149006512, 64.3065818998531],
    ],
    [
      ["no_qualifications", 75.57234607930245, 62.428907526312756],
      ["gcse_equivalent", 16.654444605383596, 63.57932424801387],
      ["a_level_equivalent", 5.688971511539414, 64.41256340270154],
      ["degree_plus", 2.0842378037745406, 65.98548603338574],
    ],
    [
      ["low", 40.57858642444262, 60.79927463613057],
      ["middle", 50.58217408950302, 64.05845484765742],
      ["high", 8.839239486054366, 64.86796594573131],
    ],
    [
      ["urban", 60.772115427291176, 62.286222090035416],
      ["suburban", 23.069082729372884, 63.31343976709132],
      ["rural", 16.158801843335937, 64.0455631006479],
    ],
  ),
  "1953:WAL": profile(
    ["white_british", 100, 62.83310674379363],
    [
      ["young", 18.615821606541, 59.703622307340915],
      ["mid", 24.819871752716313, 62.4541221457811],
      ["mature", 38.92826511875647, 63.77044778084058],
      ["senior", 17.636041521986215, 64.60080572956983],
    ],
    [
      ["no_qualifications", 81.77279283181419, 62.555416104324514],
      ["gcse_equivalent", 14.686823975714008, 63.785267793711775],
      ["a_level_equivalent", 3.251888779361168, 65.00738679919893],
      ["degree_plus", 0.28849441311064067, 68.56216216216215],
    ],
    [
      ["low", 42.231533035003224, 61.00447932529089],
      ["middle", 50.408915610133484, 64.03002435273518],
      ["high", 7.359551354863279, 65.12814073124339],
    ],
    [
      ["urban", 48.92743361856833, 62.01976467588333],
      ["suburban", 27.63376393451426, 63.20682198223559],
      ["rural", 23.438802446917418, 64.09032035040892],
    ],
  ),
  "1953:NIR": profile(
    ["white_british", 100, 62.67049796296503],
    [
      ["young", 23.726043979743814, 59.646057672593585],
      ["mid", 28.27332755541816, 62.83142621431475],
      ["mature", 33.622706187375115, 63.86706564881939],
      ["senior", 14.37792227746289, 64.54672054400007],
    ],
    [
      ["no_qualifications", 80.23878194059228, 62.41632615071277],
      ["gcse_equivalent", 15.614033242493635, 63.55864759421347],
      ["a_level_equivalent", 4.147184816914074, 64.24429779110758],
    ],
    [
      ["low", 42.78192411081063, 60.810521604733125],
      ["middle", 49.19419769513014, 63.91352532074192],
      ["high", 8.023878194059234, 64.96659884850537],
    ],
    [
      ["urban", 44.73008486986083, 61.70222710217635],
      ["suburban", 24.263773935689485, 62.91095678214643],
      ["rural", 31.006141194449683, 63.8791746285199],
    ],
  ),
  "1979:SCO": profile(
    ["white_british", 100, 63.84975804116835],
    [
      ["young", 21.71113963742545, 60.7151736993153],
      ["mid", 23.684879604464147, 63.073443497199655],
      ["mature", 32.892841120684956, 65.08694084711645],
      ["senior", 21.71113963742545, 65.95687255247655],
    ],
    [
      ["no_qualifications", 51.10546660696414, 62.92278107121287],
      ["gcse_equivalent", 28.00791657748051, 64.14436918751171],
      ["a_level_equivalent", 14.833532034226687, 65.27304991893904],
      ["degree_plus", 6.053084781328659, 66.82505099699982],
    ],
    [
      ["low", 29.831282967817074, 61.554918789207186],
      ["middle", 54.65271407930907, 64.56547572086002],
      ["high", 15.516002952873858, 65.74084335936081],
    ],
    [
      ["urban", 54.75436285239028, 63.24869416653803],
      ["suburban", 26.67705356883531, 64.41676092098616],
      ["rural", 18.56858357877442, 64.80755340638514],
    ],
  ),
  "1979:WAL": profile(
    ["white_british", 100, 63.94380198801378],
    [
      ["young", 19.189025889049194, 60.43488090840402],
      ["mid", 21.677297363471208, 63.03270570992105],
      ["mature", 33.92621886210539, 64.95880999354098],
      ["senior", 25.2074578853742, 66.03237033486293],
    ],
    [
      ["no_qualifications", 55.500701176646864, 63.12531059135807],
      ["gcse_equivalent", 28.559465425784854, 64.40755246079983],
      ["a_level_equivalent", 12.623660098336572, 65.40575685214978],
      ["degree_plus", 3.3161732992317114, 68.08325982242104],
    ],
    [
      ["low", 30.83247743069321, 61.76278994743654],
      ["middle", 55.60342443595545, 64.66599230746698],
      ["high", 13.564098133351333, 65.94096754924367],
    ],
    [
      ["urban", 43.000903700840084, 63.07670570089198],
      ["suburban", 29.7500195052945, 64.27338424161955],
      ["rural", 27.249076793865413, 64.95230754863876],
    ],
  ),
  "1979:NIR": profile(
    ["white_british", 100, 63.56343193325194],
    [
      ["young", 23.6025155712479, 60.39544516085503],
      ["mid", 23.602515571247896, 62.812676757188825],
      ["mature", 31.15932958386029, 65.00169087499664],
      ["senior", 21.635639273643907, 65.76706376785864],
    ],
    [
      ["no_qualifications", 56.11260504927118, 62.818354929624974],
      ["gcse_equivalent", 26.52442840679049, 64.0033104763718],
      ["a_level_equivalent", 13.167470227946673, 65.03066055597904],
      ["degree_plus", 4.19549631599166, 66.14262511775058],
    ],
    [
      ["low", 36.196946611014496, 61.634384973325226],
      ["middle", 52.383274990611916, 64.45471382547788],
      ["high", 11.419778398373593, 65.5895084959349],
    ],
    [
      ["urban", 50.41329091795905, 62.88117504876766],
      ["suburban", 24.79335454102047, 63.88912492153766],
      ["rural", 24.793354541020467, 64.62499837133407],
    ],
  ),
  "1991:SCO": profile(
    ["white_british", 100, 64.41366511623562],
    [
      ["young", 19.174022950671585, 60.485960093057464],
      ["mid", 22.89001111554718, 63.75389125341979],
      ["mature", 34.050736943645056, 65.63739744206204],
      ["senior", 23.885228990136174, 66.45438868708628],
    ],
    [
      ["no_qualifications", 39.457337013941384, 62.98010051116832],
      ["gcse_equivalent", 28.830770077424685, 64.47158966623923],
      ["a_level_equivalent", 18.22988156049613, 65.5768538527017],
      ["degree_plus", 13.482011348137792, 66.91253851147101],
    ],
    [
      ["low", 27.9437276073123, 62.151113676993006],
      ["middle", 55.03260162470775, 65.02977790688752],
      ["high", 17.023670767979947, 66.13584547037165],
    ],
    [
      ["urban", 51.9175487025545, 63.724996707895656],
      ["suburban", 27.571233732285094, 65.03361783163301],
      ["rural", 20.51121756516041, 65.32346553892773],
    ],
  ),
  "1991:WAL": profile(
    ["white_british", 100, 64.34953789908484],
    [
      ["young", 18.34989156412984, 60.39270558396205],
      ["mid", 21.5476147639582, 63.518708450267795],
      ["mature", 33.74966833655779, 65.4463139471567],
      ["senior", 26.35282533535416, 66.37945341193651],
    ],
    [
      ["no_qualifications", 44.13772044899746, 63.145194126315175],
      ["gcse_equivalent", 30.21663297627459, 64.56313261208848],
      ["a_level_equivalent", 15.983269029578834, 65.58585560904997],
      ["degree_plus", 9.662377545149116, 67.13792792298908],
    ],
    [
      ["low", 30.596267815245028, 62.30444783500152],
      ["middle", 56.74849772013965, 65.10961211276769],
      ["high", 12.655234464615317, 65.88558636812152],
    ],
    [
      ["urban", 40.76004986469476, 63.38372238206072],
      ["suburban", 31.873857253399596, 64.86057267408997],
      ["rural", 27.366092881905647, 65.19284568377888],
    ],
  ),
  "1991:NIR": profile(
    ["white_british", 100, 64.03522720528389],
    [
      ["young", 21.644382079630994, 60.34522599467086],
      ["mid", 22.62821762870515, 63.37925520103502],
      ["mature", 32.11534711388457, 65.46223754951083],
      ["senior", 23.61205317777929, 66.10545550941701],
    ],
    [
      ["no_qualifications", 44.51265007122025, 62.77951699433333],
      ["gcse_equivalent", 28.139413620023042, 64.32669142064273],
      ["a_level_equivalent", 17.646086278233742, 65.22348120130496],
      ["degree_plus", 9.70185003052296, 66.78988992230767],
    ],
    [
      ["low", 32.51034389201656, 62.08992649063441],
      ["middle", 56.17072508987315, 64.85493532656109],
      ["high", 11.318931018110295, 65.55469893321661],
    ],
    [
      ["urban", 52.33309875873295, 63.34984758278982],
      ["suburban", 23.833450620633524, 64.55941262486355],
      ["rural", 23.833450620633524, 65.01598708473496],
    ],
  ),
  "2019:SCO": profile(
    ["white_british", 100, 65.56074981998366],
    [
      ["young", 15.324332793383471, 61.34277196487345],
      ["mid", 25.031402077347725, 64.59151111608371],
      ["mature", 30.997942877407553, 66.61802489413735],
      ["senior", 28.646322251861257, 67.52001520928182],
    ],
    [
      ["no_qualifications", 6.071653424702507, 62.95887159125784],
      ["gcse_equivalent", 23.5222495495614, 64.18256026012033],
      ["a_level_equivalent", 28.6905040996889, 65.12379323148458],
      ["degree_plus", 41.71559292604719, 67.01709556852009],
    ],
    [
      ["low", 22.435391677427337, 63.02833291186714],
      ["middle", 53.605230774072545, 65.83841595538144],
      ["high", 23.959377548500132, 67.31085404840563],
    ],
    [
      ["urban", 73.04139533080635, 64.98987171322042],
      ["suburban", 16.602946205440134, 66.75543308468625],
      ["rural", 10.355658463753514, 67.671911711033],
    ],
  ),
  "2019:WAL": profile(
    ["white_british", 100, 64.82050324856483],
    [
      ["young", 17.18805579764758, 60.657996407371456],
      ["mid", 23.563144634517823, 63.84282857507352],
      ["mature", 30.78621158671524, 65.9627785735393],
      ["senior", 28.46258798111937, 66.90802107287408],
    ],
    [
      ["no_qualifications", 12.38445654897444, 62.49900558100913],
      ["gcse_equivalent", 30.752579456281836, 63.84969139279574],
      ["a_level_equivalent", 25.08529855658584, 64.74453942597596],
      ["degree_plus", 31.777665438157886, 66.72470326007709],
    ],
    [
      ["low", 37.51654540664321, 62.824145616428325],
      ["middle", 53.14218268213057, 65.81368305628133],
      ["high", 9.34127191122621, 67.18813574939108],
    ],
    [
      ["urban", 60.35715656929037, 64.31604389570484],
      ["suburban", 24.03522870638783, 65.50676251788614],
      ["rural", 15.607614724321811, 65.71451132730438],
    ],
  ),
  "2019:NIR": profile(
    ["white_british", 100, 65.0950324772302],
    [
      ["young", 18.2620039815486, 60.96259200199029],
      ["mid", 26.236887610860943, 64.29631059601537],
      ["mature", 29.264220796729518, 66.33951385635473],
      ["senior", 26.236887610860943, 67.3820355576252],
    ],
    [
      ["no_qualifications", 21.744890265226662, 62.880750295752485],
      ["gcse_equivalent", 28.25510973477333, 64.35235037747694],
      ["a_level_equivalent", 21.74489026522667, 65.40874174597306],
      ["degree_plus", 28.25510973477333, 67.30037919999998],
    ],
    [
      ["low", 28.255109734773363, 62.70668910564218],
      ["middle", 52.473775221721816, 65.6797292079456],
      ["high", 19.271115043504807, 67.00471228273403],
    ],
    [
      ["urban", 46.41910884998474, 64.34981089256956],
      ["suburban", 27.782684300007908, 65.58476959101225],
      ["rural", 25.798206850007354, 65.90851189289477],
    ],
  ),
};

export const REFERENDUM_COHORT_AFFINITIES: Record<
  string,
  Record<string, number>
> = {
  SCO: {
    "age:young": 18,
    "age:mid": 8,
    "age:mature": -4,
    "age:senior": -22,
    "income:low": 14,
    "income:middle": 0,
    "income:high": -12,
    "education:no_qualifications": 5,
    "education:gcse_equivalent": 4,
    "education:a_level_equivalent": 0,
    "education:degree_plus": -3,
    "urbanization:urban": 9,
    "urbanization:suburban": -2,
    "urbanization:rural": -9,
    "ethnicity:white_british": -2,
    "ethnicity:asian_british": 10,
    "ethnicity:black_british": 6,
    "ethnicity:mixed": 5,
    "ethnicity:other": 4,
  },
  WAL: {
    "age:young": 24,
    "age:mid": 10,
    "age:mature": -6,
    "age:senior": -26,
    "income:low": 6,
    "income:middle": 0,
    "income:high": -6,
    "education:no_qualifications": 2,
    "education:gcse_equivalent": 0,
    "education:a_level_equivalent": 2,
    "education:degree_plus": 4,
    "urbanization:urban": 8,
    "urbanization:suburban": -10,
    "urbanization:rural": 4,
    "ethnicity:white_british": -1,
    "ethnicity:asian_british": 5,
    "ethnicity:black_british": 5,
    "ethnicity:mixed": 4,
    "ethnicity:other": 3,
  },
  NIR: {
    "age:young": 20,
    "age:mid": 12,
    "age:mature": -8,
    "age:senior": -24,
    "income:low": 10,
    "income:middle": 0,
    "income:high": -8,
    "education:no_qualifications": 0,
    "education:gcse_equivalent": 0,
    "education:a_level_equivalent": 2,
    "education:degree_plus": 6,
    "urbanization:urban": 8,
    "urbanization:suburban": -12,
    "urbanization:rural": 2,
    "ethnicity:white_british": -1,
    "ethnicity:asian_british": 4,
    "ethnicity:black_british": 4,
    "ethnicity:mixed": 4,
    "ethnicity:other": 3,
  },
};

export function getReferendumCohortProfile(
  era: string | undefined,
  regionId: string,
): ReferendumProfileSection[] | null {
  const source = REFERENDUM_COHORT_PROFILES[`${era}:${regionId.toUpperCase()}`];
  return source
    ? source.map((s) => ({
        ...s,
        buckets: s.buckets.map((bucket) => ({ ...bucket })),
      }))
    : null;
}

export function cohortAffinitiesFor(regionId: string): Record<string, number> {
  return REFERENDUM_COHORT_AFFINITIES[regionId.toUpperCase()] ?? {};
}
