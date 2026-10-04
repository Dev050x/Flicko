import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Keypair } from "@solana/web3.js";
import { createApp } from "../src/app";
import { candles, memes, positions, trades, users } from "../src/db/schema";
import { migratedDb, serve } from "./support";

/*
 * Seeds five memes with trades, candles and positions in one PGlite database, then reads them
 * back over HTTP. Times are relative to now so the 24h windows are deterministic:
 *   A newest, no trades; B big recent volume, +50% vs a 30h-old trade; C small volume, -20%;
 *   D hidden with huge volume; E graduated; F newest with big volume but no image (feed skips it).
 */
const HOUR = 3600_000;
const ago = (hours: number) => new Date(Date.now() - hours * HOUR);
const key = () => Keypair.generate().publicKey.toBase58();

const A = key();
const B = key();
const C = key();
const D = key();
const E = key();
const F = key();
const creator = key();

let url = "";
let close = () => {};

const get = async (path: string) => {
  const res = await fetch(`${url}${path}`);
  return { status: res.status, body: (await res.json()) as any };
};
const mints = (items: { mint: string }[]) => items.map((item) => item.mint);

const meme = (
  mint: string,
  createdAt: Date,
  fields: Partial<typeof memes.$inferInsert> = {},
): typeof memes.$inferInsert => ({
  mint,
  memePda: key(),
  creator,
  name: `Meme ${mint.slice(0, 4)}`,
  symbol: "MEME",
  uri: "https://example.com/meta.json",
  imageHash: "00".repeat(32),
  // divisible by 15, so the curve starts exactly at the 1000 start price
  totalSupply: "1500000000000",
  startPrice: "1000",
  price: "1000",
  imageUrl: `https://blobs.test/memes/${mint}.jpg`,
  createdSlot: 1,
  createdAt,
  ...fields,
});

const trade = (
  mint: string,
  slot: number,
  blockTime: Date,
  skrAmount: string,
  priceAfter: string,
): typeof trades.$inferInsert => ({
  signature: `sig-${mint.slice(0, 6)}-${slot}`,
  eventIndex: 0,
  mint,
  trader: creator,
  isBuy: true,
  skrAmount,
  tokenAmount: "1000000",
  creatorFee: "0",
  burned: "0",
  priceAfter,
  phase: "launch",
  slot,
  blockTime,
});

const candle = (
  interval: "1m" | "5m" | "1h",
  bucketStart: Date,
  close: string,
) => ({
  mint: B,
  interval,
  bucketStart,
  open: "1000",
  high: close,
  low: "1000",
  close,
  volumeSkr: "5",
  trades: 1,
});

beforeAll(async () => {
  const db = await migratedDb();
  await db.insert(users).values({ wallet: creator, username: "maker", avatarId: "froggo" });
  await db.insert(memes).values([
    meme(A, ago(1)),
    meme(B, ago(40), {
      price: "1500",
      tokensSold: "300000000000",
      tradeCount: 2,
    }),
    meme(C, ago(20), { price: "800", tradeCount: 1 }),
    meme(D, ago(2), { hidden: true, tradeCount: 1 }),
    meme(E, ago(10), {
      phase: "graduated",
      tokensSold: "1200000000000",
      graduatedAt: ago(5),
    }),
    meme(F, ago(0.5), { imageUrl: null, tradeCount: 1 }),
  ]);
  await db
    .insert(trades)
    .values([
      trade(B, 1, ago(30), "5000000", "1000"),
      trade(B, 3, ago(1), "900000000", "1500"),
      trade(C, 2, ago(2), "10000000", "800"),
      trade(D, 4, ago(1), "99000000000", "5000"),
      trade(F, 5, ago(1), "50000000000", "9000"),
    ]);
  await db
    .insert(candles)
    .values([
      candle("5m", ago(1), "1500"),
      candle("1m", ago(1), "1500"),
      candle("5m", ago(30), "1000"),
      candle("1h", ago(30), "1000"),
    ]);
  await db.insert(positions).values([
    { wallet: key(), mint: B, balance: "10" },
    { wallet: key(), mint: B, balance: "20" },
    { wallet: key(), mint: B, balance: "0" },
  ]);
  ({ url, close } = await serve(
    createApp({
      corsOrigin: "*",
      health: {
        ping: async () => {},
        cluster: "devnet",
        programId: "prog",
        skrMint: "skr",
      },
      read: { db },
    }),
  ));
});

afterAll(() => close());

