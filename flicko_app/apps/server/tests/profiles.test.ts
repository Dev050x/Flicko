import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Keypair } from "@solana/web3.js";
import { createApp } from "../src/app";
import { createSessions } from "../src/auth/jwt";
import {
  creatorClaims,
  memes,
  positions,
  trades,
  users,
} from "../src/db/schema";
import { migratedDb, serve } from "./support";

/*
 * Profile reads: counts and creator stats, a creator's memes, public holdings (no amounts),
 * the wallet's own activity and claimable fees, plus editing the display name and bio.
 */
const key = () => Keypair.generate().publicKey.toBase58();
const sessions = createSessions("test-secret");
const maker = key();
const fan = key();
let url = "";
let close = () => {};
let tokens: Record<string, string> = {};

const call = async (
  path: string,
  wallet: string | null = null,
  init: { method?: string; body?: unknown } = {},
) => {
  const res = await fetch(`${url}${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...(wallet ? { authorization: `Bearer ${tokens[wallet]}` } : {}),
      "content-type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return {
    status: res.status,
    body: (await res.json().catch(() => null)) as any,
  };
};

const hours = (n: number) => new Date(Date.now() - n * 3600_000);
const meme = (symbol: string, phase: "launch" | "graduated", age: number) => {
  const mint = key();
  return {
    mint,
    memePda: key(),
    creator: maker,
    name: symbol,
    symbol,
    uri: "https://example.com/m.json",
    imageHash: "00".repeat(32),
    totalSupply: "1500000000000",
    startPrice: "1000",
    price: "2000",
    phase,
    imageUrl: `https://blobs.test/memes/${mint}.jpg`,
    createdSlot: 1,
    createdAt: hours(age),
  };
};
const dip = meme("DIP", "graduated", 30);
const laser = meme("LASER", "launch", 20);
const trade = (
  m: typeof dip,
  trader: string,
  isBuy: boolean,
  age: number,
  n: number,
) => ({
  signature: `sig${n}`,
  eventIndex: 0,
  mint: m.mint,
  trader,
  isBuy,
  skrAmount: "5000000",
  tokenAmount: "2000000",
  creatorFee: "100000",
  burned: "25000",
  priceAfter: "2000",
  phase: m.phase,
  slot: n,
  blockTime: hours(age),
});

beforeAll(async () => {
  const db = await migratedDb();
  await db
    .insert(users)
    .values([
      { wallet: maker, username: "maker", displayName: "Maker", bio: "memes" },
      { wallet: fan },
    ]);
  await db.insert(memes).values([dip, laser]);
  await db
    .insert(trades)
    .values([
      trade(dip, fan, true, 3, 1),
      trade(dip, fan, false, 2, 2),
      trade(laser, maker, true, 1, 3),
    ]);
  await db.insert(positions).values({
    wallet: fan,
    mint: dip.mint,
    balance: "4000000",
    costBasisSkr: "4000000",
    realizedPnlSkr: "0",
  } as never);
  await db.insert(creatorClaims).values({
    signature: "claim1",
    eventIndex: 0,
    mint: dip.mint,
    creator: maker,
    amount: "100000",
    slot: 9,
    blockTime: hours(0.5),
  });
  tokens = Object.fromEntries(
    await Promise.all(
      [maker, fan].map(
        async (w) => [w, (await sessions.issue(w)).token] as const,
      ),
    ),
  );
  ({ url, close } = await serve(
    createApp({
      corsOrigin: "*",
      health: {
        ping: async () => {},
        cluster: "devnet",
        programId: "prog",
        skrMint: "skr",
      },
      auth: { db, sessions, nonces: {} as never, policy: {} as never },
      read: { db, sessions },
    }),
  ));
});

afterAll(() => close());

describe("GET /users/:id", () => {
  test("profile with counts and creator stats, by username or wallet", async () => {
    const byName = await call("/users/maker");
    expect(byName.status).toBe(200);
    expect(byName.body).toMatchObject({
      wallet: maker,
      username: "maker",
      displayName: "Maker",
      bio: "memes",
      counts: { memes: 2, followers: 0, following: 0 },
      creatorStats: { totalVolume: "15000000", graduated: 1, launched: 2 },
    });
    expect(byName.body.creatorStats.bestMeme.symbol).toBeString();
    expect((await call(`/users/${maker}`)).body.username).toBe("maker");
  });

  test("404 for an unknown username", async () => {
    expect((await call("/users/nobody_here")).status).toBe(404);
  });
});

describe("GET /users/:id/memes", () => {
  test("lists the creator's memes newest first", async () => {
    const { body } = await call("/users/maker/memes");
    expect(body.items.map((i: any) => i.symbol)).toEqual(["LASER", "DIP"]);
  });
});

describe("GET /users/:id/holdings", () => {
  test("shows positions without amounts or totals", async () => {
    const { body } = await call(`/users/${fan}/holdings`);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].symbol).toBe("DIP");
    expect(Object.keys(body.items[0])).not.toContain("balance");
    expect(Object.keys(body)).toEqual(["items"]);
  });
});

describe("own data", () => {
  test("activity merges trades, launches and claims newest first", async () => {
    expect((await call("/me/activity")).status).toBe(401);
    const { body } = await call("/me/activity", maker);
    expect(body.items.map((i: any) => i.type)).toEqual([
      "claim",
      "buy",
      "launch",
      "launch",
    ]);
    const page = await call("/me/activity?limit=2&offset=1", maker);
    expect(page.body.items.map((i: any) => i.type)).toEqual(["buy", "launch"]);
  });

  test("claimable lists memes with unclaimed fees", async () => {
    const { body } = await call("/me/claimable", maker);
    // earned 2 trades × 100000 on DIP, 100000 claimed → 100000 left; LASER earned 100000
    const bySymbol = Object.fromEntries(
      body.items.map((i: any) => [i.symbol, i.claimable]),
    );
    expect(bySymbol).toEqual({ DIP: "100000", LASER: "100000" });
  });
});

describe("PATCH /me profile text", () => {
  test("sets and clears display name and bio", async () => {
    const set = await call("/me", fan, {
      method: "PATCH",
      body: { displayName: " Fan ", bio: "hello" },
    });
    expect(set.body.user).toMatchObject({ displayName: "Fan", bio: "hello" });
    const clear = await call("/me", fan, {
      method: "PATCH",
      body: { bio: "  " },
    });
    expect(clear.body.user.bio).toBeNull();
    expect(clear.body.user.displayName).toBe("Fan");
  });

  test("rejects a bio over 160 characters", async () => {
    const { status } = await call("/me", fan, {
      method: "PATCH",
      body: { bio: "x".repeat(161) },
    });
    expect(status).toBe(400);
  });
});
