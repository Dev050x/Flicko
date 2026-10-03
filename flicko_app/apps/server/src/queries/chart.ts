import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { candles, memes, positions, trades, users } from "../db/schema";
import type { Db } from "../db/types";
import type { Candle } from "./memes";
import { TOKEN_UNIT } from "./memes";

/*
 * The meme page's Chart, Trades and Holders tabs.
 */
export const CHART_TFS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
export type ChartTf = (typeof CHART_TFS)[number];

const MINUTE = 60_000;
// Stored intervals (1m, 5m, 1h, 1d) and how many of them make one chart candle.
const SOURCE: Record<ChartTf, [(typeof candles.interval.enumValues)[number], number, number]> = {
  "1m": ["1m", MINUTE, 1],
  "5m": ["5m", 5 * MINUTE, 1],
  "15m": ["5m", 5 * MINUTE, 3],
  "1h": ["1h", 60 * MINUTE, 1],
  "4h": ["1h", 60 * MINUTE, 4],
  "1d": ["1d", 1440 * MINUTE, 1],
};

const max = (a: string, b: string) => (BigInt(a) >= BigInt(b) ? a : b);
const min = (a: string, b: string) => (BigInt(a) <= BigInt(b) ? a : b);

/*
 * `limit` consecutive candles of `tf` ending at the current bucket, oldest first.
 * Buckets with no trades repeat the previous close (flat, zero volume) so the time axis
 * is continuous; buckets before the first trade are left out.
 */
export const chartCandles = async (
  db: Db,
  mint: string,
  tf: ChartTf,
  limit: number,
  now = Date.now(),
): Promise<Candle[]> => {
  const [interval, base, factor] = SOURCE[tf];
  const step = base * factor;
  const end = Math.floor(now / step) * step;
  const start = end - (limit - 1) * step;

  const [rows, prior] = await Promise.all([
    db
      .select()
      .from(candles)
      .where(
        and(
          eq(candles.mint, mint),
          eq(candles.interval, interval),
          gte(candles.bucketStart, new Date(start)),
        ),
      )
      .orderBy(asc(candles.bucketStart)),
    db
      .select({ close: candles.close })
      .from(candles)
      .where(
        and(
          eq(candles.mint, mint),
          eq(candles.interval, interval),
          lt(candles.bucketStart, new Date(start)),
        ),
      )
      .orderBy(desc(candles.bucketStart))
      .limit(1),
  ]);

  const byBucket = new Map<number, Candle>();
  for (const row of rows) {
    const bucket = Math.floor(row.bucketStart.getTime() / step) * step;
    const c = byBucket.get(bucket);
    if (!c) {
      byBucket.set(bucket, {
        time: new Date(bucket).toISOString(),
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volumeSkr,
        trades: row.trades,
      });
    } else {
      c.high = max(c.high, row.high);
      c.low = min(c.low, row.low);
      c.close = row.close;
      c.volume = (BigInt(c.volume) + BigInt(row.volumeSkr)).toString();
      c.trades += row.trades;
    }
  }

  const out: Candle[] = [];
  let last: string | null = prior[0]?.close ?? null;
  for (let bucket = start; bucket <= end; bucket += step) {
    const c = byBucket.get(bucket);
    if (c) {
      out.push(c);
      last = c.close;
    } else if (last !== null) {
      out.push({
        time: new Date(bucket).toISOString(),
        open: last,
        high: last,
        low: last,
        close: last,
        volume: "0",
        trades: 0,
      });
    }
  }
  return out;
};

export interface HolderRow {
  /** 1-based among wallets (the pool isn't ranked) */
  rank: number;
  wallet: string;
  username: string | null;
  isCreator: boolean;
  /** token base units */
  balance: string;
  /** of total supply, basis points */
  shareBps: number;
  /** SKR base units at the current price */
  value: string;
}

export interface Holders {
  /** wallets holding more than zero (same count as the Overview) */
  total: number;
  /** share of supply held by the 10 largest wallets, pool excluded, bps */
  top10Bps: number;
  creatorBps: number;
  /** the locked pool once graduated; null during launch (there is no pool yet) */
  pool: { balance: string; shareBps: number; value: string } | null;
  items: HolderRow[];
  nextOffset: number | null;
  /** the signed-in wallet's own row, wherever it ranks */
  me: HolderRow | null;
}

const bps = (part: bigint, whole: bigint) =>
  whole === 0n ? 0 : Number((part * 10_000n) / whole);

/*
 * Holders, largest first (ties by wallet), paged. The pool is reported on its own and
 * never counted in the ranks or the Top 10.
 */
