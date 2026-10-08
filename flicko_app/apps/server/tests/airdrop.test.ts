import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { WelcomeAirdrop } from "../src/airdrop/welcome";
import { createApp } from "../src/app";
import { createSessions } from "../src/auth/jwt";
import { memoryNonceStore } from "../src/auth/nonces";
import { formatMessage, type SignInInput } from "../src/auth/siws";
import { skrAirdrops, users } from "../src/db/schema";
import type { Db } from "../src/db/types";
import { migratedDb, serve, testWallet } from "./support";

/*
 * Welcome SKR: a wallet's first sign-in queues one airdrop (sent in the background),
 * returning users get none, and a failed send is retried on a later sign-in.
 */
const AMOUNT = 10_000n * 1_000_000n;
let url = "";
let close = () => {};
let db: Db;
const sent: string[] = [];
let failNext = false;

const airdrop: WelcomeAirdrop = {
  amount: AMOUNT,
  send: async (wallet) => {
    if (failNext) {
      failNext = false;
      throw new Error("rpc down");
    }
    sent.push(wallet);
    return `sig-${sent.length}`;
  },
};

beforeAll(async () => {
  db = await migratedDb();
  const sessions = createSessions("test-secret-that-is-long-enough-123456");
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
        airdrop,
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

const post = (path: string, body: unknown) =>
  fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

const signIn = async (wallet: ReturnType<typeof testWallet>) => {
  const { input } = (await (
    await post("/auth/nonce", { address: wallet.address })
  ).json()) as { input: SignInInput };
  const message = new TextEncoder().encode(formatMessage(input));
  const res = await post("/auth/siws", {
    address: wallet.address,
    message: b64(message),
    signature: b64(wallet.sign(message)),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as { welcomeSkr?: string };
};

const rowOf = async (wallet: string) => {
  const [row] = await db
    .select()
    .from(skrAirdrops)
    .where(eq(skrAirdrops.wallet, wallet));
  return row;
};

/* The send runs after the response; wait for it to settle. */
const settle = () => new Promise((r) => setTimeout(r, 50));

describe("welcome SKR", () => {
  test("a new wallet gets one airdrop and the response says so", async () => {
    const wallet = testWallet();
    const body = await signIn(wallet);
    expect(body.welcomeSkr).toBe(AMOUNT.toString());
    await settle();
    expect(sent.filter((w) => w === wallet.address)).toHaveLength(1);
    expect(await rowOf(wallet.address)).toMatchObject({
      amount: AMOUNT.toString(),
      signature: expect.stringMatching(/^sig-/),
    });

    const again = await signIn(wallet);
    expect(again.welcomeSkr).toBeUndefined();
    await settle();
    expect(sent.filter((w) => w === wallet.address)).toHaveLength(1);
  });

  test("a wallet that signed up before gets nothing", async () => {
    const wallet = testWallet();
    await db.insert(users).values({ wallet: wallet.address });
    const body = await signIn(wallet);
    expect(body.welcomeSkr).toBeUndefined();
    await settle();
    expect(sent).not.toContain(wallet.address);
    expect(await rowOf(wallet.address)).toBeUndefined();
  });

  test("a failed send is retried on the next sign-in", async () => {
    const wallet = testWallet();
    failNext = true;
    await signIn(wallet);
    await settle();
    expect(await rowOf(wallet.address)).toMatchObject({ signature: null });

    await signIn(wallet);
    await settle();
    expect(sent.filter((w) => w === wallet.address)).toHaveLength(1);
    expect((await rowOf(wallet.address))?.signature).toMatch(/^sig-/);
  });
});
