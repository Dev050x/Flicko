import { beforeEach, describe, expect, test } from "bun:test";
import {
  getReadonlyProgram,
  memePrice,
  PROGRAM_ID,
  toMemeState,
} from "@flicko/sdk";
import { Connection } from "@solana/web3.js";
import { eq } from "drizzle-orm";
import {
  candles,
  indexerState,
  memes,
  positions,
  trades,
  uploads,
} from "../src/db/schema";
import { applyTransaction, type MemeChainState } from "../src/indexer/apply";
import type { ChainSource } from "../src/indexer/chain";
import { createEventDecoder } from "../src/indexer/events";
import { createIndexer } from "../src/indexer/indexer";
import fixture from "./fixtures/devnet-smoke.json";
import { migratedDb } from "./support";

/*
 * Real devnet data from the smoke test: create meme, buy 5 SKR, sell half, claim fees.
 * The meme account snapshot stands in for the chain when the indexer refreshes meme state.
 */
const MINT = fixture.mint;
const TRADER = "HcVaU1rFeQUQujC24G3d35nBxpNc29cJV4Kfmr3LoYH";
const decode = createEventDecoder(PROGRAM_ID);
const program = getReadonlyProgram(new Connection("http://127.0.0.1:1"));

const chainState = (): MemeChainState => {
  const state = toMemeState(
    program.coder.accounts.decode(
      "meme",
      Buffer.from(fixture.memeAccount, "base64"),
    ),
  );
  return {
    phase: state.phase,
    tokensSold: state.tokensSold.toString(),
    realSkr: state.realSkr.toString(),
    poolSkr: state.poolSkr.toString(),
    poolTokens: state.poolTokens.toString(),
    price: memePrice(state).toString(),
  };
};

const transactions = fixture.transactions;
let db: Awaited<ReturnType<typeof migratedDb>>;

beforeEach(async () => {
  db = await migratedDb();
});

const applyAll = async () => {
  for (const tx of transactions) {
    await applyTransaction(
      { db, decode, loadMemeState: async () => chainState() },
      tx,
    );
  }
};

describe("event decoding", () => {
  test("decodes the four devnet transactions", () => {
    expect(
      transactions.map((tx) => decode(tx.logs).map((e) => e.kind)),
    ).toEqual([["memeCreated"], ["trade"], ["trade"], ["creatorFeesClaimed"]]);
    const [created] = decode(transactions[0]!.logs);
    expect(created).toMatchObject({
      kind: "memeCreated",
      mint: MINT,
      name: "Smoke Test",
      symbol: "SMOKE",
      totalSupply: "1000000000000",
      startPrice: "1000",
    });
  });
});

describe("applying transactions", () => {
  test("creates the meme and refreshes its state from the chain", async () => {
    await applyAll();
    const [meme] = await db.select().from(memes).where(eq(memes.mint, MINT));
    expect(meme).toMatchObject({
      name: "Smoke Test",
      creator: TRADER,
      phase: "launch",
      tradeCount: 2,
      tokensSold: "2426410547",
      realSkr: "2431943",
      price: chainState().price,
    });
    expect(meme!.lastTradeAt!.getTime()).toBe(
      transactions[2]!.blockTime! * 1000,
    );
  });

  test("links the meme to the creator's finalized upload", async () => {
    const [created] = decode(transactions[0]!.logs);
    const imageHash = (created as { imageHash: string }).imageHash;
    const upload = (
      wallet: string,
      status: "pending" | "finalized",
      n: number,
    ) => ({
      wallet,
      rawKey: `raw/${n}.jpg`,
      imageHash,
      status,
      imageUrl: `https://blobs.test/memes/${n}.jpg`,
      captionTop: `TOP ${n}`,
      captionBottom: `BOTTOM ${n}`,
    });
    await db
      .insert(uploads)
      .values([
        upload("someone-else", "finalized", 1),
        upload(TRADER, "finalized", 2),
        upload(TRADER, "pending", 3),
      ]);
    await applyAll();
    const [meme] = await db.select().from(memes).where(eq(memes.mint, MINT));
    expect(meme).toMatchObject({
      imageUrl: "https://blobs.test/memes/2.jpg",
      captionTop: "TOP 2",
      captionBottom: "BOTTOM 2",
    });
  });

  test("leaves image fields empty when no upload matches", async () => {
    await applyAll();
    const [meme] = await db.select().from(memes).where(eq(memes.mint, MINT));
    expect(meme).toMatchObject({
      imageUrl: null,
      captionTop: null,
      captionBottom: null,
    });
  });

  test("stores both trades with their event data", async () => {
    await applyAll();
    const rows = await db.select().from(trades).orderBy(trades.slot);
    expect(
      rows.map((r) => [r.isBuy, r.skrAmount, r.tokenAmount, r.priceAfter]),
    ).toEqual([
      [true, "5000000", "4852821094", "1009"],
      [false, "2381979", "2426410547", "1004"],
    ]);
  });

  test("tracks the position with average cost and realized pnl", async () => {
    await applyAll();
    const [position] = await db.select().from(positions);
    /*
     * Bought 4,852,821,094 units for 5,000,000; sold exactly half for 2,381,979.
     * Half the cost (2,500,000) leaves, so realized pnl = 2,381,979 - 2,500,000.
     */
    expect(position).toMatchObject({
      wallet: TRADER,
      mint: MINT,
      balance: "2426410547",
      costBasisSkr: "2500000",
      realizedPnlSkr: "-118021",
    });
  });

  test("builds candles for every interval", async () => {
    await applyAll();
    const rows = await db
      .select()
      .from(candles)
      .where(eq(candles.interval, "1d"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      open: "1009",
      high: "1009",
      low: "1004",
      close: "1004",
      volumeSkr: "7381979",
      trades: 2,
    });
    const intervals = new Set(
      (await db.select().from(candles)).map((c) => c.interval),
    );
    expect([...intervals].sort()).toEqual(["1d", "1h", "1m", "5m"]);
  });

  test("replaying the same transactions changes nothing", async () => {
    await applyAll();
    const snapshot = async () => ({
      memes: await db.select().from(memes),
      trades: await db.select().from(trades),
      positions: await db.select().from(positions),
      candles: await db.select().from(candles),
    });
    const before = await snapshot();
    await applyAll();
    expect(await snapshot()).toEqual(before);
  });

  test("skips failed transactions", async () => {
    const result = await applyTransaction(
      { db, decode, loadMemeState: async () => chainState() },
      { ...transactions[0]!, err: { InstructionError: [0, "Custom"] } },
    );
    expect(result.events).toBe(0);
    expect(await db.select().from(memes)).toHaveLength(0);
  });
});

