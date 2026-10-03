import {
  and,
  asc,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNotNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { candles, memes, positions, trades, users } from "../db/schema";
import type { Db } from "../db/types";
import { launchSpot, TOKEN_UNIT } from "./memes";

/* test SKR has 6 decimals, like the meme tokens */
const SKR_UNIT = "1000000";

export const WINDOWS = ["m5", "h1", "h6", "h24"] as const;
export type Window = (typeof WINDOWS)[number];
export const MARKET_SORTS = [
  "trending",
  "volume",
  "change",
  "txns",
  "mcap",
  "liquidity",
  "holders",
  "new",
] as const;
export type MarketSort = (typeof MARKET_SORTS)[number];

type ByWindow<T> = Record<Window, T>;

export interface MarketRow {
  mint: string;
  name: string;
  symbol: string;
  imageUrl: string | null;
  phase: "launch" | "graduated";
  price: string;
  marketCap: string;
  liquidity: string;
  holders: number;
  launchProgressBps: number;
  createdAt: string;
  change: ByWindow<number>;
  volume: ByWindow<string>;
  txns: ByWindow<number>;
  buys24h: number;
  sells24h: number;
  makers24h: number;
  /** distinct wallets that bought / sold in the last 24h */
  buyers24h: number;
  sellers24h: number;
  sparkline: string[];
}

export interface Reel extends MarketRow {
  memePda: string;
  creator: string;
  creatorUsername: string | null;
  captionTop: string | null;
  captionBottom: string | null;
  totalSupply: string;
  tradeCount: number;
  viewer: { balance: string; value: string } | null;
}

export interface MarketQuery {
  sort: MarketSort;
  window: Window;
  order: "asc" | "desc";
  phase: "all" | "launch" | "graduated";
  q?: string;
  /** only these mints (the watchlist) */
  mints?: string[];
  /** include hidden and image-less memes (a meme's own page) */
  includeHidden?: boolean;
  limit: number;
  offset: number;
}

const INTERVAL: ByWindow<string> = {
  m5: "5 minutes",
  h1: "1 hour",
  h6: "6 hours",
  h24: "24 hours",
};

const since = (window: Window) =>
  sql`now() - ${sql.raw(`interval '${INTERVAL[window]}'`)}`;

const statsSub = (db: Db) =>
  db
    .select({
      mint: trades.mint,
      volM5:
        sql<string>`sum(${trades.skrAmount}) filter (where ${trades.blockTime} > ${since("m5")})`.as(
          "vol_m5",
        ),
      volH1:
        sql<string>`sum(${trades.skrAmount}) filter (where ${trades.blockTime} > ${since("h1")})`.as(
          "vol_h1",
        ),
      volH6:
        sql<string>`sum(${trades.skrAmount}) filter (where ${trades.blockTime} > ${since("h6")})`.as(
          "vol_h6",
        ),
      volH24: sql<string>`sum(${trades.skrAmount})`.as("vol_h24"),
      txM5: sql<number>`count(*) filter (where ${trades.blockTime} > ${since("m5")})`.as(
        "tx_m5",
      ),
      txH1: sql<number>`count(*) filter (where ${trades.blockTime} > ${since("h1")})`.as(
        "tx_h1",
      ),
      txH6: sql<number>`count(*) filter (where ${trades.blockTime} > ${since("h6")})`.as(
        "tx_h6",
      ),
      txH24: sql<number>`count(*)`.as("tx_h24"),
      buys: sql<number>`count(*) filter (where ${trades.isBuy})`.as("buys"),
      makers: sql<number>`count(distinct ${trades.trader})`.as("makers"),
      buyers:
        sql<number>`count(distinct ${trades.trader}) filter (where ${trades.isBuy})`.as("buyers"),
      sellers:
        sql<number>`count(distinct ${trades.trader}) filter (where not ${trades.isBuy})`.as(
          "sellers",
        ),
      buyersH1:
        sql<number>`count(distinct ${trades.trader}) filter (where ${trades.isBuy} and ${trades.blockTime} > ${since("h1")})`.as(
          "buyers_h1",
        ),
    })
    .from(trades)
    .where(gt(trades.blockTime, since("h24")))
    .groupBy(trades.mint)
    .as("stats");

const holdersSub = (db: Db) =>
  db
    .select({
      mint: positions.mint,
      holders: sql<number>`count(*)`.as("holders"),
    })
    .from(positions)
    .where(gt(positions.balance, "0"))
    .groupBy(positions.mint)
    .as("holder_counts");

const referencePrice = (window: Window) =>
  sql`coalesce((select ${trades.priceAfter} from ${trades}
    where ${trades.mint} = ${memes.mint} and ${trades.blockTime} <= ${since(window)}
    order by ${trades.slot} desc, ${trades.eventIndex} desc limit 1), ${launchSpot})`;

const changeOf = (window: Window) => {
  const ref = referencePrice(window);
  return sql`(case when ${ref} = 0 then 0 else trunc((${memes.price} - ${ref}) * 10000 / ${ref}) end)`;
};

const marketCap = sql`trunc(${memes.price} * ${memes.totalSupply} / ${TOKEN_UNIT.toString()}::numeric)`;
const liquidity = sql`(case when ${memes.phase} = 'graduated' then ${memes.poolSkr} * 2 else ${memes.realSkr} end)`;
const ageHours = sql`(extract(epoch from now() - ${memes.createdAt}) / 3600)`;

const baseQuery = (db: Db) => {
  const stats = statsSub(db);
  const holders = holdersSub(db);
  const volume: ByWindow<SQL> = {
    m5: sql`coalesce(${stats.volM5}, 0)`,
    h1: sql`coalesce(${stats.volH1}, 0)`,
    h6: sql`coalesce(${stats.volH6}, 0)`,
    h24: sql`coalesce(${stats.volH24}, 0)`,
  };
  const txns: ByWindow<SQL> = {
    m5: sql`coalesce(${stats.txM5}, 0)`,
    h1: sql`coalesce(${stats.txH1}, 0)`,
    h6: sql`coalesce(${stats.txH6}, 0)`,
    h24: sql`coalesce(${stats.txH24}, 0)`,
  };
  const holderCount = sql`coalesce(${holders.holders}, 0)`;
  const hot = sql`((1 + ${txns.h24} + ${volume.h24} / 10000000) / power(${ageHours} + 2, 1.5))`;
  /*
   * Markets "Trending": volume_1h × 0.5 + unique_buyers_1h × 0.3 + change_1h × 0.2, with
   * volume in whole SKR and the change in percent. Computed per request, so it is never
   * more than a request old.
   */
  const trending = sql`(${volume.h1} / ${SKR_UNIT}::numeric * 0.5 + coalesce(${stats.buyersH1}, 0) * 0.3 + ${changeOf("h1")} / 100.0 * 0.2)`;

  const query = db
    .select({
      mint: memes.mint,
      memePda: memes.memePda,
      name: memes.name,
      symbol: memes.symbol,
      imageUrl: memes.imageUrl,
      creator: memes.creator,
      creatorUsername: users.username,
      captionTop: memes.captionTop,
      captionBottom: memes.captionBottom,
      phase: memes.phase,
      price: memes.price,
      totalSupply: memes.totalSupply,
      tokensSold: memes.tokensSold,
      tradeCount: memes.tradeCount,
      createdAt: memes.createdAt,
      marketCap: sql<string>`${marketCap}::text`,
      liquidity: sql<string>`${liquidity}::text`,
      holders: sql<number>`${holderCount}::int`,
      changeM5: sql<string>`${changeOf("m5")}::text`,
      changeH1: sql<string>`${changeOf("h1")}::text`,
      changeH6: sql<string>`${changeOf("h6")}::text`,
      changeH24: sql<string>`${changeOf("h24")}::text`,
      volM5: sql<string>`${volume.m5}::text`,
      volH1: sql<string>`${volume.h1}::text`,
      volH6: sql<string>`${volume.h6}::text`,
      volH24: sql<string>`${volume.h24}::text`,
      txM5: sql<number>`${txns.m5}::int`,
      txH1: sql<number>`${txns.h1}::int`,
      txH6: sql<number>`${txns.h6}::int`,
      txH24: sql<number>`${txns.h24}::int`,
      buys24h: sql<number>`coalesce(${stats.buys}, 0)::int`,
      makers24h: sql<number>`coalesce(${stats.makers}, 0)::int`,
      buyers24h: sql<number>`coalesce(${stats.buyers}, 0)::int`,
      sellers24h: sql<number>`coalesce(${stats.sellers}, 0)::int`,
    })
    .from(memes)
    .leftJoin(users, eq(users.wallet, memes.creator))
    .leftJoin(stats, eq(stats.mint, memes.mint))
    .leftJoin(holders, eq(holders.mint, memes.mint));

  return { query, volume, txns, holderCount, hot, trending };
};

type BaseRow = Awaited<ReturnType<typeof baseQuery>["query"]>[number];

const visible = () =>
  and(eq(memes.hidden, false), isNotNull(memes.imageUrl)) as SQL;

const progressBps = (row: BaseRow) => {
  if (row.phase === "graduated") return 10_000;
  const sale = (BigInt(row.totalSupply) * 4n) / 5n;
  if (sale === 0n) return 0;
  const bps = (BigInt(row.tokensSold) * 10_000n) / sale;
  return Number(bps > 10_000n ? 10_000n : bps < 0n ? 0n : bps);
};

const sparklines = async (db: Db, mints: string[]) => {
  const byMint = new Map<string, string[]>();
  if (mints.length === 0) return byMint;
  const rows = await db
    .select({ mint: candles.mint, close: candles.close })
    .from(candles)
    .where(
      and(
        inArray(candles.mint, mints),
        eq(candles.interval, "1h"),
        gt(candles.bucketStart, since("h24")),
      ),
    )
    .orderBy(asc(candles.bucketStart));
  for (const row of rows) {
    const points = byMint.get(row.mint) ?? [];
    points.push(row.close);
    byMint.set(row.mint, points);
  }
  return byMint;
};

const toMarketRow = (row: BaseRow, sparkline: string[]): MarketRow => ({
  mint: row.mint,
  name: row.name,
  symbol: row.symbol,
  imageUrl: row.imageUrl,
  phase: row.phase,
  price: row.price,
  marketCap: row.marketCap,
  liquidity: row.liquidity,
  holders: row.holders,
  launchProgressBps: progressBps(row),
  createdAt: row.createdAt.toISOString(),
  change: {
    m5: Number(row.changeM5),
    h1: Number(row.changeH1),
    h6: Number(row.changeH6),
    h24: Number(row.changeH24),
  },
  volume: { m5: row.volM5, h1: row.volH1, h6: row.volH6, h24: row.volH24 },
  txns: { m5: row.txM5, h1: row.txH1, h6: row.txH6, h24: row.txH24 },
  buys24h: row.buys24h,
  sells24h: row.txH24 - row.buys24h,
  makers24h: row.makers24h,
  buyers24h: row.buyers24h,
  sellers24h: row.sellers24h,
  sparkline: sparkline.length ? sparkline : [row.price],
});

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

export const listMarket = async (
  db: Db,
  q: MarketQuery,
): Promise<MarketRow[]> => {
  const { query, volume, txns, holderCount, trending } = baseQuery(db);
  const primary: SQL = {
    trending,
    volume: volume[q.window],
    change: changeOf(q.window),
    txns: txns[q.window],
    mcap: marketCap,
    liquidity,
    holders: holderCount,
    new: sql`${memes.createdAt}`,
  }[q.sort];
  const direction = q.order === "asc" ? asc : desc;
  const tiebreak =
    q.sort === "trending" ? [desc(volume.h24), desc(memes.createdAt)] : [];

  const filters: SQL[] = q.includeHidden ? [] : [visible()];
  if (q.phase !== "all") filters.push(eq(memes.phase, q.phase));
  if (q.mints) {
    if (q.mints.length === 0) return [];
    filters.push(inArray(memes.mint, q.mints));
  }
  if (q.q) {
    const pattern = `%${escapeLike(q.q)}%`;
    filters.push(
      or(
        ilike(memes.name, pattern),
        ilike(memes.symbol, pattern),
        eq(memes.mint, q.q),
      ) as SQL,
    );
  }

  const rows = await query
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(direction(primary), ...tiebreak, asc(memes.mint))
    .limit(q.limit)
    .offset(q.offset);
  const lines = await sparklines(
    db,
    rows.map((row) => row.mint),
  );
  return rows.map((row) => toMarketRow(row, lines.get(row.mint) ?? []));
};

export const listReels = async (
  db: Db,
  limit: number,
  offset: number,
  viewer?: string,
): Promise<Reel[]> => {
  const { query, hot } = baseQuery(db);
  const rows = await query
    .where(visible())
    .orderBy(desc(hot), desc(memes.createdAt), asc(memes.mint))
    .limit(limit)
    .offset(offset);
  const mints = rows.map((row) => row.mint);
  const lines = await sparklines(db, mints);
  const held = new Map<string, string>();
  if (viewer && mints.length) {
    const owned = await db
      .select({ mint: positions.mint, balance: positions.balance })
      .from(positions)
      .where(and(eq(positions.wallet, viewer), inArray(positions.mint, mints)));
    for (const row of owned) held.set(row.mint, row.balance);
  }
  return rows.map((row) => {
    const balance = held.get(row.mint) ?? "0";
    return {
      ...toMarketRow(row, lines.get(row.mint) ?? []),
      memePda: row.memePda,
      creator: row.creator,
      creatorUsername: row.creatorUsername,
      captionTop: row.captionTop,
      captionBottom: row.captionBottom,
      totalSupply: row.totalSupply,
      tradeCount: row.tradeCount,
      viewer: viewer
        ? {
            balance,
            value: (
              (BigInt(balance) * BigInt(row.price)) /
              TOKEN_UNIT
            ).toString(),
          }
        : null,
    };
  });
};

/*
 * "Pumping": visible memes up more than 50% over the last hour (the camera's 🔥 pill).
 */
export const PUMPING_BPS = 5000;

export const countPumping = async (db: Db): Promise<number> => {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(memes)
    .where(and(visible(), sql`${changeOf("h1")} > ${PUMPING_BPS}`));
  return row?.count ?? 0;
};

export interface MarketStats {
  /** SKR base units traded in the last 24h */
  volume24h: string;
  trades24h: number;
  /** memes created since midnight UTC */
  launchesToday: number;
}

/* The stats strip on Markets, over visible memes. */
export const marketStats = async (db: Db): Promise<MarketStats> => {
  const [traded] = await db
    .select({
      volume: sql<string>`coalesce(sum(${trades.skrAmount}), 0)::text`,
      count: sql<number>`count(*)::int`,
    })
    .from(trades)
    .innerJoin(memes, eq(memes.mint, trades.mint))
    .where(and(visible(), gt(trades.blockTime, since("h24"))));
  const [launched] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(memes)
    .where(
      and(visible(), sql`${memes.createdAt} >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`),
    );
  return {
    volume24h: traded?.volume ?? "0",
    trades24h: traded?.count ?? 0,
    launchesToday: launched?.count ?? 0,
  };
};

/* A meme's place on the Trending list (1-based), or null outside the top `limit`. */
export const trendingRank = async (db: Db, mint: string, limit = 20) => {
  const { query, trending, volume } = baseQuery(db);
  const rows = await query
    .where(visible())
    .orderBy(desc(trending), desc(volume.h24), desc(memes.createdAt), asc(memes.mint))
    .limit(limit);
  // memes with no trades today don't count as trending
  const index = rows.filter((row) => row.txH24 > 0).findIndex((row) => row.mint === mint);
  return index < 0 ? null : index + 1;
};
