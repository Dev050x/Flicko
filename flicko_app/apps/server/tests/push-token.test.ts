import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Keypair } from "@solana/web3.js";
import { eq } from "drizzle-orm";
import { createApp } from "../src/app";
import { createSessions } from "../src/auth/jwt";
import { memoryNonceStore } from "../src/auth/nonces";
import { users } from "../src/db/schema";
import { migratedDb, serve } from "./support";

const sessions = createSessions("test-secret-that-is-long-enough-123456");
const alice = Keypair.generate().publicKey.toBase58();
const bob = Keypair.generate().publicKey.toBase58();
const TOKEN = "ExponentPushToken[abc123]";
let db: Awaited<ReturnType<typeof migratedDb>>;
let url = "";
let close = () => {};
let tokens: Record<string, string> = {};

const call = async (method: string, wallet: string, body?: unknown) => {
  const res = await fetch(`${url}/me/push-token`, {
    method,
    headers: {
      authorization: `Bearer ${tokens[wallet]}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.status;
};
const tokenOf = async (wallet: string) =>
  (await db.select().from(users).where(eq(users.wallet, wallet)))[0]!.pushToken;

beforeAll(async () => {
  db = await migratedDb();
  await db.insert(users).values([{ wallet: alice }, { wallet: bob }]);
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

describe("/me/push-token", () => {
  test("stores a valid expo token and rejects anything else", async () => {
    expect(await call("PUT", alice, { token: "not-a-token" })).toBe(400);
    expect(await call("PUT", alice, { token: TOKEN })).toBe(204);
    expect(await tokenOf(alice)).toBe(TOKEN);
  });

  test("moves a device's token to the wallet that registers it last", async () => {
    expect(await call("PUT", bob, { token: TOKEN })).toBe(204);
    expect(await tokenOf(bob)).toBe(TOKEN);
    expect(await tokenOf(alice)).toBeNull();
  });

  test("delete clears it", async () => {
    expect(await call("DELETE", bob)).toBe(204);
    expect(await tokenOf(bob)).toBeNull();
  });
});
