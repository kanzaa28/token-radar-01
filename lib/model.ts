// Token launch radar — the scoring model.
//
// One sealed snapshot of the protocol index goes in; one ranked board of
// pre-token protocols comes out, each row carrying the implied value the
// model gives it and a farm plan derived from the row's own record.
//
// Who is ranked: every protocol on the snapshot's watchlist (that list is
// the floor — a board that misses one is refused), plus the strongest
// pre-token protocols below the watchlist floor, which are the early
// finds this radar exists for. A protocol counts as pre-token while its
// index entry shows no token at all: no market cap, no CoinGecko id, no
// symbol. Protocols that already trade are never ranked; the dashboard
// sets them aside with the market's own figures.
//
// The implied value, from the snapshot's figures only:
//
//   implied = max(1, round( tvl * base_multiple
//             * (1 + clamp(change_7d, floor, cap) / 100 * growth_weight)
//             * (maturity_floor + min(age, maturity_days) / maturity_days * maturity_range)
//             * (1 + breadth_step * min(chains - 1, breadth_cap_chains)) ))
//
// Age is the days since the protocol was first listed; an unknown age is
// scored as unknown_age_days. The parameters are the model's own: the
// dashboard prints them and its sandbox may restate them. One function
// scores every row; no protocol's name is ever special-cased.

/** One protocol as the sealed snapshot carries it: ten fields, no more. */
export interface Proto {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The snapshot document: when it was taken, from what, its floor, its rows, its watchlist. */
export interface Snap {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Proto[];
  watchlist: string[];
}

/** The model's tunable parameters, exactly as the dashboard states them. */
export interface Params {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_step: number;
  breadth_cap_chains: number;
}

export const PARAMS: Params = {
  base_multiple: 0.25,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  breadth_step: 0.03,
  breadth_cap_chains: 5,
};

/** The model's version label, printed on the page and quoted in the rules. */
export const VERSION = 'radar-2';

/** Early rows: how many below-floor pre-token protocols the radar adds, by TVL. */
export const EARLY_LIMIT = 160;

/** Live rows: how many already-trading protocols the side view carries, by market cap. */
export const LIVE_LIMIT = 24;

/** One row of board.json. */
export interface Row {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    chains_count: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** A board row slimmed down for the page's data file; the page rebuilds the plan itself. */
export interface PageRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
}

/** An already-trading protocol, shown with the market's figures rather than the model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** The whole dataset the page renders from. */
export interface PageData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: Params;
  model_version: string;
  watchlist: string[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: PageRow[];
  live: LiveRow[];
}

/** Raised when the snapshot is not a document this model can score. */
export class BadSnapshot extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BadSnapshot';
  }
}

const MS_PER_DAY = 86_400_000;

function numOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from a listing date to the snapshot date; null when either is missing or unreadable. */
export function daysListed(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const end = Date.parse(`${asOf}T00:00:00Z`);
  const start = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(end) || !Number.isFinite(start)) return null;
  return Math.max(0, Math.floor((end - start) / MS_PER_DAY));
}

const fourDp = (n: number): number => Math.round(n * 10000) / 10000;

/** The four multipliers one protocol earns under `params`, and the value they multiply to. */
export function score(p: Proto, asOf: string, params: Params) {
  const age = daysListed(asOf, p.listed_at);
  const pct = Math.min(params.growth_cap, Math.max(params.growth_floor, numOr(p.change_7d, 0)));
  const growth = 1 + (pct / 100) * params.growth_weight;
  const ageUsed = age ?? params.unknown_age_days;
  const maturity =
    params.maturity_floor +
    (Math.min(Math.max(ageUsed, 0), params.maturity_days) / params.maturity_days) * params.maturity_range;
  const extra = Math.min(Math.max(p.chains.length - 1, 0), params.breadth_cap_chains);
  const breadth = 1 + extra * params.breadth_step;
  const implied = Math.max(1, Math.round(p.tvl_usd * params.base_multiple * growth * maturity * breadth));
  return { implied, pct, growth, maturity, breadth, age };
}