export const listHolders = async (
  db: Db,
  mint: string,
  limit: number,
  offset: number,
  viewer?: string,
): Promise<Holders | null> => {
  const [meme] = await db
    .select({
      creator: memes.creator,
      phase: memes.phase,
      price: memes.price,
      totalSupply: memes.totalSupply,
      poolTokens: memes.poolTokens,
    })
    .from(memes)
    .where(eq(memes.mint, mint));
  if (!meme) return null;

  const supply = BigInt(meme.totalSupply);
  const price = BigInt(meme.price);
  const value = (balance: bigint) => ((balance * price) / TOKEN_UNIT).toString();
  const toRow = (
    rank: number,
    row: { wallet: string; balance: string; username: string | null },
  ): HolderRow => ({
    rank,
    wallet: row.wallet,
    username: row.username,
    isCreator: row.wallet === meme.creator,
    balance: row.balance,
    shareBps: bps(BigInt(row.balance), supply),
    value: value(BigInt(row.balance)),
  });

  const held = and(eq(positions.mint, mint), sql`${positions.balance} > 0`);
  const [rows, [counts], top, creator] = await Promise.all([
    db
      .select({ wallet: positions.wallet, balance: positions.balance, username: users.username })
      .from(positions)
      .leftJoin(users, eq(users.wallet, positions.wallet))
      .where(held)
      .orderBy(desc(positions.balance), asc(positions.wallet))
      .limit(limit)
      .offset(offset),
    db.select({ n: sql<number>`count(*)::int` }).from(positions).where(held),
    db
      .select({ balance: positions.balance })
      .from(positions)
      .where(held)
      .orderBy(desc(positions.balance))
      .limit(10),
    db
      .select({ balance: positions.balance })
      .from(positions)
      .where(and(eq(positions.mint, mint), eq(positions.wallet, meme.creator)))
      .then((r) => BigInt(r[0]?.balance ?? "0")),
  ]);

  let me: HolderRow | null = null;
  if (viewer) {
    const [mine] = await db
      .select({ wallet: positions.wallet, balance: positions.balance, username: users.username })
      .from(positions)
      .leftJoin(users, eq(users.wallet, positions.wallet))
      .where(and(held, eq(positions.wallet, viewer)));
    if (mine) {
      // rank = wallets ahead in the same order (bigger balance, or equal and earlier wallet)
      const [ahead] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(positions)
        .where(
          and(
            held,
            sql`(${positions.balance} > ${mine.balance} or (${positions.balance} = ${mine.balance} and ${positions.wallet} < ${viewer}))`,
          ),
        );
      me = toRow((ahead?.n ?? 0) + 1, mine);
    }
  }

  const poolBalance = BigInt(meme.poolTokens);
  const total = counts?.n ?? 0;
  return {
    total,
    top10Bps: bps(
      top.reduce((sum, r) => sum + BigInt(r.balance), 0n),
      supply,
    ),
    creatorBps: bps(creator, supply),
    pool:
      meme.phase === "graduated"
        ? { balance: poolBalance.toString(), shareBps: bps(poolBalance, supply), value: value(poolBalance) }
        : null,
    items: rows.map((row, i) => toRow(offset + i + 1, row)),
    nextOffset: offset + rows.length < total ? offset + rows.length : null,
    me,
  };
};

/* Trade rows with the trader's username, for the Trades tab and the chart's live trades. */
export const usernamesFor = async (db: Db, wallets: string[]) => {
  const names = new Map<string, string>();
  if (wallets.length === 0) return names;
  const rows = await db
    .select({ wallet: users.wallet, username: users.username })
    .from(users)
    .where(inArray(users.wallet, [...new Set(wallets)]));
  for (const row of rows) if (row.username) names.set(row.wallet, row.username);
  return names;
};



export interface SoldPoint {
  time: string;
  /** share of the launch sale sold, bps */
  soldBps: number;
}

const MAX_SOLD_POINTS = 200;

/*
 * Launch sale progress over time for the launching Chart tab: 0 at creation, a point
 * after every launch-phase trade (buys add, sells subtract), and the current value
 * now (or at graduation). Thinned to at most MAX_SOLD_POINTS, keeping the last.
 */
export const soldOverTime = async (db: Db, mint: string): Promise<SoldPoint[] | null> => {
  const [meme] = await db
    .select({
      createdAt: memes.createdAt,
      totalSupply: memes.totalSupply,
      tokensSold: memes.tokensSold,
      graduatedAt: memes.graduatedAt,
    })
    .from(memes)
    .where(eq(memes.mint, mint));
  if (!meme) return null;
  const sale = (BigInt(meme.totalSupply) * 4n) / 5n;
  const share = (sold: bigint) => {
    const v = bps(sold < 0n ? 0n : sold, sale);
    return Math.min(10_000, v);
  };
  const rows = await db
    .select({ isBuy: trades.isBuy, tokens: trades.tokenAmount, at: trades.blockTime })
    .from(trades)
    .where(and(eq(trades.mint, mint), eq(trades.phase, "launch")))
    .orderBy(asc(trades.slot), asc(trades.eventIndex));

  let sold = 0n;
  const points: SoldPoint[] = [{ time: meme.createdAt.toISOString(), soldBps: 0 }];
  for (const row of rows) {
    sold += row.isBuy ? BigInt(row.tokens) : -BigInt(row.tokens);
    points.push({ time: row.at.toISOString(), soldBps: share(sold) });
  }
  points.push({
    time: (meme.graduatedAt ?? new Date()).toISOString(),
    soldBps: share(BigInt(meme.tokensSold)),
  });
  if (points.length <= MAX_SOLD_POINTS) return points;
  const every = Math.ceil(points.length / MAX_SOLD_POINTS);
  return points.filter((_, i) => i % every === 0 || i === points.length - 1);
};
