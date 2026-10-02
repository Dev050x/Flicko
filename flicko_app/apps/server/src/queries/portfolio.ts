import { desc, eq, sql } from "drizzle-orm";
import { creatorClaims, memes, positions, trades } from "../db/schema";
import type { Db } from "../db/types";
import {
  cardQuery,
  changeBps,
  TOKEN_UNIT,
  toCard,
  type MemeCard,
} from "./memes";

export interface Holding {
  mint: string;
  name: string;
  symbol: string;
  imageUrl: string | null;
  phase: "launch" | "graduated";
  price: string;
  priceChange24hBps: number;
  balance: string;
  value: string;
  costBasis: string;
  unrealizedPnl: string;
  unrealizedPnlBps: number;
  realizedPnl: string;
}

export interface Portfolio {
  totals: {
    value: string;
    costBasis: string;
    unrealizedPnl: string;
    realizedPnl: string;
  };
  holdings: Holding[];
}

export interface CreatedMeme extends MemeCard {
  feesEarned: string;
  feesClaimed: string;
  feesClaimable: string;
}

export interface CreatorEarnings {
  totals: { earned: string; claimed: string; claimable: string };
  items: CreatedMeme[];
}

const bps = (part: bigint, whole: bigint) =>
  whole === 0n ? 0 : Number((part * 10_000n) / whole);

export const getPortfolio = async (
  db: Db,
  wallet: string,
): Promise<Portfolio> => {
  const rows = await db
    .select({
      mint: memes.mint,
      name: memes.name,
      symbol: memes.symbol,
      imageUrl: memes.imageUrl,
      phase: memes.phase,
      price: memes.price,
      priceChange24hBps: sql<string>`${changeBps}::text`,
      balance: positions.balance,
      costBasis: positions.costBasisSkr,
      realizedPnl: positions.realizedPnlSkr,
    })
    .from(positions)
    .innerJoin(memes, eq(memes.mint, positions.mint))
    .where(eq(positions.wallet, wallet));

  let totalValue = 0n;
  let totalCost = 0n;
  let totalRealized = 0n;
  const holdings: Holding[] = [];
  for (const row of rows) {
    const balance = BigInt(row.balance);
    const realized = BigInt(row.realizedPnl);
    totalRealized += realized;
    if (balance === 0n) continue;
    const value = (balance * BigInt(row.price)) / TOKEN_UNIT;
    const cost = BigInt(row.costBasis);
    totalValue += value;
    totalCost += cost;
    holdings.push({
      mint: row.mint,
      name: row.name,
      symbol: row.symbol,
      imageUrl: row.imageUrl,
      phase: row.phase,
      price: row.price,
      priceChange24hBps: Number(row.priceChange24hBps),
      balance: row.balance,
      value: value.toString(),
      costBasis: row.costBasis,
      unrealizedPnl: (value - cost).toString(),
      unrealizedPnlBps: bps(value - cost, cost),
      realizedPnl: row.realizedPnl,
    });
  }
  holdings.sort((a, b) => {
    const diff = BigInt(b.value) - BigInt(a.value);
    return diff > 0n ? 1 : diff < 0n ? -1 : a.mint.localeCompare(b.mint);
  });

  return {
    totals: {
      value: totalValue.toString(),
      costBasis: totalCost.toString(),
      unrealizedPnl: (totalValue - totalCost).toString(),
      realizedPnl: totalRealized.toString(),
    },
    holdings,
  };
};

export const getCreatorEarnings = async (
  db: Db,
  wallet: string,
): Promise<CreatorEarnings> => {
  const cards = await cardQuery(db)
    .query.where(eq(memes.creator, wallet))
    .orderBy(desc(memes.createdAt), memes.mint);
  const earnedSub = db
    .select({
      mint: trades.mint,
      earned: sql<string>`sum(${trades.creatorFee})`.as("earned"),
    })
    .from(trades)
    .groupBy(trades.mint)
    .as("earned_fees");
  const claimedSub = db
    .select({
      mint: creatorClaims.mint,
      claimed: sql<string>`sum(${creatorClaims.amount})`.as("claimed"),
    })
    .from(creatorClaims)
    .groupBy(creatorClaims.mint)
    .as("claimed_fees");
  const fees = await db
    .select({
      mint: memes.mint,
      earned: sql<string>`coalesce(${earnedSub.earned}, 0)::text`,
      claimed: sql<string>`coalesce(${claimedSub.claimed}, 0)::text`,
    })
    .from(memes)
    .leftJoin(earnedSub, eq(earnedSub.mint, memes.mint))
    .leftJoin(claimedSub, eq(claimedSub.mint, memes.mint))
    .where(eq(memes.creator, wallet));
  const feesByMint = new Map(fees.map((row) => [row.mint, row]));

  let earned = 0n;
  let claimed = 0n;
  const items = cards.map((row): CreatedMeme => {
    const fee = feesByMint.get(row.mint);
    const memeEarned = BigInt(fee?.earned ?? "0");
    const memeClaimed = BigInt(fee?.claimed ?? "0");
    const claimable = memeEarned > memeClaimed ? memeEarned - memeClaimed : 0n;
    earned += memeEarned;
    claimed += memeClaimed;
    return {
      ...toCard(row),
      feesEarned: memeEarned.toString(),
      feesClaimed: memeClaimed.toString(),
      feesClaimable: claimable.toString(),
    };
  });

  const claimable = items.reduce(
    (sum, item) => sum + BigInt(item.feesClaimable),
    0n,
  );
  return {
    totals: {
      earned: earned.toString(),
      claimed: claimed.toString(),
      claimable: claimable.toString(),
    },
    items,
  };
};