/** A name that ends in a version marker reads as another protocol's pool, per the index's own rule. */
const VERSIONED_NAME = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** True while the index records no token for the protocol. */
export function hasNoToken(p: Proto): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** True for protocols the board may rank: tokenless, not an exchange, not a versioned pool. */
export function canRank(p: Proto): boolean {
  return hasNoToken(p) && p.category !== 'CEX' && !VERSIONED_NAME.test(p.name);
}

const bySlugAsc = (a: Proto, b: Proto): number => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);

/** The ranked board: watchlist first (all of it), then the early finds, scored and ordered. */
export function buildBoard(snap: Snap, params: Params = PARAMS): Row[] {
  const index = new Map(snap.protocols.map((p) => [p.slug, p]));
  const picked = new Map<string, Proto>();
  for (const slug of snap.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) picked.set(slug, p);
  }
  const early = snap.protocols
    .filter((p) => !picked.has(p.slug) && canRank(p) && p.tvl_usd < snap.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || bySlugAsc(a, b))
    .slice(0, EARLY_LIMIT);
  for (const p of early) picked.set(p.slug, p);

  const scored = [...picked.values()].map((p) => ({ p, ...score(p, snap.as_of, params) }));
  scored.sort((a, b) => b.implied - a.implied || bySlugAsc(a.p, b.p));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: params.base_multiple,
      growth_pct: s.pct,
      growth_multiplier: fourDp(s.growth),
      maturity_multiplier: fourDp(s.maturity),
      breadth_multiplier: fourDp(s.breadth),
      chains_count: s.p.chains.length,
      age_days: s.age,
    },
    farm_steps: planFor(s.p, s.age),
  }));
}

// ------------------------------------------------------------------ farm plans
//
// A plan is seven steps. Three of them are the same for everyone (open a
// fresh wallet, make a weekly qualifying action, check the claim page
// before withdrawing, and the exit — four, counting the exit). The two
// that carry the protocol's own shape — the opening action and the weekly
// repeat — come from a rules table keyed on the category's words, and the
// money and the hold come from the row's TVL and age. Nothing is keyed on
// a protocol's name.

interface StepParts {
  what: string;
  cost: string;
  time: string;
}

/** One step as the board carries it: the action sentence, then its cost and its time. */
function stepLine(part: StepParts): string {
  let s = `${part.what} Cost: ${part.cost}. Time: ${part.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

function firstChain(p: Proto): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The capital one farm position carries, stepped by the protocol's own TVL. */
function capitalOf(p: Proto): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** The hold a plan asks for: younger protocols qualify over a longer window. */
function holdOf(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

interface CategoryRule {
  words: string[];
  open: (name: string, chain: string, capital: number) => string;
  again: (name: string, chain: string, small: number) => string;
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    words: ['lend', 'cdp', 'collateral'],
    open: (n, c, k) => `Supply $${k} of USDC to ${n} on ${c} and keep the position open.`,
    again: (n, _c, s) => `Borrow $${s} against the supplied collateral on ${n}, repay it the same week, and leave the supply position open.`,
  },
  {
    words: ['dex', 'yield', 'leveraged farm'],
    open: (n, c, k) => `Provide $${k} of liquidity to ${n}'s main pool on ${c} and keep the position open.`,
    again: (n, c, s) => `Swap $${s} through ${n}'s main pool on ${c} once a week so the wallet shows repeated use.`,
  },
  {
    words: ['bridge'],
    open: (n, c, k) => `Bridge $${k} of USDC to ${c} through ${n} and use the bridged funds in its app.`,
    again: (n, c, s) => `Bridge $${s} to ${c} through ${n} and back once a week to keep the route active.`,
  },
  {
    words: ['staking', 'restak'],
    open: (n, _c, k) => `Stake $${k} of the chain's staking asset through ${n} and keep the receipt.`,
    again: (n) => `Restake the staking rewards ${n} pays out, so the staked balance grows every week.`,
  },
  {
    words: ['perpetual', 'derivative'],
    open: (n, _c, k) => `Deposit $${k} of USDC as margin on ${n} and open one small hedge.`,
    again: (n) => `Close the hedge on ${n} and reopen it at the new size, keeping the margin deposit untouched.`,
  },
  {
    words: ['prediction'],
    open: (n, _c, k) => `Fund $${k} and place one market position on ${n}.`,
    again: (n) => `Settle one market on ${n} and open the next week's position with the same stake.`,
  },
  {
    words: ['curator', 'allocator'],
    open: (n, c, k) => `Deposit $${k} into a ${n} vault on ${c} and keep the shares.`,
    again: (n, _c, s) => `Top the ${n} vault up by $${s} each week and keep the shares in the same wallet.`,
  },
  {
    words: ['stable'],
    open: (n, c, k) => `Mint or deposit $${k} of the stable asset through ${n} on ${c}.`,
    again: (n, c, s) => `Redeem and re-mint $${s} of the stable asset through ${n} on ${c} once a week.`,
  },
  {
    words: ['rwa'],
    open: (n, c, k) => `Mint $${k} of the protocol's yield asset on ${c} and hold it.`,
    again: (n, c) => `Claim the yield ${n} pays on ${c} and hold it in the same wallet.`,
  },
  {
    words: ['insurance'],
    open: (n, c, k) => `Buy $${k} of cover from ${n} on ${c} and keep the policy.`,
    again: (n, c) => `Check the cover ${n} holds on ${c} each week and renew it before it lapses.`,
  },
];

