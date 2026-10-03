import { and, asc, count, desc, eq, gt, lte, sql } from "drizzle-orm";
import { memes, positions, reactions, trades } from "../db/schema";
import type { Db } from "../db/types";
import { listMarket, trendingRank, type MarketRow } from "./market";
import { TOKEN_UNIT } from "./memes";

export const REACTIONS = reactions.kind.enumValues;
export type ReactionKind = (typeof REACTIONS)[number];

export interface Position {
  /** meme token base units */
  balance: string;
  /** SKR base units per whole token */
  avgBuyPrice: string;
  /** SKR base units at the current price */
  value: string;
  costBasis: string;
  /** value − cost basis, SKR base units (may be negative) */
  pnl: string;
  pnlBps: number;
}

/*
 * Everything the meme page's Overview tab adds on top of the meme itself: per-window
 * change/volume, liquidity, 24h activity, the trending rank, the creator's share of
 * supply, reactions, and (signed in) the viewer's position.
 */
export interface MemeOverview {
  market: Omit<MarketRow, "mint" | "name" | "symbol" | "imageUrl" | "createdAt">;
  trendingRank: number | null;
  /** price over the last 24h (or since launch), oldest first, SKR base units per token */
  priceLine: string[];
  creatorBalance: string;
  creatorHoldsBps: number;
  creatorMemes: number;
  reactions: Record<ReactionKind, number>;
  myReactions: ReactionKind[];
  position: Position | null;
}

export const LINE_POINTS = 48;
const DAY_MS = 24 * 3_600_000;

/*
 * The 24h price line: LINE_POINTS evenly spaced samples from 24h ago (or launch, if
 * later) to now, each the price after the last trade at or before that moment. The
 * first sample uses the last trade before the window, else the start price.
 */
export const priceLine = async (
  db: Db,
  mint: string,
  startPrice: string,
  createdAt: Date,
  now = new Date(),
): Promise<string[]> => {
  const from = new Date(Math.max(now.getTime() - DAY_MS, createdAt.getTime()));
  const [before, inside] = await Promise.all([
    db
      .select({ price: trades.priceAfter })
      .from(trades)
      .where(and(eq(trades.mint, mint), lte(trades.blockTime, from)))
      .orderBy(desc(trades.slot), desc(trades.eventIndex))
      .limit(1),
    db
      .select({ price: trades.priceAfter, at: trades.blockTime })
      .from(trades)
      .where(and(eq(trades.mint, mint), gt(trades.blockTime, from)))
      .orderBy(asc(trades.slot), asc(trades.eventIndex)),
  ]);
  let price = before[0]?.price ?? startPrice;
  const span = Math.max(1, now.getTime() - from.getTime());
  const line: string[] = [];
  let next = 0;
  for (let i = 0; i < LINE_POINTS; i++) {
    const at = from.getTime() + (span * i) / (LINE_POINTS - 1);
    for (let t = inside[next]; t && t.at.getTime() <= at; t = inside[++next]) price = t.price;
    line.push(price);
  }
  return line;
};

const bps = (part: bigint, whole: bigint) =>
  whole === 0n ? 0 : Number((part * 10_000n) / whole);

export const getOverview = async (
  db: Db,
  mint: string,
  viewer?: string,
): Promise<MemeOverview | null> => {
  const [row] = await listMarket(db, {
    sort: "new",
    window: "h24",
    order: "desc",
    phase: "all",
    mints: [mint],
    includeHidden: true,
    limit: 1,
    offset: 0,
  });
  if (!row) return null;
  const [meme] = await db
    .select({
      creator: memes.creator,
      totalSupply: memes.totalSupply,
      startPrice: memes.startPrice,
      createdAt: memes.createdAt,
    })
    .from(memes)
    .where(eq(memes.mint, mint));
  if (!meme) return null;

  const [creatorPosition, [made], counts, rank, line] = await Promise.all([
    db
      .select({ balance: positions.balance })
      .from(positions)
      .where(and(eq(positions.mint, mint), eq(positions.wallet, meme.creator)))
      .then((rows) => rows[0]),
    db.select({ n: count() }).from(memes).where(eq(memes.creator, meme.creator)),
    db
      .select({ kind: reactions.kind, n: count() })
      .from(reactions)
      .where(eq(reactions.mint, mint))
      .groupBy(reactions.kind),
    trendingRank(db, mint),
    priceLine(db, mint, meme.startPrice, meme.createdAt),
  ]);

  const tally = Object.fromEntries(REACTIONS.map((k) => [k, 0])) as Record<ReactionKind, number>;
  for (const c of counts) tally[c.kind] = c.n;

  let myReactions: ReactionKind[] = [];
  let position: Position | null = null;
  if (viewer) {
    const [mine, [held]] = await Promise.all([
      db
        .select({ kind: reactions.kind })
        .from(reactions)
        .where(and(eq(reactions.mint, mint), eq(reactions.wallet, viewer))),
      db
        .select({ balance: positions.balance, costBasis: positions.costBasisSkr })
        .from(positions)
        .where(and(eq(positions.mint, mint), eq(positions.wallet, viewer))),
    ]);
    myReactions = mine.map((r) => r.kind);
    const balance = BigInt(held?.balance ?? "0");
    if (balance > 0n) {
      const cost = BigInt(held!.costBasis);
      const value = (balance * BigInt(row.price)) / TOKEN_UNIT;
      position = {
        balance: balance.toString(),
        avgBuyPrice: ((cost * TOKEN_UNIT) / balance).toString(),
        value: value.toString(),
        costBasis: cost.toString(),
        pnl: (value - cost).toString(),
        pnlBps: bps(value - cost, cost),
      };
    }
  }

  const creatorBalance = BigInt(creatorPosition?.balance ?? "0");
  const { mint: _m, name: _n, symbol: _s, imageUrl: _i, createdAt: _c, ...market } = row;
  return {
    market,
    trendingRank: rank,
    priceLine: line,
    creatorBalance: creatorBalance.toString(),
    creatorHoldsBps: bps(creatorBalance, BigInt(meme.totalSupply)),
    creatorMemes: made?.n ?? 0,
    reactions: tally,
    myReactions,
    position,
  };
};

export const addReaction = (db: Db, wallet: string, mint: string, kind: ReactionKind) =>
  db.insert(reactions).values({ wallet, mint, kind }).onConflictDoNothing();

export const removeReaction = (db: Db, wallet: string, mint: string, kind: ReactionKind) =>
  db
    .delete(reactions)
    .where(
      and(eq(reactions.wallet, wallet), eq(reactions.mint, mint), sql`${reactions.kind} = ${kind}`),
    );
