import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../src/app";
import { createSessions } from "../src/auth/jwt";
import { memoryNonceStore } from "../src/auth/nonces";
import { formatMessage, type SignInInput } from "../src/auth/siws";
import { migratedDb, serve, testWallet } from "./support";

/*
 * Full HTTP flow against the real routes, an in-memory Postgres and an in-memory nonce store.
 */
let url = "";
let close = () => {};

beforeAll(async () => {
  const db = await migratedDb();
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

const post = (path: string, body: unknown, token?: string) =>
  fetch(`${url}${path}`, {
    method: path === "/me" ? "PATCH" : "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

/*
 * Runs nonce -> wallet signs -> /auth/siws, like the app does through MWA signIn.
 */
const signIn = async (wallet = testWallet()) => {
  const { input } = (await (
    await post("/auth/nonce", { address: wallet.address })
  ).json()) as {
    input: SignInInput;
  };
  const message = new TextEncoder().encode(formatMessage(input));
  const signature = wallet.sign(message);
  const body = {
    address: wallet.address,
    message: b64(message),
    signature: b64(signature),
  };
  return { wallet, body, res: await post("/auth/siws", body) };
};

describe("auth flow", () => {
  test("nonce returns the sign in fields for MWA", async () => {
    const wallet = testWallet();
    const res = await post("/auth/nonce", { address: wallet.address });
    expect(res.status).toBe(200);
    const { input } = (await res.json()) as { input: SignInInput };
    expect(input).toMatchObject({
      domain: "flicko.app",
      address: wallet.address,
      uri: "https://flicko.app",
      chainId: "solana:devnet",
      version: "1",
    });
  });

  test("rejects a nonce request for an invalid address", async () => {
    expect((await post("/auth/nonce", { address: "nope" })).status).toBe(400);
  });

  test("signing in creates the user and returns a session", async () => {
    const { res, wallet } = await signIn();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      token: string;
      expiresAt: string;
      user: { wallet: string };
    };
    expect(body.user.wallet).toBe(wallet.address);
    expect(body.token.split(".")).toHaveLength(3);
    expect(Date.parse(body.expiresAt)).toBeGreaterThan(Date.now());
  });

  test("a signed message cannot be replayed", async () => {
    const { body } = await signIn();
    const replay = await post("/auth/siws", body);
    expect(replay.status).toBe(401);
    expect(((await replay.json()) as { error: string }).error).toBe(
      "unknown or used nonce",
    );
  });

  test("signing in twice keeps one user", async () => {
    const wallet = testWallet();
    const first = (await (await signIn(wallet)).res.json()) as {
      user: { createdAt: string };
    };
    const second = (await (await signIn(wallet)).res.json()) as {
      user: { createdAt: string };
    };
    expect(second.user.createdAt).toBe(first.user.createdAt);
  });
});

describe("/me", () => {
  const session = async () =>
    (await (await signIn()).res.json()) as {
      token: string;
      user: { wallet: string };
    };

  test("requires a valid bearer token", async () => {
    expect((await fetch(`${url}/me`)).status).toBe(401);
    expect(
      (await fetch(`${url}/me`, { headers: { authorization: "Bearer junk" } }))
        .status,
    ).toBe(401);
  });

  test("returns the signed in user", async () => {
    const { token, user } = await session();
    const res = await fetch(`${url}/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect(
      ((await res.json()) as { user: { wallet: string } }).user.wallet,
    ).toBe(user.wallet);
  });

  test("sets a lowercased username and rejects duplicates", async () => {
    const alice = await session();
    const bob = await session();

    const set = await post("/me", { username: "  GmSer_42 " }, alice.token);
    expect(set.status).toBe(200);
    expect(
      ((await set.json()) as { user: { username: string } }).user.username,
    ).toBe("gmser_42");

    expect(
      (await post("/me", { username: "gmser_42" }, bob.token)).status,
    ).toBe(409);
    expect(
      (await post("/me", { username: "gmser_42" }, alice.token)).status,
    ).toBe(200);
  });

  test("rejects invalid usernames", async () => {
    const { token } = await session();
    for (const username of ["ab", "has space", "x".repeat(21), "emoji😀"]) {
      expect((await post("/me", { username }, token)).status).toBe(400);
    }
  });
});