const FALLBACK_RULE: CategoryRule = {
  words: [],
  open: (n, c, k) => `Deposit $${k} of USDC into ${n} on ${c} and keep the position open.`,
  again: (n, _c, s) => `Repeat the deposit with a $${s} top-up on ${n} each week so the wallet shows repeated use.`,
};

function ruleFor(category: string | null): CategoryRule {
  const c = (category ?? '').toLowerCase();
  return CATEGORY_RULES.find((r) => r.words.some((w) => c.includes(w))) ?? FALLBACK_RULE;
}

/** The seven-step farm plan for one protocol, derived from its own record. */
export function planFor(p: Proto, age: number | null): string[] {
  const chain = firstChain(p);
  const capital = capitalOf(p);
  const small = Math.max(10, Math.round(capital / 5));
  const hold = holdOf(age);
  const rule = ruleFor(p.category);
  const parts: StepParts[] = [
    {
      what: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.',
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      what: rule.open(p.name, chain, capital),
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    { what: rule.again(p.name, chain, small), cost: 'about $2 of gas a week', time: '10 minutes a week' },
    {
      what: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.',
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      what: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      what: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.",
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      what: "When the token launches, claim from the protocol's own page, sell half at once, and unwind the rest over a week.",
      cost: 'about $5 of gas to exit',
      time: '30 minutes across a week',
    },
  ];
  return parts.map(stepLine);
}

/** The already-trading protocols, largest market cap first, for the page's side view. */
export function buildLive(snap: Snap): LiveRow[] {
  return snap.protocols
    .filter((p) => !hasNoToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_LIMIT)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** The page's whole dataset: the board in page shape, the live list, the headline counts. */
export function buildPageData(snap: Snap, board: Row[]): PageData {
  const onWatchlist = new Set(snap.watchlist);
  const live = buildLive(snap);
  return {
    as_of: snap.as_of,
    source: snap.source,
    floor_usd: snap.floor_usd,
    model: PARAMS,
    model_version: VERSION,
    watchlist: snap.watchlist,
    watchlist_size: snap.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !onWatchlist.has(r.slug)).length,
    live_size: live.length,
    rows: board.map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      mcap_usd: r.mcap_usd,
      listed_at: r.listed_at,
      age_days: r.age_days,
      implied_value_usd: r.implied_value_usd,
      growth_multiplier: r.model.growth_multiplier,
      maturity_multiplier: r.model.maturity_multiplier,
      breadth_multiplier: r.model.breadth_multiplier,
    })),
    live,
  };
}

// ------------------------------------------------------------- snapshot reading
//
// The snapshot is a sealed document with a fixed shape: each protocol
// carries exactly ten fields, and a row that is short a field is not a
// row. What can be salvaged is typed, not guessed: a number that is not
// finite becomes "no figure", a label that is not a string becomes "no
// label", and a chain list keeps only its string entries.

