import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Keypair } from "@solana/web3.js";
import { createApp } from "../src/app";
import { createSessions } from "../src/auth/jwt";
import { candles, memes, positions, trades, users } from "../src/db/schema";
import { migratedDb, serve } from "./support";

/*
 * X: 30h old, graduated, 1000 -> 1200 (3h ago) -> 1500 (3 min ago), two holders.
 * Y: 1h old "Moon Dog", no trades. Z: 2h old, one 9 SKR trade 30 min ago, price down 10%.
 * H is hidden and N has no image; neither may show up.
 */
const MINUTE = 60_000;
const ago = (minutes: number) => new Date(Date.now() - minutes * MINUTE);
const key = () => Keypair.generate().publicKey.toBase58();

const X = key();
const Y = key();
const Z = key();
const H = key();
const N = key();
const creator = key();
const holder = key();
const t1 = key();
const t2 = key();

const sessions = createSessions("test-secret-that-is-long-enough-123456");
let url = "";
let close = () => {};
let token = "";

const get = async (path: string, auth?: string) => {
  const res = await fetch(`${url}${path}`, {
    headers: auth ? { authorization: auth } : {},
  });
  return { status: res.status, body: (await res.json()) as any };
};
const mints = (items: { mint: string }[]) => items.map((item) => item.mint);
const byMint = (...list: string[]) => [...list].sort();

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
  imageUrl: `https://blobs.test/memes/${mint}.jpg`,
  imageHash: "00".repeat(32),
  totalSupply: "1000000000000",
  startPrice: "1000",
  price: "1000",
  createdSlot: 1,
  createdAt,
  ...fields,
});

const trade = (
  mint: string,
  slot: number,
  blockTime: Date,
  fields: Partial<typeof trades.$inferInsert>,
): typeof trades.$inferInsert => ({
  signature: `sig-${slot}`,
  eventIndex: 0,
  mint,
  trader: t1,
  isBuy: true,
  skrAmount: "0",
  tokenAmount: "1000",
  creatorFee: "0",
  burned: "0",
  priceAfter: "1000",
  phase: "launch",
  slot,
  blockTime,
  ...fields,
});

const candle = (bucketStart: Date, close: string) => ({
  mint: X,
  interval: "1h" as const,
  bucketStart,
  open: close,
  high: close,
  low: close,
  close,
  volumeSkr: "1",
  trades: 1,
});

beforeAll(async () => {
  const db = await migratedDb();
  await db.insert(users).values({ wallet: creator, username: "maker" });
  await db.insert(memes).values([
    meme(X, ago(30 * 60), {
      phase: "graduated",
      price: "1500",
      tokensSold: "800000000000",
      poolSkr: "500",
      tradeCount: 3,
      captionTop: "GM SER",
      captionBottom: "WEN MOON",
    }),
    meme(Y, ago(60), { name: "Moon Dog", symbol: "MDOG" }),
    meme(Z, ago(120), {
      price: "900",
      realSkr: "7000000",
      tokensSold: "200000000000",
      tradeCount: 1,
    }),
    meme(H, ago(10), { hidden: true }),
    meme(N, ago(10), { imageUrl: null }),
  ]);
  await db.insert(trades).values([
    trade(X, 1, ago(30 * 60), { skrAmount: "5000000", priceAfter: "1000" }),
    trade(X, 2, ago(180), {
      skrAmount: "2000000",
      priceAfter: "1200",
      trader: t2,
    }),
    trade(X, 3, ago(3), {
      skrAmount: "1000000",
      priceAfter: "1500",
      isBuy: false,
    }),
    trade(Z, 4, ago(30), { skrAmount: "9000000", priceAfter: "900" }),
    trade(H, 5, ago(5), { skrAmount: "99000000000", priceAfter: "5000" }),
    trade(N, 6, ago(5), { skrAmount: "99000000000", priceAfter: "5000" }),
  ]);
  await db.insert(positions).values([
    { wallet: holder, mint: X, balance: "2000000" },
    { wallet: t2, mint: X, balance: "5" },
    { wallet: t1, mint: Z, balance: "0" },
  ]);
  await db
    .insert(candles)
    .values([
      candle(ago(30 * 60), "1000"),
      candle(ago(180), "1200"),
      candle(ago(3), "1500"),
    ]);
  token = (await sessions.issue(holder)).token;
  ({ url, close } = await serve(
    createApp({
      corsOrigin: "*",
      health: {
        ping: async () => {},
        cluster: "devnet",
        programId: "p",
        skrMint: "s",
      },
      read: { db, sessions },
    }),
  ));
});

