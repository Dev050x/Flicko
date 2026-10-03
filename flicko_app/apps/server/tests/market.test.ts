import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Keypair } from "@solana/web3.js";
import { createApp } from "../src/app";
import { createSessions } from "../src/auth/jwt";
import { memoryNonceStore } from "../src/auth/nonces";
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
  // divisible by 15, so the curve starts exactly at the 1000 start price
  totalSupply: "1500000000000",
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
  await db.insert(users).values([
    { wallet: creator, username: "maker" },
    { wallet: t2, username: "whale" },
  ]);
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
    { wallet: holder, mint: X, balance: "2000000", costBasisSkr: "2000" },
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
      auth: {
        db,
        nonces: memoryNonceStore(),
        sessions,
        policy: {
          domain: "flicko.app",
          uri: "https://flicko.app",
          chainId: "solana:devnet",
          statement: "Sign in to Flicko",
          ttlSeconds: 300,
        },
      },
    }),
  ));
});

afterAll(() => close());

describe("GET /market", () => {
  test("defaults to trending and hides hidden or image-less memes", async () => {
    const { status, body } = await get("/market");
    expect(status).toBe(200);
    expect(body).toMatchObject({
      sort: "trending",
      window: "h24",
      order: "desc",
      nextOffset: null,
    });
    // X: 1 SKR × 0.5 + 0 buyers + 25% × 0.2 = 5.5; Z: 9 × 0.5 + 1 × 0.3 − 10% × 0.2 = 2.8.
    expect(mints(body.items)).toEqual([X, Z, Y]);
  });

  test("reports every window's change, volume and txns", async () => {
    const { body } = await get("/market");
    const x = body.items.find((item: { mint: string }) => item.mint === X);
    expect(x).toMatchObject({
      phase: "graduated",
      price: "1500",
      marketCap: "2250000000",
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
    expect(mints(first.body.items)).toEqual([X, Z]);
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

describe("GET /market/pumping-count", () => {
  test("counts visible memes up more than 50% in the last hour", async () => {
    // X is up 25% on the hour, Z down 10%, Y flat: nothing pumping yet.
    expect((await get("/market/pumping-count")).body).toEqual({ count: 0 });

    const db = await migratedDb();
    const P = key();
    const Q = key();
    await db.insert(memes).values([
      meme(P, ago(120), { price: "1600" }),
      meme(Q, ago(120), { price: "1500", hidden: true }),
    ]);
    await db
      .insert(trades)
      .values([
        trade(P, 10, ago(90), { priceAfter: "1000" }),
        trade(Q, 11, ago(90), { priceAfter: "900" }),
      ]);
    const app = await serve(
      createApp({
        corsOrigin: "*",
        health: {
          ping: async () => {},
          cluster: "devnet",
          programId: "p",
          skrMint: "s",
        },
        read: { db },
      }),
    );
    try {
      const res = await fetch(`${app.url}/market/pumping-count`);
      expect(await res.json()).toEqual({ count: 1 });
    } finally {
      app.close();
    }
  });
});

describe("GET /market/stats", () => {
  test("sums visible trades over 24h and counts today's launches", async () => {
    const midnight = new Date();
    midnight.setUTCHours(0, 0, 0, 0);
    const today = [ago(60), ago(120)].filter((d) => d >= midnight).length;
    expect((await get("/market/stats")).body).toEqual({
      volume24h: "12000000",
      trades24h: 3,
      launchesToday: today,
    });
  });
});

describe("/me/watchlist", () => {
  const send = async (method: string, path: string, auth = `Bearer ${token}`) =>
    (await fetch(`${url}${path}`, { method, headers: { authorization: auth } }))
      .status;

  test("stars, lists newest first and unstars", async () => {
    expect((await get("/me/watchlist")).status).toBe(401);
    expect((await get("/me/watchlist", `Bearer ${token}`)).body).toEqual({
      mints: [],
      items: [],
    });
    expect(await send("POST", `/me/watchlist/${Z}`)).toBe(204);
    await new Promise((r) => setTimeout(r, 5));
    expect(await send("POST", `/me/watchlist/${X}`)).toBe(204);
    expect(await send("POST", `/me/watchlist/${X}`)).toBe(204);
    expect(await send("POST", `/me/watchlist/${key()}`)).toBe(404);

    const { body } = await get("/me/watchlist?window=h1", `Bearer ${token}`);
    expect(body.mints).toEqual([X, Z]);
    expect(mints(body.items)).toEqual([X, Z]);
    expect(body.items[0].change.h1).toBe(2500);

    expect(await send("DELETE", `/me/watchlist/${X}`)).toBe(204);
    expect((await get("/me/watchlist", `Bearer ${token}`)).body.mints).toEqual([Z]);
  });
});

describe("GET /memes/:mint overview", () => {
  test("adds market stats, activity, rank and creator share", async () => {
    const { status, body } = await get(`/memes/${X}`);
    expect(status).toBe(200);
    expect(body.meme.mint).toBe(X);
    expect(body.overview).toMatchObject({
      market: {
        price: "1500",
        liquidity: "1000",
        holders: 2,
        change: { m5: 2500, h1: 2500, h6: 5000, h24: 5000 },
        txns: { h24: 2 },
        buys24h: 1,
        sells24h: 1,
        buyers24h: 1,
        sellers24h: 1,
      },
      trendingRank: 1,
      creatorBalance: "0",
      creatorHoldsBps: 0,
      creatorMemes: 5,
      reactions: { rocket: 0, fire: 0, poop: 0 },
      myReactions: [],
      position: null,
    });
    // 48 samples over 24h: 1000 until the trade 3h ago, 1200 until 3 min ago, then 1500.
    const line = body.overview.priceLine;
    expect(line).toHaveLength(48);
    expect([line[0], line[46], line[47]]).toEqual(["1000", "1200", "1500"]);
    expect(new Set(line)).toEqual(new Set(["1000", "1200", "1500"]));
    // Z launched 2h ago at 1000 and traded down to 900 half an hour ago.
    const z = (await get(`/memes/${Z}`)).body.overview.priceLine;
    expect([z[0], z[47]]).toEqual(["1000", "900"]);

    // Y has never traded: its change is 0 in every window, not a rounding "drop".
    const y = (await get(`/memes/${Y}`)).body.overview;
    expect(y.market.change).toEqual({ m5: 0, h1: 0, h6: 0, h24: 0 });
    expect(y.buyersTotal).toBe(0);
    expect(body.overview.buyersTotal).toBe(2);

    // Y has no trades today, so it isn't ranked; hidden memes still have a page.
    expect((await get(`/memes/${Y}`)).body.overview.trendingRank).toBeNull();
    expect((await get(`/memes/${H}`)).status).toBe(200);
  });

  test("includes the signed-in viewer's position", async () => {
    const { body } = await get(`/memes/${X}`, `Bearer ${token}`);
    expect(body.overview.position).toEqual({
      balance: "2000000",
      avgBuyPrice: "1000",
      value: "3000",
      costBasis: "2000",
      pnl: "1000",
      pnlBps: 5000,
    });
  });
});

test("an untraded meme whose curve starts a unit below its start price shows no change", async () => {
  // Supply 1e12 isn't divisible by 15: the curve's first spot price is 999, not 1000.
  const db = await migratedDb();
  const R = key();
  await db.insert(memes).values(meme(R, ago(30), { totalSupply: "1000000000000", price: "999" }));
  const app = await serve(
    createApp({
      corsOrigin: "*",
      health: { ping: async () => {}, cluster: "devnet", programId: "p", skrMint: "s" },
      read: { db },
    }),
  );
  try {
    const body = (await (await fetch(`${app.url}/memes/${R}`)).json()) as any;
    expect(body.overview.market.change).toEqual({ m5: 0, h1: 0, h6: 0, h24: 0 });
    expect(body.meme.priceChange24hBps).toBe(0);
    expect(new Set(body.overview.priceLine)).toEqual(new Set(["999"]));
  } finally {
    app.close();
  }
});

describe("reactions", () => {
  const send = async (method: string, path: string, body?: unknown, auth = `Bearer ${token}`) =>
    (
      await fetch(`${url}${path}`, {
        method,
        headers: { authorization: auth, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    ).status;

  test("one of each kind per wallet, undoable", async () => {
    expect(await send("POST", `/memes/${Z}/react`, { kind: "rocket" }, "")).toBe(401);
    expect(await send("POST", `/memes/${Z}/react`, { kind: "rocket" })).toBe(204);
    expect(await send("POST", `/memes/${Z}/react`, { kind: "rocket" })).toBe(204);
    expect(await send("POST", `/memes/${Z}/react`, { kind: "fire" })).toBe(204);
    expect(await send("POST", `/memes/${Z}/react`, { kind: "heart" })).toBe(400);
    expect(await send("POST", `/memes/${key()}/react`, { kind: "fire" })).toBe(404);

    const mine = (await get(`/memes/${Z}`, `Bearer ${token}`)).body.overview;
    expect(mine.reactions).toEqual({ rocket: 1, fire: 1, poop: 0 });
    expect([...mine.myReactions].sort()).toEqual(["fire", "rocket"]);
    expect((await get(`/memes/${Z}`)).body.overview.myReactions).toEqual([]);

    expect(await send("DELETE", `/memes/${Z}/react/fire`)).toBe(204);
    expect((await get(`/memes/${Z}`)).body.overview.reactions).toEqual({
      rocket: 1,
      fire: 0,
      poop: 0,
    });
  });
});

describe("meme page tabs", () => {
  test("chart candles are continuous: quiet hours repeat the last close", async () => {
    const { status, body } = await get(`/memes/${X}/candles?tf=1h&limit=24`);
    expect(status).toBe(200);
    expect(body.tf).toBe("1h");
    const closes = body.candles.map((c: { close: string }) => c.close);
    expect(closes).toHaveLength(24);
    // the 30h-old candle seeds the window, then 1200 three hours ago, then 1500 now
    expect([closes[0], closes[23]]).toEqual(["1000", "1500"]);
    expect(closes).toContain("1200");
    expect(body.candles[0]).toMatchObject({ open: "1000", high: "1000", volume: "0", trades: 0 });
    const times = body.candles.map((c: { time: string }) => Date.parse(c.time));
    expect(times[1] - times[0]).toBe(3_600_000);
  });

  test("4h candles merge 1h ones", async () => {
    const { body } = await get(`/memes/${X}/candles?tf=4h&limit=6`);
    expect(body.candles).toHaveLength(6);
    expect(body.candles[5].close).toBe("1500");
    expect(body.candles[5].high).toBe("1500");
    expect((await get(`/memes/${X}/candles?tf=2h`)).status).toBe(400);
  });

  test("a meme with no trades has no candles yet", async () => {
    expect((await get(`/memes/${Y}/candles?tf=15m`)).body.candles).toEqual([]);
  });

  test("trades filter by side and trader and report the large-trade size", async () => {
    const all = (await get(`/memes/${X}/trades`)).body;
    // X's trades: 5, 2 and 1 SKR; the 95th percentile is 4.7 SKR.
    expect(all.largeSkr).toBe("4700000");
    const sells = (await get(`/memes/${X}/trades?side=sell`)).body.items;
    expect(sells.map((t: { isBuy: boolean }) => t.isBuy)).toEqual([false]);
    const mine = (await get(`/memes/${X}/trades?trader=${t2}`)).body.items;
    expect(mine.map((t: { trader: string }) => t.trader)).toEqual([t2]);
    expect((await get(`/memes/${X}/trades?side=both`)).status).toBe(400);
    expect((await get(`/memes/${Y}/trades`)).body.largeSkr).toBeNull();
  });

  test("trades carry the trader's username", async () => {
    const { body } = await get(`/memes/${X}/trades`);
    expect(body.items.map((t: { traderUsername: string | null }) => t.traderUsername)).toEqual([
      null,
      "whale",
      null,
    ]);
  });

  test("launch sale progress over time", async () => {
    // Z: sale is 1.2e12; one launch trade bought 1000 base units, tokensSold says 2e11.
    const { body } = await get(`/memes/${Z}/sold`);
    const shares = body.points.map((p: { soldBps: number }) => p.soldBps);
    expect(shares).toEqual([0, 0, 1666]);
    expect(Date.parse(body.points[0].time)).toBeLessThan(Date.parse(body.points[1].time));
  });

  test("holders: ranked wallets, pool on its own, the viewer's row and paging", async () => {
    // Z is launching: no pool yet, no holders.
    const z = (await get(`/memes/${Z}/holders`)).body;
    expect(z).toMatchObject({ total: 0, pool: null, items: [], nextOffset: null, me: null });

    const x = (await get(`/memes/${X}/holders`)).body;
    expect(x.total).toBe(2);
    expect(x.pool).toEqual({ balance: "0", shareBps: 0, value: "0" });
    expect(x.items).toEqual([
      { rank: 1, wallet: holder, username: null, isCreator: false, balance: "2000000", shareBps: 0, value: "3000" },
      { rank: 2, wallet: t2, username: "whale", isCreator: false, balance: "5", shareBps: 0, value: "0" },
    ]);
    expect(x.me).toBeNull();

    const page = (await get(`/memes/${X}/holders?limit=1&offset=1`)).body;
    expect(page.items.map((h: { rank: number }) => h.rank)).toEqual([2]);
    expect(page.nextOffset).toBeNull();
    expect((await get(`/memes/${X}/holders?limit=1`)).body.nextOffset).toBe(1);

    // the signed-in holder gets their own row back, with its rank
    const mine = (await get(`/memes/${X}/holders?limit=1&offset=1`, `Bearer ${token}`)).body;
    expect(mine.me).toMatchObject({ rank: 1, wallet: holder, balance: "2000000" });
    expect((await get(`/memes/${key()}/holders`)).status).toBe(404);
  });
});