const PROTO_KEYS = ['slug', 'name', 'category', 'chains', 'tvl_usd', 'change_7d', 'mcap_usd', 'listed_at', 'gecko_id', 'symbol'] as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function labelOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function figureOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function readProto(raw: unknown, where: string): Proto {
  if (!isRecord(raw)) throw new BadSnapshot(`${where}: not an object`);
  for (const key of PROTO_KEYS) {
    if (!(key in raw)) throw new BadSnapshot(`${where}: missing field ${key}`);
  }
  if (typeof raw.slug !== 'string' || raw.slug === '') throw new BadSnapshot(`${where}: slug must be a non-empty string`);
  if (typeof raw.name !== 'string' || raw.name === '') throw new BadSnapshot(`${where}: name must be a non-empty string`);
  if (!Array.isArray(raw.chains)) throw new BadSnapshot(`${where}: chains must be an array`);
  if (typeof raw.tvl_usd !== 'number' || !Number.isFinite(raw.tvl_usd) || raw.tvl_usd < 0) {
    throw new BadSnapshot(`${where}: tvl_usd must be a non-negative finite number`);
  }
  return {
    slug: raw.slug,
    name: raw.name,
    category: labelOrNull(raw.category),
    chains: raw.chains.filter((c): c is string => typeof c === 'string'),
    tvl_usd: raw.tvl_usd,
    change_7d: figureOrNull(raw.change_7d),
    mcap_usd: figureOrNull(raw.mcap_usd),
    listed_at: labelOrNull(raw.listed_at),
    gecko_id: labelOrNull(raw.gecko_id),
    symbol: labelOrNull(raw.symbol),
  };
}

/** Parse and validate a snapshot document; anything off-shape raises BadSnapshot. */
export function readSnapshot(raw: unknown): Snap {
  if (!isRecord(raw)) throw new BadSnapshot('snapshot root must be an object');
  if (typeof raw.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.as_of)) {
    throw new BadSnapshot('as_of must be a YYYY-MM-DD string');
  }
  if (typeof raw.source !== 'string' || raw.source === '') throw new BadSnapshot('source must be a non-empty string');
  if (
    typeof raw.floor_usd !== 'number' ||
    !Number.isSafeInteger(raw.floor_usd) ||
    raw.floor_usd <= 0
  ) {
    throw new BadSnapshot('floor_usd must be a positive safe integer');
  }
  if (!Array.isArray(raw.protocols)) throw new BadSnapshot('protocols must be an array');
  if (!Array.isArray(raw.watchlist)) throw new BadSnapshot('watchlist must be an array');
  const protocols = raw.protocols.map((p, i) => readProto(p, `protocols[${i}]`));
  const seen = new Set<string>();
  for (const p of protocols) {
    if (seen.has(p.slug)) throw new BadSnapshot(`duplicate protocol slug: ${p.slug}`);
    seen.add(p.slug);
  }
  const watchlist = raw.watchlist.map((w, i) => {
    if (typeof w !== 'string' || w === '') throw new BadSnapshot(`watchlist[${i}] must be a non-empty string`);
    return w;
  });
  return { as_of: raw.as_of, source: raw.source, floor_usd: raw.floor_usd, protocols, watchlist };
}

/** The gate's shape, checked before anything is written: first defect found, or null. */
export function boardDefect(board: Row[], snap: Snap): string | null {
  const onBoard = new Set(board.map((r) => r.slug));
  for (const slug of snap.watchlist) {
    if (!onBoard.has(slug)) return `watchlist slug missing from the board: ${slug}`;
  }
  let previous = Number.POSITIVE_INFINITY;
  for (let i = 0; i < board.length; i++) {
    const row = board[i]!;
    if (row.rank !== i + 1) return `row ${i}: rank is ${row.rank}, expected ${i + 1}`;
    if (!Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd <= 0) {
      return `row ${row.slug}: implied value ${row.implied_value_usd} is not a positive integer`;
    }
    if (row.implied_value_usd > previous) return `row ${row.slug}: implied value rises against the sort`;
    previous = row.implied_value_usd;
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `row ${row.slug}: ${row.farm_steps.length} farm steps, outside 3..12`;
    }
    for (const s of row.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `row ${row.slug}: a farm step is ${t.length} chars, outside 20..600`;
    }
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return 'every implied value on the board is the same';
  }
  return null;
}
