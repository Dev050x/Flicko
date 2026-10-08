import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Keypair } from "@solana/web3.js";
import { createApp } from "../src/app";
import { createSessions } from "../src/auth/jwt";
import { memes, users } from "../src/db/schema";
import { migratedDb, serve } from "./support";

/* Like / unlike a meme, and the feed's `likeCount` and `likedByMe`. */
const key = () => Keypair.generate().publicKey.toBase58();
const sessions = createSessions("test-secret");
const alice = key();
const bob = key();
let url = "";
let close = () => {};
let tokens: Record<string, string> = {};

const call = async (method: string, path: string, wallet: string | null) => {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: wallet ? { authorization: `Bearer ${tokens[wallet]}` } : {},
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

const mint = key();
const meme = {
  mint,
  memePda: key(),
  creator: bob,
  name: "Meme",
  symbol: "MEME",
  uri: "https://example.com/meta.json",
  imageHash: "00".repeat(32),
  totalSupply: "1500000000000",
  startPrice: "1000",
  price: "1000",
  imageUrl: `https://blobs.test/memes/${mint}.jpg`,
  createdSlot: 1,
};

type Card = { mint: string; likeCount: number; likedByMe?: boolean };
const card = async (wallet: string | null) => {
  const { body } = await call("GET", "/feed?tab=new", wallet);
  return (body.items as Card[]).find((item) => item.mint === mint);
};

beforeAll(async () => {
  const db = await migratedDb();
  await db.insert(users).values([{ wallet: alice }, { wallet: bob }]);
  await db.insert(memes).values(meme);
  tokens = Object.fromEntries(
    await Promise.all(
      [alice, bob].map(
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

describe("like", () => {
  test("requires a session", async () => {
    expect((await call("PUT", `/memes/${mint}/like`, null)).status).toBe(401);
    expect((await call("DELETE", `/memes/${mint}/like`, null)).status).toBe(
      401,
    );
  });

  test("rejects unknown memes and bad mints", async () => {
    expect((await call("PUT", `/memes/${key()}/like`, alice)).status).toBe(404);
    expect((await call("PUT", "/memes/nope/like", alice)).status).toBe(400);
  });

  test("starts at zero, not liked", async () => {
    expect(await card(null)).toMatchObject({ likeCount: 0 });
    expect((await card(null))?.likedByMe).toBeUndefined();
    expect(await card(alice)).toMatchObject({ likeCount: 0, likedByMe: false });
  });

  test("counts each wallet once and shows the viewer's own like", async () => {
    expect((await call("PUT", `/memes/${mint}/like`, alice)).status).toBe(204);
    expect((await call("PUT", `/memes/${mint}/like`, alice)).status).toBe(204);
    expect((await call("PUT", `/memes/${mint}/like`, bob)).status).toBe(204);
    expect(await card(alice)).toMatchObject({ likeCount: 2, likedByMe: true });
    expect(await card(null)).toMatchObject({ likeCount: 2 });
  });

  test("unlike removes only the viewer's like and is idempotent", async () => {
    expect((await call("DELETE", `/memes/${mint}/like`, alice)).status).toBe(
      204,
    );
    expect((await call("DELETE", `/memes/${mint}/like`, alice)).status).toBe(
      204,
    );
    expect(await card(alice)).toMatchObject({ likeCount: 1, likedByMe: false });
    expect(await card(bob)).toMatchObject({ likeCount: 1, likedByMe: true });
  });
});
