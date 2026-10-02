import { launchParams, spotPrice } from "@flicko/sdk";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  candles,
  creatorClaims,
  memes,
  positions,
  trades,
  uploads,
} from "../db/schema";
import type { Db } from "../db/types";
import type { FlickoEvent, Phase } from "./events";

export interface ChainTransaction {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: unknown;
  logs: string[];
}

export interface MemeChainState {
  phase: Phase;
  tokensSold: string;
  realSkr: string;
  poolSkr: string;
  poolTokens: string;
  price: string;
}

export interface ApplyDeps {
  db: Db;
  decode: (logs: string[]) => FlickoEvent[];
  loadMemeState: (memePda: string) => Promise<MemeChainState | null>;
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type TradeEvent = Extract<FlickoEvent, { kind: "trade" }>;

const INTERVALS = [
  ["1m", 60_000],
  ["5m", 300_000],
  ["1h", 3_600_000],
  ["1d", 86_400_000],
] as const;

const bucketOf = (time: Date, size: number) =>
  new Date(Math.floor(time.getTime() / size) * size);

const mintOf = async (tx: Tx, memePda: string) => {
  const [row] = await tx
    .select({ mint: memes.mint })
    .from(memes)
    .where(eq(memes.memePda, memePda));
  return row?.mint;
};

const linkUpload = async (
  tx: Tx,
  mint: string,
  creator: string,
  imageHash: string,
) => {
  const [upload] = await tx
    .select({
      imageUrl: uploads.imageUrl,
      captionTop: uploads.captionTop,
      captionBottom: uploads.captionBottom,
    })
    .from(uploads)
    .where(
      and(eq(uploads.imageHash, imageHash), eq(uploads.status, "finalized")),
    )
    .orderBy(sql`${uploads.wallet} = ${creator} desc`, desc(uploads.createdAt))
    .limit(1);
  if (!upload) return;
  await tx.update(memes).set(upload).where(eq(memes.mint, mint));
};

const updatePosition = async (tx: Tx, mint: string, event: TradeEvent) => {
  const [current] = await tx
    .select()
    .from(positions)
    .where(
      sql`${positions.wallet} = ${event.trader} and ${positions.mint} = ${mint}`,
    );

  let balance = BigInt(current?.balance ?? "0");
  let cost = BigInt(current?.costBasisSkr ?? "0");
  let realized = BigInt(current?.realizedPnlSkr ?? "0");
  const tokens = BigInt(event.tokenAmount);
  const skr = BigInt(event.skrAmount);

  if (event.isBuy) {
    balance += tokens;
    cost += skr;
  } else {
    const sold = tokens < balance ? tokens : balance;
    const removed = balance > 0n ? (cost * sold) / balance : 0n;
    realized += skr - removed;
    cost -= removed;
    balance -= sold;
  }

  const values = {
    balance: balance.toString(),
    costBasisSkr: cost.toString(),
    realizedPnlSkr: realized.toString(),
    updatedAt: new Date(),
  };
  await tx
    .insert(positions)
    .values({ wallet: event.trader, mint, ...values })
    .onConflictDoUpdate({
      target: [positions.wallet, positions.mint],
      set: values,
    });
};

const updateCandles = async (
  tx: Tx,
  mint: string,
  event: TradeEvent,
  time: Date,
) => {
  for (const [interval, size] of INTERVALS) {
    await tx
      .insert(candles)
      .values({
        mint,
        interval,
        bucketStart: bucketOf(time, size),
        open: event.priceAfter,
        high: event.priceAfter,
        low: event.priceAfter,
        close: event.priceAfter,
        volumeSkr: event.skrAmount,
        trades: 1,
      })
      .onConflictDoUpdate({
        target: [candles.mint, candles.interval, candles.bucketStart],
        set: {
          high: sql`greatest(${candles.high}, excluded.high)`,
          low: sql`least(${candles.low}, excluded.low)`,
          close: sql`excluded.close`,
          volumeSkr: sql`${candles.volumeSkr} + excluded.volume_skr`,
          trades: sql`${candles.trades} + 1`,
        },
      });
  }
};

const applyEvent = async (
  tx: Tx,
  event: FlickoEvent,
  index: number,
  source: ChainTransaction,
  time: Date,
) => {
  switch (event.kind) {
    case "memeCreated": {
      const params = launchParams(
        BigInt(event.totalSupply),
        BigInt(event.startPrice),
      );
      await tx
        .insert(memes)
        .values({
          mint: event.mint,
          memePda: event.meme,
          creator: event.creator,
          name: event.name,
          symbol: event.symbol,
          uri: event.uri,
          imageHash: event.imageHash,
          totalSupply: event.totalSupply,
          startPrice: event.startPrice,
          price: spotPrice(params.virtualSkr, params.virtualTokens).toString(),
          createdSlot: source.slot,
          createdAt: new Date(event.createdAt * 1000),
        })
        .onConflictDoNothing();
      await linkUpload(tx, event.mint, event.creator, event.imageHash);
      return null;
    }
    case "trade": {
      const mint = await mintOf(tx, event.meme);
      if (!mint) return null;
      const inserted = await tx
        .insert(trades)
        .values({
          signature: source.signature,
          eventIndex: index,
          mint,
          trader: event.trader,
          isBuy: event.isBuy,
          skrAmount: event.skrAmount,
          tokenAmount: event.tokenAmount,
          creatorFee: event.creatorFee,
          burned: event.burned,
          priceAfter: event.priceAfter,
          phase: event.phase,
          slot: source.slot,
          blockTime: time,
        })
        .onConflictDoNothing()
        .returning({ signature: trades.signature });
      if (!inserted.length) return null;

      await tx
        .update(memes)
        .set({
          price: event.priceAfter,
          phase: event.phase,
          tradeCount: sql`${memes.tradeCount} + 1`,
          lastTradeAt: time,
        })
        .where(eq(memes.mint, mint));
      await updatePosition(tx, mint, event);
      await updateCandles(tx, mint, event, time);
      return event.meme;
    }
    case "graduated": {
      await tx
        .update(memes)
        .set({
          phase: "graduated",
          poolSkr: event.poolSkr,
          poolTokens: event.poolTokens,
          graduatedAt: new Date(event.graduatedAt * 1000),
        })
        .where(eq(memes.memePda, event.meme));
      return event.meme;
    }
    case "creatorFeesClaimed": {
      const mint = await mintOf(tx, event.meme);
      if (!mint) return null;
      await tx
        .insert(creatorClaims)
        .values({
          signature: source.signature,
          eventIndex: index,
          mint,
          creator: event.creator,
          amount: event.amount,
          slot: source.slot,
          blockTime: time,
        })
        .onConflictDoNothing();
      return null;
    }
  }
};

export const applyTransaction = async (
  deps: ApplyDeps,
  source: ChainTransaction,
) => {
  if (source.err) return { events: 0, touched: [] as string[] };

  const events = deps.decode(source.logs);
  const time = new Date((source.blockTime ?? Date.now() / 1000) * 1000);
  const touched = new Set<string>();

  await deps.db.transaction(async (tx) => {
    for (const [index, event] of events.entries()) {
      const meme = await applyEvent(tx, event, index, source, time);
      if (meme) touched.add(meme);
    }
  });

  for (const memePda of touched) {
    const state = await deps.loadMemeState(memePda);
    if (state) {
      await deps.db.update(memes).set(state).where(eq(memes.memePda, memePda));
    }
  }

  return { events: events.length, touched: [...touched] };
};
