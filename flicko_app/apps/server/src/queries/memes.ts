import { and, asc, desc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import {
  candles,
  follows,
  memes,
  positions,
  trades,
  users,
} from "../db/schema";
import type { Db } from "../db/types";

export type FeedTab = "new" | "trending" | "gainers" | "following";
export type CandleInterval = (typeof candles.interval.enumValues)[number];

export interface MemeCard {
  mint: string;
  name: string;
  symbol: string;
  uri: string;
  imageUrl: string | null;
  creator: string;
  creatorUsername: string | null;
  /** the creator's bundled avatar id or uploaded photo url (at most one is set) */
  creatorAvatarId: string | null;
  creatorAvatarUrl: string | null;
  phase: "launch" | "graduated";
  price: string;
  priceChange24hBps: number;
  volume24h: string;
  tradeCount: number;
  launchProgressBps: number;
  createdAt: string;
  /** base units (6 decimals) */
  totalSupply: string;
  /** base units sold in launch (out of totalSupply × 4/5) */
  tokensSold: string;
  /** SKR base units per whole token */
  startPrice: string;
  graduatedAt: string | null;
  /** whether the signed-in viewer follows the creator (only set when a viewer is known) */
  creatorFollowed?: boolean;
}

export interface MemeDetail extends MemeCard {
  memePda: string;
  imageHash: string;
  captionTop: string | null;
  captionBottom: string | null;
  totalSupply: string;
  startPrice: string;
  tokensSold: string;
  saleSupply: string;
  realSkr: string;
  poolSkr: string;
  poolTokens: string;
  holders: number;
  marketCap: string;
  hidden: boolean;
  graduatedAt: string | null;
  lastTradeAt: string | null;
}

export interface Candle {
  time: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  trades: number;
}

export interface TradeRow {
  signature: string;
  trader: string;
  isBuy: boolean;
  skrAmount: string;
  tokenAmount: string;
  priceAfter: string;
  phase: "launch" | "graduated";
  blockTime: string;
}

export const TOKEN_UNIT = 1_000_000n;

const saleSupplyOf = (totalSupply: string) => (BigInt(totalSupply) * 4n) / 5n;

const progressBps = (
  phase: string,
  tokensSold: string,
  totalSupply: string,
) => {
  if (phase === "graduated") return 10_000;
  const sale = saleSupplyOf(totalSupply);
  if (sale === 0n) return 0;
  const bps = (BigInt(tokensSold) * 10_000n) / sale;
  return Number(bps < 0n ? 0n : bps > 10_000n ? 10_000n : bps);
};

const volumeSub = (db: Db) =>
  db
    .select({
      mint: trades.mint,
      volume24h: sql<string>`sum(${trades.skrAmount})`.as("volume24h"),
    })
    .from(trades)
    .where(gt(trades.blockTime, sql`now() - interval '24 hours'`))
    .groupBy(trades.mint)
    .as("v");

/*
 * The curve's spot price before any trade, with the program's integer math
 * (launchParams then spotPrice, both truncating). It can sit a unit below start_price,
 * so changes measured against start_price showed a false drop on untraded memes.
 */
export const launchSpot = sql`div(div(${memes.startPrice} * div(${memes.totalSupply} * 16, 15), 1000000) * 1000000, div(${memes.totalSupply} * 16, 15))`;

const referencePrice = sql`coalesce((select ${trades.priceAfter} from ${trades}
  where ${trades.mint} = ${memes.mint} and ${trades.blockTime} <= now() - interval '24 hours'
  order by ${trades.slot} desc, ${trades.eventIndex} desc limit 1), ${launchSpot})`;

export const changeBps = sql`(case when ${referencePrice} = 0 then 0
  else trunc((${memes.price} - ${referencePrice}) * 10000 / ${referencePrice}) end)`;

export const cardQuery = (db: Db) => {
  const volume = volumeSub(db);
  const volume24h = sql`coalesce(${volume.volume24h}, 0)`;
  const query = db
    .select({
      mint: memes.mint,
      memePda: memes.memePda,
      creator: memes.creator,
      creatorUsername: users.username,
      creatorAvatarId: users.avatarId,
      creatorAvatarUrl: users.avatarUrl,
      name: memes.name,
      symbol: memes.symbol,
      uri: memes.uri,
      imageUrl: memes.imageUrl,
      imageHash: memes.imageHash,
      captionTop: memes.captionTop,
      captionBottom: memes.captionBottom,
      totalSupply: memes.totalSupply,
      startPrice: memes.startPrice,
      phase: memes.phase,
      price: memes.price,
      tokensSold: memes.tokensSold,
      realSkr: memes.realSkr,
      poolSkr: memes.poolSkr,
      poolTokens: memes.poolTokens,
      tradeCount: memes.tradeCount,
      hidden: memes.hidden,
      createdAt: memes.createdAt,
      graduatedAt: memes.graduatedAt,
      lastTradeAt: memes.lastTradeAt,
      volume24h: sql<string>`${volume24h}::text`,
      priceChange24hBps: sql<string>`${changeBps}::text`,
    })
    .from(memes)
    .leftJoin(users, eq(users.wallet, memes.creator))
    .leftJoin(volume, eq(volume.mint, memes.mint));
  return { query, volume24h };
};

type CardRow = Awaited<ReturnType<typeof cardQuery>["query"]>[number];

export const toCard = (row: CardRow): MemeCard => ({
  mint: row.mint,
  name: row.name,
  symbol: row.symbol,
  uri: row.uri,
  imageUrl: row.imageUrl,
  creator: row.creator,
  creatorUsername: row.creatorUsername,
  creatorAvatarId: row.creatorAvatarId,
  creatorAvatarUrl: row.creatorAvatarUrl,
  phase: row.phase,
  price: row.price,
  priceChange24hBps: Number(row.priceChange24hBps),
  volume24h: row.volume24h,
  tradeCount: row.tradeCount,
  launchProgressBps: progressBps(row.phase, row.tokensSold, row.totalSupply),
  createdAt: row.createdAt.toISOString(),
  totalSupply: row.totalSupply,
  tokensSold: row.tokensSold,
  startPrice: row.startPrice,
  graduatedAt: row.graduatedAt?.toISOString() ?? null,
});

export const listFeed = async (
  db: Db,
  tab: FeedTab,
  limit: number,
  offset: number,
  viewer?: string,
): Promise<MemeCard[]> => {
  const { query, volume24h } = cardQuery(db);
  const order = {
    new: [desc(memes.createdAt), asc(memes.mint)],
    trending: [
      desc(volume24h),
      desc(memes.tradeCount),
      desc(memes.createdAt),
      asc(memes.mint),
    ],
    gainers: [desc(changeBps), desc(volume24h), asc(memes.mint)],
    following: [desc(memes.createdAt), asc(memes.mint)],
  }[tab];
  const visible = and(eq(memes.hidden, false), isNotNull(memes.imageUrl));
  const rows = await query
    .where(
      tab === "following"
        ? and(
            visible,
            inArray(
              memes.creator,
              db
                .select({ wallet: follows.followee })
                .from(follows)
                .where(eq(follows.follower, viewer ?? "")),
            ),
          )
        : visible,
    )
    .orderBy(...order)
    .limit(limit)
    .offset(offset);
  const cards = rows.map(toCard);
  if (!viewer) return cards;
  const followed = await followedAmong(
    db,
    viewer,
    cards.map((card) => card.creator),
  );
  return cards.map((card) => ({
    ...card,
    creatorFollowed: followed.has(card.creator),
  }));
};

/* The subset of `wallets` that `viewer` follows. */
export const followedAmong = async (
  db: Db,
  viewer: string,
  wallets: string[],
) => {
  if (!wallets.length) return new Set<string>();
  const rows = await db
    .select({ wallet: follows.followee })
    .from(follows)
    .where(
      and(eq(follows.follower, viewer), inArray(follows.followee, wallets)),
    );
  return new Set(rows.map((row) => row.wallet));
};

export const memeExists = async (db: Db, mint: string) => {
  const [row] = await db
    .select({ mint: memes.mint })
    .from(memes)
    .where(eq(memes.mint, mint));
  return row !== undefined;
};

export const symbolTaken = async (db: Db, symbol: string) => {
  const [row] = await db
    .select({ mint: memes.mint })
    .from(memes)
    .where(sql`upper(${memes.symbol}) = ${symbol.toUpperCase()}`)
    .limit(1);
  return row !== undefined;
};

export const getMeme = async (
  db: Db,
  mint: string,
): Promise<MemeDetail | null> => {
  const [row] = await cardQuery(db).query.where(eq(memes.mint, mint));
  if (!row) return null;
  const [holders] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(positions)
    .where(and(eq(positions.mint, mint), gt(positions.balance, "0")));
  return {
    ...toCard(row),
    memePda: row.memePda,
    imageHash: row.imageHash,
    captionTop: row.captionTop,
    captionBottom: row.captionBottom,
    totalSupply: row.totalSupply,
    startPrice: row.startPrice,
    tokensSold: row.tokensSold,
    saleSupply: saleSupplyOf(row.totalSupply).toString(),
    realSkr: row.realSkr,
    poolSkr: row.poolSkr,
    poolTokens: row.poolTokens,
    holders: holders?.n ?? 0,
    marketCap: (
      (BigInt(row.price) * BigInt(row.totalSupply)) /
      TOKEN_UNIT
    ).toString(),
    hidden: row.hidden,
    graduatedAt: row.graduatedAt?.toISOString() ?? null,
    lastTradeAt: row.lastTradeAt?.toISOString() ?? null,
  };
};

export const listCandles = async (
  db: Db,
  mint: string,
  interval: CandleInterval,
  limit: number,
): Promise<Candle[]> => {
  const rows = await db
    .select()
    .from(candles)
    .where(and(eq(candles.mint, mint), eq(candles.interval, interval)))
    .orderBy(desc(candles.bucketStart))
    .limit(limit);
  return rows.reverse().map((row) => ({
    time: row.bucketStart.toISOString(),
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volumeSkr,
    trades: row.trades,
  }));
};

export interface TradeFilter {
  side?: "buy" | "sell";
  trader?: string;
}

export const listTrades = async (
  db: Db,
  mint: string,
  limit: number,
  offset: number,
  filter: TradeFilter = {},
): Promise<TradeRow[]> => {
  const rows = await db
    .select()
    .from(trades)
    .where(
      and(
        eq(trades.mint, mint),
        filter.side ? eq(trades.isBuy, filter.side === "buy") : undefined,
        filter.trader ? eq(trades.trader, filter.trader) : undefined,
      ),
    )
    .orderBy(desc(trades.slot), desc(trades.eventIndex))
    .limit(limit)
    .offset(offset);
  return rows.map((row) => ({
    signature: row.signature,
    trader: row.trader,
    isBuy: row.isBuy,
    skrAmount: row.skrAmount,
    tokenAmount: row.tokenAmount,
    priceAfter: row.priceAfter,
    phase: row.phase,
    blockTime: row.blockTime.toISOString(),
  }));
};

/*
 * The SKR size at the 95th percentile of this meme's trades: trades at or above it are
 * its "large" ones. Null before any trade.
 */
export const largeTradeSkr = async (db: Db, mint: string) => {
  const [row] = await db
    .select({
      p95: sql<
        string | null
      >`trunc(percentile_cont(0.95) within group (order by ${trades.skrAmount}))::text`,
    })
    .from(trades)
    .where(eq(trades.mint, mint));
  return row?.p95 ?? null;
};
