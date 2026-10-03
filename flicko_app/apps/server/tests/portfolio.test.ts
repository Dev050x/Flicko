import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Keypair } from "@solana/web3.js";
import { createApp } from "../src/app";
import { createSessions } from "../src/auth/jwt";
import { memoryNonceStore } from "../src/auth/nonces";
import { creatorClaims, memes, positions, trades } from "../src/db/schema";
import { migratedDb, serve } from "./support";

/*
 * Alice holds M1 (up 25%) and M2 (down 20%) and has closed M3; she created M1 and M2.
 * Prices are SKR base units per whole token, balances are token base units (6 decimals).
 *   M1: 5 tokens  x 2000 = 10000 value, cost  8000, realized  100
 *   M2: 20 tokens x 1000 = 20000 value, cost 25000, realized    0
 *   M3: closed,                                     realized -300
 * Creator fees: M1 earned 100 + 50 and claimed 100; M2 earned 30, nothing claimed.
 */
const HOUR = 3600_000;
const ago = (hours: number) => new Date(Date.now() - hours * HOUR);
const key = () => Keypair.generate().publicKey.toBase58();

const alice = key();
const bob = key();
const M1 = key();
const M2 = key();
const M3 = key();

const sessions = createSessions("test-secret-that-is-long-enough-123456");
let url = "";
let close = () => {};
let tokens: Record<string, string> = {};

const get = async (path: string, wallet: string | null = alice) => {
  const res = await fetch(`${url}${path}`, {
    headers: wallet ? { authorization: `Bearer ${tokens[wallet]}` } : {},
  });
  return { status: res.status, body: (await res.json()) as any };
};

const meme = (
  mint: string,
  creator: string,
  createdAt: Date,
  price: string,
): typeof memes.$inferInsert => ({
  mint,
  memePda: key(),
  creator,
  name: `Meme ${mint.slice(0, 4)}`,
  symbol: "MEME",
  uri: "https://example.com/meta.json",
  imageUrl: `https://blobs.test/memes/${mint}.jpg`,
  imageHash: "00".repeat(32),
  // divisible by 15, so the curve starts exactly at the start price
  totalSupply: "1500000000000",
  startPrice: price,
  price,
  createdSlot: 1,
  createdAt,
});

const trade = (
  mint: string,
  slot: number,
  creatorFee: string,
): typeof trades.$inferInsert => ({
  signature: `sig-${slot}`,
  eventIndex: 0,
  mint,
  trader: bob,
  isBuy: true,
  skrAmount: "1000",
  tokenAmount: "1000",
  creatorFee,
  burned: "0",
  priceAfter: "1000",
  phase: "launch",
  slot,
  blockTime: ago(1),
});

beforeAll(async () => {
  const db = await migratedDb();
  await db
    .insert(memes)
    .values([
      meme(M1, alice, ago(3), "2000"),
      meme(M2, alice, ago(2), "1000"),
      meme(M3, bob, ago(1), "1000"),
    ]);
  await db.insert(positions).values([
    {
      wallet: alice,
      mint: M1,
      balance: "5000000",
      costBasisSkr: "8000",
      realizedPnlSkr: "100",
    },
    { wallet: alice, mint: M2, balance: "20000000", costBasisSkr: "25000" },
    { wallet: alice, mint: M3, balance: "0", realizedPnlSkr: "-300" },
  ]);
  await db
    .insert(trades)
    .values([trade(M1, 1, "100"), trade(M1, 2, "50"), trade(M2, 3, "30")]);
  await db.insert(creatorClaims).values({
    signature: "claim-1",
    eventIndex: 0,
    mint: M1,
    creator: alice,
    amount: "100",
    slot: 4,
    blockTime: ago(0.5),
  });
  tokens = {
    [alice]: (await sessions.issue(alice)).token,
    [bob]: (await sessions.issue(bob)).token,
  };
  ({ url, close } = await serve(
    createApp({
      corsOrigin: "*",
      health: {
        ping: async () => {},
        cluster: "devnet",
        programId: "p",
        skrMint: "s",
      },
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

describe("GET /me/portfolio", () => {
  test("requires a session", async () => {
    expect((await get("/me/portfolio", null)).status).toBe(401);
    expect((await get("/me/created", null)).status).toBe(401);
  });

  test("values open holdings at the current price, biggest first", async () => {
    const { status, body } = await get("/me/portfolio");
    expect(status).toBe(200);
    expect(body.holdings.map((h: { mint: string }) => h.mint)).toEqual([
      M2,
      M1,
    ]);
    expect(body.holdings[1]).toMatchObject({
      mint: M1,
      balance: "5000000",
      price: "2000",
      value: "10000",
      costBasis: "8000",
      unrealizedPnl: "2000",
      unrealizedPnlBps: 2500,
      realizedPnl: "100",
      priceChange24hBps: 0,
      imageUrl: `https://blobs.test/memes/${M1}.jpg`,
    });
    expect(body.holdings[0]).toMatchObject({
      value: "20000",
      unrealizedPnl: "-5000",
      unrealizedPnlBps: -2000,
    });
  });

  test("totals include realized pnl from closed positions", async () => {
    const { body } = await get("/me/portfolio");
    expect(body.totals).toEqual({
      value: "30000",
      costBasis: "33000",
      unrealizedPnl: "-3000",
      realizedPnl: "-200",
    });
  });

  test("an empty wallet gets zero totals", async () => {
    expect((await get("/me/portfolio", bob)).body).toEqual({
      totals: {
        value: "0",
        costBasis: "0",
        unrealizedPnl: "0",
        realizedPnl: "0",
      },
      holdings: [],
    });
  });
});

describe("GET /me/created", () => {
  test("lists created memes newest first with fees per meme", async () => {
    const { status, body } = await get("/me/created");
    expect(status).toBe(200);
    expect(body.items.map((m: { mint: string }) => m.mint)).toEqual([M2, M1]);
    expect(body.items[0]).toMatchObject({
      mint: M2,
      feesEarned: "30",
      feesClaimed: "0",
      feesClaimable: "30",
      tradeCount: 0,
    });
    expect(body.items[1]).toMatchObject({
      mint: M1,
      feesEarned: "150",
      feesClaimed: "100",
      feesClaimable: "50",
    });
    expect(body.totals).toEqual({
      earned: "180",
      claimed: "100",
      claimable: "80",
    });
  });

  test("only shows the caller's own memes", async () => {
    const { body } = await get("/me/created", bob);
    expect(body.items.map((m: { mint: string }) => m.mint)).toEqual([M3]);
    expect(body.totals).toEqual({ earned: "0", claimed: "0", claimable: "0" });
  });
});
