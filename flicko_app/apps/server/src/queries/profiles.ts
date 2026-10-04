import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { creatorClaims, follows, memes, trades, users } from "../db/schema";
import type { Db } from "../db/types";
import { isSolanaAddress } from "../http/validate";
import { HttpError } from "../middleware/errors";
import { cardQuery, toCard, type MemeCard } from "./memes";
import { getCreatorEarnings, getPortfolio } from "./portfolio";

/* A profile is addressed by wallet or by username. */
export const resolveWallet = async (db: Db, idOrName: string) => {
  if (isSolanaAddress(idOrName)) return idOrName;
  const [user] = await db
    .select({ wallet: users.wallet })
    .from(users)
    .where(eq(users.username, idOrName.toLowerCase()));
  if (!user) throw new HttpError(404, "user not found");
  return user.wallet;
};

const shown = (wallet: string) =>
  and(
    eq(memes.creator, wallet),
    eq(memes.hidden, false),
    isNotNull(memes.imageUrl),
  );

export interface Profile {
  wallet: string;
  username: string | null;
  displayName: string | null;
  bio: string | null;
  avatarId: string | null;
  avatarUrl: string | null;
  counts: { memes: number; followers: number; following: number };
  isFollowing?: boolean;
  creatorStats: {
    /** SKR base units traded across this creator's memes */
    totalVolume: string;
    bestMeme: { symbol: string; changeBps: number } | null;
    graduated: number;
    launched: number;
  };
}

const countOf = async (db: Db, query: Promise<{ n: number }[]>) =>
  (await query)[0]?.n ?? 0;

export const getProfile = async (
  db: Db,
  wallet: string,
  viewer?: string,
): Promise<Profile> => {
  const [user] = await db.select().from(users).where(eq(users.wallet, wallet));
  const created = await cardQuery(db)
    .query.where(shown(wallet))
    .orderBy(desc(memes.createdAt));
  const [volume] = await db
    .select({
      total: sql<string>`coalesce(sum(${trades.skrAmount}), 0)::text`,
    })
    .from(trades)
    .innerJoin(memes, eq(memes.mint, trades.mint))
    .where(eq(memes.creator, wallet));
  const [followers, following, mine] = await Promise.all([
    countOf(
      db,
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(follows)
        .where(eq(follows.followee, wallet)),
    ),
    countOf(
      db,
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(follows)
        .where(eq(follows.follower, wallet)),
    ),
    viewer
      ? db
          .select({ one: sql`1` })
          .from(follows)
          .where(
            and(eq(follows.follower, viewer), eq(follows.followee, wallet)),
          )
      : [],
  ]);
  const best = created
    .map((row) => ({
      symbol: row.symbol,
      changeBps: Number(row.priceChange24hBps),
    }))
    .sort((a, b) => b.changeBps - a.changeBps)[0];
  return {
    wallet,
    username: user?.username ?? null,
    displayName: user?.displayName ?? null,
    bio: user?.bio ?? null,
    avatarId: user?.avatarId ?? null,
    avatarUrl: user?.avatarUrl ?? null,
    counts: { memes: created.length, followers, following },
    ...(viewer ? { isFollowing: mine.length > 0 } : {}),
    creatorStats: {
      totalVolume: volume?.total ?? "0",
      bestMeme: best ?? null,
      graduated: created.filter((row) => row.phase === "graduated").length,
      launched: created.length,
    },
  };
};

export const listCreatedBy = async (
  db: Db,
  wallet: string,
  limit: number,
  offset: number,
): Promise<MemeCard[]> => {
  const rows = await cardQuery(db)
    .query.where(shown(wallet))
    .orderBy(desc(memes.createdAt), memes.mint)
    .limit(limit)
    .offset(offset);
  return rows.map(toCard);
};

/*
 * What anyone may see of a wallet's positions: the top 20 by value with symbol, picture
 * and P&L, never amounts, cost or the total.
 */
export const PUBLIC_HOLDINGS = 20;

export const getPublicHoldings = async (db: Db, wallet: string) => {
  const { holdings } = await getPortfolio(db, wallet);
  return holdings.slice(0, PUBLIC_HOLDINGS).map((holding) => ({
    mint: holding.mint,
    symbol: holding.symbol,
    imageUrl: holding.imageUrl,
    phase: holding.phase,
    pnlBps: holding.unrealizedPnlBps,
    priceChange24hBps: holding.priceChange24hBps,
  }));
};

export interface ActivityItem {
  type: "buy" | "sell" | "launch" | "claim";
  mint: string;
  symbol: string;
  /** SKR base units (0 for a launch) */
  skr: string;
  at: string;
}

/*
 * The wallet's own trades, launches and fee claims, newest first. Each source is read up
 * to offset + limit rows so the merged page is exact.
 */
export const listActivity = async (
  db: Db,
  wallet: string,
  limit: number,
  offset: number,
): Promise<ActivityItem[]> => {
  const take = offset + limit;
  const [traded, launched, claimed] = await Promise.all([
    db
      .select({
        isBuy: trades.isBuy,
        mint: trades.mint,
        symbol: memes.symbol,
        skr: trades.skrAmount,
        at: trades.blockTime,
      })
      .from(trades)
      .innerJoin(memes, eq(memes.mint, trades.mint))
      .where(eq(trades.trader, wallet))
      .orderBy(desc(trades.blockTime))
      .limit(take),
    db
      .select({ mint: memes.mint, symbol: memes.symbol, at: memes.createdAt })
      .from(memes)
      .where(eq(memes.creator, wallet))
      .orderBy(desc(memes.createdAt))
      .limit(take),
    db
      .select({
        mint: creatorClaims.mint,
        symbol: memes.symbol,
        skr: creatorClaims.amount,
        at: creatorClaims.blockTime,
      })
      .from(creatorClaims)
      .innerJoin(memes, eq(memes.mint, creatorClaims.mint))
      .where(eq(creatorClaims.creator, wallet))
      .orderBy(desc(creatorClaims.blockTime))
      .limit(take),
  ]);
  const items: (ActivityItem & { time: number })[] = [
    ...traded.map((row) => ({
      type: (row.isBuy ? "buy" : "sell") as ActivityItem["type"],
      mint: row.mint,
      symbol: row.symbol,
      skr: row.skr,
      at: row.at.toISOString(),
      time: row.at.getTime(),
    })),
    ...launched.map((row) => ({
      type: "launch" as const,
      mint: row.mint,
      symbol: row.symbol,
      skr: "0",
      at: row.at.toISOString(),
      time: row.at.getTime(),
    })),
    ...claimed.map((row) => ({
      type: "claim" as const,
      mint: row.mint,
      symbol: row.symbol,
      skr: row.skr,
      at: row.at.toISOString(),
      time: row.at.getTime(),
    })),
  ];
  return items
    .sort((a, b) => b.time - a.time)
    .slice(offset, take)
    .map(({ time: _time, ...item }) => item);
};

/* Memes of the wallet that still have creator fees to claim. */
export const claimableFees = async (db: Db, wallet: string) => {
  const { items } = await getCreatorEarnings(db, wallet);
  return items
    .filter((item) => BigInt(item.feesClaimable) > 0n)
    .map((item) => ({
      mint: item.mint,
      symbol: item.symbol,
      claimable: item.feesClaimable,
    }));
};
