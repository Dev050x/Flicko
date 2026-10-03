import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  Keypair,
  PublicKey,
  type ParsedTransactionWithMeta,
} from "@solana/web3.js";
import { createApp } from "../src/app";
import { createSessions } from "../src/auth/jwt";
import { sumBurns, type BurnVerifier } from "../src/filters/burns";
import { migratedDb, serve } from "./support";

const key = () => Keypair.generate().publicKey.toBase58();
const sig = () =>
  Array.from({ length: 88 }, () => "123456789ABCDEFGH"[Math.floor(Math.random() * 17)]).join("");

const SKR = key();
const wallet = key();
const other = key();
const sessions = createSessions("test-secret-that-is-long-enough-123456");

// signature → { owner, mint, amount } the fake chain reports as burned
const burns = new Map<string, { owner: string; mint: string; amount: bigint }>();
const verifier: BurnVerifier = {
  burnedBy: async (signature, owner, mint) => {
    const burn = burns.get(signature);
    if (!burn) return null;
    return burn.owner === owner && burn.mint === mint ? burn.amount : 0n;
  },
};

let url = "";
let close = () => {};
let auth = "";

const call = async (method: string, path: string, body?: unknown, token = auth) => {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as any };
};

beforeAll(async () => {
  const db = await migratedDb();
  auth = (await sessions.issue(wallet)).token;
  ({ url, close } = await serve(
    createApp({
      corsOrigin: "*",
      health: { ping: async () => {}, cluster: "devnet", programId: "p", skrMint: SKR },
      filters: { db, sessions, burns: verifier, skrMint: SKR, skrDecimals: 6 },
    }),
  ));
});

afterAll(() => close());

describe("premium filter unlocks", () => {
  test("need a session", async () => {
    expect((await call("GET", "/me/filters", undefined, "")).status).toBe(401);
  });

  test("unlock laser-eyes with a 5 SKR burn, once per signature", async () => {
    const signature = sig();
    burns.set(signature, { owner: wallet, mint: SKR, amount: 5_000_000n });

    const res = await call("POST", "/filters/unlock", { filterId: "laser-eyes", signature });
    expect(res).toEqual({ status: 201, body: { filterId: "laser-eyes", unlocked: true } });
    expect((await call("GET", "/me/filters")).body).toEqual({ filterIds: ["laser-eyes"] });

    // Already unlocked: fine, nothing new recorded.
    const again = await call("POST", "/filters/unlock", { filterId: "laser-eyes", signature: sig() });
    expect(again.status).toBe(200);

    // The same burn can't unlock for another wallet.
    const otherToken = (await sessions.issue(other)).token;
    const reuse = await call("POST", "/filters/unlock", { filterId: "laser-eyes", signature }, otherToken);
    expect(reuse.status).toBe(409);
  });

  test("rejects free filters, short burns, other mints and missing transactions", async () => {
    const otherToken = (await sessions.issue(other)).token;
    const post = (signature: string, filterId = "laser-eyes") =>
      call("POST", "/filters/unlock", { filterId, signature }, otherToken);

    expect((await post(sig(), "wagmi")).status).toBe(404);
    expect((await post(sig(), "nope")).status).toBe(404);
    expect((await post("not-a-signature")).status).toBe(400);

    const short = sig();
    burns.set(short, { owner: other, mint: SKR, amount: 4_999_999n });
    expect((await post(short)).status).toBe(422);

    const wrongMint = sig();
    burns.set(wrongMint, { owner: other, mint: key(), amount: 9_000_000n });
    expect((await post(wrongMint)).status).toBe(422);

    expect((await post(sig())).status).toBe(422);
  });
});

describe("sumBurns", () => {
  const owner = key();
  const account = key();
  const tx = (instructions: unknown[], inner: unknown[] = []) =>
    ({
      transaction: {
        message: {
          accountKeys: [owner, account].map((k) => ({ pubkey: new PublicKey(k) })),
          instructions,
        },
      },
      meta: {
        err: null,
        preTokenBalances: [{ accountIndex: 1, mint: SKR }],
        postTokenBalances: [],
        innerInstructions: [{ index: 0, instructions: inner }],
      },
    }) as unknown as ParsedTransactionWithMeta;
  const ix = (type: string, info: object, program = "spl-token") => ({
    program,
    programId: new PublicKey(key()),
    parsed: { type, info },
  });

  test("adds burnChecked and burn (mint from token balances) by the owner", () => {
    const parsed = tx(
      [
        ix("burnChecked", { account, mint: SKR, authority: owner, tokenAmount: { amount: "3000000" } }),
        ix("transfer", { source: account, authority: owner, amount: "9" }),
      ],
      [ix("burn", { account, authority: owner, amount: "2000000" }, "spl-token-2022")],
    );
    expect(sumBurns(parsed, owner, SKR)).toBe(5_000_000n);
  });

  test("ignores other owners and other mints", () => {
    const parsed = tx([
      ix("burnChecked", { account, mint: SKR, authority: key(), tokenAmount: { amount: "5" } }),
      ix("burnChecked", { account, mint: key(), authority: owner, tokenAmount: { amount: "5" } }),
    ]);
    expect(sumBurns(parsed, owner, SKR)).toBe(0n);
  });
});