describe("indexer loop", () => {
  const fakeChain = (signatures: string[]) => {
    let listener: (signature: string) => void = () => {};
    const untils: (string | undefined)[] = [];
    const chain: ChainSource = {
      signaturesAfter: async (until) => {
        untils.push(until);
        const from = until ? signatures.indexOf(until) + 1 : 0;
        return signatures.slice(from);
      },
      transaction: async (signature) =>
        transactions.find((tx) => tx.signature === signature) ?? null,
      loadMemeState: async () => chainState(),
      onSignature: (cb) => {
        listener = cb;
        return () => {};
      },
    };
    return { chain, untils, emit: (signature: string) => listener(signature) };
  };

  const signatures = transactions.map((tx) => tx.signature);

  test("backfills history and saves its progress", async () => {
    const { chain } = fakeChain(signatures);
    const indexer = createIndexer({ db, chain, decode, catchUpMs: 60_000 });
    await indexer.start();
    await indexer.stop();

    expect(await db.select().from(trades)).toHaveLength(2);
    const [state] = await db.select().from(indexerState);
    expect(state!.lastSignature).toBe(signatures[3]!);
    expect(state!.lastSlot).toBe(transactions[3]!.slot);
  });

  test("resumes after the last processed signature", async () => {
    const first = fakeChain(signatures.slice(0, 2));
    const a = createIndexer({
      db,
      chain: first.chain,
      decode,
      catchUpMs: 60_000,
    });
    await a.start();
    await a.stop();

    const second = fakeChain(signatures);
    const b = createIndexer({
      db,
      chain: second.chain,
      decode,
      catchUpMs: 60_000,
    });
    await b.start();
    await b.stop();

    expect(second.untils[0]).toBe(signatures[1]!);
    expect(await db.select().from(trades)).toHaveLength(2);
  });

  test("keeps indexing live signatures after an empty catch-up", async () => {
    const live = fakeChain([]);
    const indexer = createIndexer({
      db,
      chain: live.chain,
      decode,
      catchUpMs: 60_000,
    });
    await indexer.start();
    await indexer.catchUp();

    live.emit(signatures[0]!);
    live.emit(signatures[1]!);
    await indexer.stop();
    expect(await db.select().from(memes)).toHaveLength(1);
    expect(await db.select().from(trades)).toHaveLength(1);
  });

  test("indexes live signatures as they arrive", async () => {
    const live = fakeChain(signatures.slice(0, 1));
    const indexer = createIndexer({
      db,
      chain: live.chain,
      decode,
      catchUpMs: 60_000,
    });
    await indexer.start();
    expect(await db.select().from(trades)).toHaveLength(0);

    live.emit(signatures[1]!);
    live.emit(signatures[1]!);
    await indexer.stop();
    expect(await db.select().from(trades)).toHaveLength(1);
  });
});