afterAll(() => close());

describe("GET /market", () => {
  test("defaults to trending by 24h volume and hides hidden or image-less memes", async () => {
    const { status, body } = await get("/market");
    expect(status).toBe(200);
    expect(body).toMatchObject({
      sort: "trending",
      window: "h24",
      order: "desc",
      nextOffset: null,
    });
    expect(mints(body.items)).toEqual([Z, X, Y]);
  });

  test("reports every window's change, volume and txns", async () => {
    const { body } = await get("/market");
    const x = body.items.find((item: { mint: string }) => item.mint === X);
    expect(x).toMatchObject({
      phase: "graduated",
      price: "1500",
      marketCap: "1500000000",
      liquidity: "1000",
      holders: 2,
      launchProgressBps: 10000,
      change: { m5: 2500, h1: 2500, h6: 5000, h24: 5000 },
      volume: { m5: "1000000", h1: "1000000", h6: "3000000", h24: "3000000" },
      txns: { m5: 1, h1: 1, h6: 2, h24: 2 },
      buys24h: 1,
      sells24h: 1,
      makers24h: 2,
      sparkline: ["1200", "1500"],
    });
    const y = body.items.find((item: { mint: string }) => item.mint === Y);
    expect(y).toMatchObject({
      change: { m5: 0, h1: 0, h6: 0, h24: 0 },
      volume: { h24: "0" },
      txns: { h24: 0 },
      sparkline: ["1000"],
      liquidity: "0",
      launchProgressBps: 0,
    });
  });

  test("sorts by the chosen column and window", async () => {
    const list = async (query: string) =>
      mints((await get(`/market?${query}`)).body.items);
    expect(await list("sort=volume&window=m5")).toEqual([X, ...byMint(Y, Z)]);
    expect(await list("sort=change&window=h1")).toEqual([X, Y, Z]);
    expect(await list("sort=mcap&order=asc")).toEqual([Z, Y, X]);
    expect(await list("sort=liquidity")).toEqual([Z, X, Y]);
    expect(await list("sort=holders")).toEqual([X, ...byMint(Y, Z)]);
    expect(await list("sort=new")).toEqual([Y, Z, X]);
  });

  test("filters by phase and searches name, symbol or mint", async () => {
    const list = async (query: string) =>
      mints((await get(`/market?${query}`)).body.items);
    expect(await list("phase=graduated")).toEqual([X]);
    expect(await list("phase=launch")).toEqual([Z, Y]);
    expect(await list("q=dog")).toEqual([Y]);
    expect(await list("q=mdo")).toEqual([Y]);
    expect(await list(`q=${Z}`)).toEqual([Z]);
    expect(await list("q=%25")).toEqual([]);
  });

  test("paginates and validates", async () => {
    const first = await get("/market?limit=2");
    expect(mints(first.body.items)).toEqual([Z, X]);
    expect(first.body.nextOffset).toBe(2);
    expect(mints((await get("/market?limit=2&offset=2")).body.items)).toEqual([
      Y,
    ]);
    expect((await get("/market?sort=bogus")).status).toBe(400);
    expect((await get("/market?window=d1")).status).toBe(400);
    expect((await get("/market?limit=101")).status).toBe(400);
  });
});

describe("GET /reels", () => {
  test("ranks by recent activity decayed by age", async () => {
    const { status, body } = await get("/reels");
    expect(status).toBe(200);
    expect(mints(body.items)).toEqual([Z, Y, X]);
    expect(body.items[2]).toMatchObject({
      captionTop: "GM SER",
      captionBottom: "WEN MOON",
      creatorUsername: "maker",
      creator,
      tradeCount: 3,
      viewer: null,
    });
    expect(body.items[2].memePda).toBeString();
  });

  test("includes the signed-in viewer's holding", async () => {
    const { body } = await get("/reels", `Bearer ${token}`);
    const x = body.items.find((item: { mint: string }) => item.mint === X);
    expect(x.viewer).toEqual({ balance: "2000000", value: "3000" });
    const z = body.items.find((item: { mint: string }) => item.mint === Z);
    expect(z.viewer).toEqual({ balance: "0", value: "0" });
  });

  test("rejects a bad token and pages", async () => {
    expect((await get("/reels", "Bearer nope")).status).toBe(401);
    const page = await get("/reels?limit=1&offset=1");
    expect(mints(page.body.items)).toEqual([Y]);
    expect(page.body.nextOffset).toBe(2);
    expect((await get("/reels?limit=21")).status).toBe(400);
  });
});