describe("GET /feed", () => {
  test("defaults to new launches and hides hidden memes", async () => {
    const { status, body } = await get("/feed");
    expect(status).toBe(200);
    expect(body.tab).toBe("new");
    expect(mints(body.items)).toEqual([A, E, C, B]);
    expect(body.nextOffset).toBeNull();
    expect(body.items[0]).toMatchObject({
      creatorUsername: "maker",
      creatorAvatarId: "froggo",
      creatorAvatarUrl: null,
    });
  });

  test("trending ranks by 24h volume", async () => {
    const { body } = await get("/feed?tab=trending");
    expect(mints(body.items)).toEqual([B, C, A, E]);
  });

  test("gainers ranks by 24h price change", async () => {
    const { body } = await get("/feed?tab=gainers");
    expect(mints(body.items)).toEqual([B, ...[A, E].sort(), C]);
    expect(body.items[0].priceChange24hBps).toBe(5000);
    expect(body.items[3].priceChange24hBps).toBe(-2000);
  });

  test("24h volume ignores older trades", async () => {
    const { body } = await get("/feed");
    const b = body.items.find((item: { mint: string }) => item.mint === B);
    expect(b.volume24h).toBe("900000000");
    expect(b.launchProgressBps).toBe(2500);
  });

  test("paginates without overlap", async () => {
    const first = await get("/feed?limit=2");
    expect(mints(first.body.items)).toEqual([A, E]);
    expect(first.body.nextOffset).toBe(2);
    const second = await get("/feed?limit=2&offset=2");
    expect(mints(second.body.items)).toEqual([C, B]);
    const third = await get("/feed?limit=2&offset=4");
    expect(third.body.items).toEqual([]);
    expect(third.body.nextOffset).toBeNull();
  });

  test("skips memes without an image in every tab", async () => {
    for (const tab of ["new", "trending", "gainers"]) {
      const { body } = await get(`/feed?tab=${tab}`);
      expect(mints(body.items)).not.toContain(F);
    }
    const { status, body } = await get(`/memes/${F}`);
    expect(status).toBe(200);
    expect(body.meme.imageUrl).toBeNull();
  });

  test("rejects bad queries", async () => {
    expect((await get("/feed?tab=bogus")).status).toBe(400);
    expect((await get("/feed?limit=0")).status).toBe(400);
    expect((await get("/feed?limit=51")).status).toBe(400);
  });
});

describe("GET /memes/:mint", () => {
  test("returns detail with derived fields", async () => {
    const { status, body } = await get(`/memes/${B}`);
    expect(status).toBe(200);
    expect(body.meme).toMatchObject({
      mint: B,
      holders: 2,
      saleSupply: "1200000000000",
      marketCap: "2250000000",
      launchProgressBps: 2500,
      priceChange24hBps: 5000,
      volume24h: "900000000",
      hidden: false,
      graduatedAt: null,
    });
  });

  test("graduated memes report full progress", async () => {
    const { body } = await get(`/memes/${E}`);
    expect(body.meme.phase).toBe("graduated");
    expect(body.meme.launchProgressBps).toBe(10000);
    expect(body.meme.holders).toBe(0);
  });

  test("still returns hidden memes", async () => {
    const { status, body } = await get(`/memes/${D}`);
    expect(status).toBe(200);
    expect(body.meme.hidden).toBe(true);
  });

  test("404 for unknown mint, 400 for a bad one", async () => {
    expect(await get(`/memes/${key()}`)).toEqual({
      status: 404,
      body: { error: "meme not found" },
    });
    expect((await get("/memes/not-a-key")).status).toBe(400);
    expect((await get(`/memes/${key()}/trades`)).status).toBe(404);
    expect((await get("/memes/not-a-key/candles")).status).toBe(400);
  });
});

describe("GET /memes/:mint/candles", () => {
  test("returns one interval oldest first", async () => {
    const { body } = await get(`/memes/${B}/candles?interval=5m`);
    expect(body.interval).toBe("5m");
    expect(body.candles.map((c: { close: string }) => c.close)).toEqual([
      "1000",
      "1500",
    ]);
    expect(body.candles[0].time < body.candles[1].time).toBe(true);
  });

  test("defaults to 1h and rejects bad intervals", async () => {
    const { body } = await get(`/memes/${B}/candles`);
    expect(body.interval).toBe("1h");
    expect(body.candles).toHaveLength(1);
    expect((await get(`/memes/${B}/candles?interval=2m`)).status).toBe(400);
  });
});

describe("GET /memes/:mint/trades", () => {
  test("returns newest first with paging", async () => {
    const { body } = await get(`/memes/${B}/trades?limit=1`);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      skrAmount: "900000000",
      priceAfter: "1500",
      isBuy: true,
    });
    expect(body.nextOffset).toBe(1);
    const rest = await get(`/memes/${B}/trades?limit=1&offset=1`);
    expect(rest.body.items[0].skrAmount).toBe("5000000");
  });
});
