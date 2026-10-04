import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Keypair } from "@solana/web3.js";
import { createApp } from "../src/app";
import { createSessions } from "../src/auth/jwt";
import { memes, users } from "../src/db/schema";
import { migratedDb, serve } from "./support";

/*
 * Follow / unfollow, the follow lists and counts, and the feed's `following` tab and
 * `creatorFollowed` flag.
 */
const key = () => Keypair.generate().publicKey.toBase58();
const sessions = createSessions("test-secret");
const alice = key();
const bob = key();
const carol = key();
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

const memeBy = (creator: string, minutes: number) => {
  const mint = key();
  return {
    mint,
    memePda: key(),
    creator,
    name: "Meme",
    symbol: "MEME",
    uri: "https://example.com/meta.json",
    imageHash: "00".repeat(32),
    totalSupply: "1500000000000",
    startPrice: "1000",
    price: "1000",
    imageUrl: `https://blobs.test/memes/${mint}.jpg`,
    createdSlot: 1,
    createdAt: new Date(Date.now() - minutes * 60_000),
  };
};
const bobMeme = memeBy(bob, 5);
const carolMeme = memeBy(carol, 1);

beforeAll(async () => {
  const db = await migratedDb();
  await db
    .insert(users)
    .values([
      { wallet: alice },
      { wallet: bob, username: "bob", avatarId: "pup" },
      { wallet: carol },
    ]);
  await db.insert(memes).values([bobMeme, carolMeme]);
  tokens = Object.fromEntries(
    await Promise.all(
      [alice, bob, carol].map(
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

describe("follow", () => {
  test("requires a session", async () => {
    expect((await call("PUT", `/users/${bob}/follow`, null)).status).toBe(401);
    expect((await call("GET", "/me/following", null)).status).toBe(401);
  });

  test("cannot follow yourself", async () => {
    expect((await call("PUT", `/users/${alice}/follow`, alice)).status).toBe(
      400,
    );
  });

  test("404 for an unknown user", async () => {
    expect((await call("PUT", "/users/nope/follow", alice)).status).toBe(404);
  });

  test("follow is idempotent and shows in the list and counts", async () => {
    expect((await call("PUT", `/users/${bob}/follow`, alice)).status).toBe(204);
    expect((await call("PUT", `/users/${bob}/follow`, alice)).status).toBe(204);
    expect((await call("PUT", `/users/${bob}/follow`, carol)).status).toBe(204);

    expect((await call("GET", "/me/following", alice)).body).toEqual({
      wallets: [bob],
    });
    const profile = await call("GET", `/users/${bob}`, alice);
    expect(profile.body).toMatchObject({
      wallet: bob,
      username: "bob",
      avatarId: "pup",
      counts: { memes: 1, followers: 2, following: 0 },
      isFollowing: true,
    });
    // public, no isFollowing without a session; a username works as the id
    const anon = await call("GET", "/users/bob", null);
    expect(anon.status).toBe(200);
    expect(anon.body.counts.followers).toBe(2);
    expect("isFollowing" in anon.body).toBe(false);
  });

  test("follow by username", async () => {
    expect((await call("PUT", "/users/bob/follow", carol)).status).toBe(204);
    expect((await call("PUT", "/users/nobody_here/follow", carol)).status).toBe(
      404,
    );
  });

  test("profile of an unknown wallet has zero counts", async () => {
    const { body } = await call("GET", `/users/${key()}`, null);
    expect(body).toMatchObject({
      username: null,
      counts: { memes: 0, followers: 0, following: 0 },
    });
  });
});

describe("feed", () => {
  test("flags followed creators for a signed-in viewer", async () => {
    const { body } = await call("GET", "/feed?tab=new", alice);
    const flags = Object.fromEntries(
      body.items.map((i: any) => [i.mint, i.creatorFollowed]),
    );
    expect(flags).toEqual({ [bobMeme.mint]: true, [carolMeme.mint]: false });
    const anon = await call("GET", "/feed?tab=new", null);
    expect(anon.body.items[0].creatorFollowed).toBeUndefined();
  });

  test("the following tab only has creators you follow", async () => {
    const { body } = await call("GET", "/feed?tab=following", alice);
    expect(body.items.map((i: any) => i.mint)).toEqual([bobMeme.mint]);
    expect((await call("GET", "/feed?tab=following", bob)).body.items).toEqual(
      [],
    );
  });

  test("the following tab needs a session", async () => {
    expect((await call("GET", "/feed?tab=following", null)).status).toBe(401);
  });
});

describe("unfollow", () => {
  test("is idempotent and clears the follow", async () => {
    expect((await call("DELETE", `/users/${bob}/follow`, alice)).status).toBe(
      204,
    );
    expect((await call("DELETE", `/users/${bob}/follow`, alice)).status).toBe(
      204,
    );
    expect((await call("GET", "/me/following", alice)).body.wallets).toEqual(
      [],
    );
    expect(
      (await call("GET", `/users/${bob}`, null)).body.counts.followers,
    ).toBe(1);
  });
});
