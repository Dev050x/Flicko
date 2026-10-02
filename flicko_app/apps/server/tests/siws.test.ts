import { describe, expect, test } from "bun:test";
import { memoryNonceStore } from "../src/auth/nonces";
import {
  createSignInInput,
  formatMessage,
  parseMessage,
  verifySignIn,
  type SiwsPolicy,
} from "../src/auth/siws";
import { testWallet } from "./support";

const policy: SiwsPolicy = {
  domain: "flicko.app",
  uri: "https://flicko.app",
  chainId: "solana:devnet",
  statement: "Sign in to Flicko",
  ttlSeconds: 300,
};

const encode = (text: string) => new TextEncoder().encode(text);

/*
 * Issues a nonce for the wallet, then signs either the standard message or a tampered one.
 */
const signedAttempt = async (
  edit: (message: string) => string = (m) => m,
  wallet = testWallet(),
) => {
  const nonces = memoryNonceStore();
  const input = createSignInInput(policy, wallet.address);
  await nonces.put(input.nonce, wallet.address, policy.ttlSeconds);
  const message = encode(edit(formatMessage(input)));
  return {
    wallet,
    input,
    nonces,
    params: {
      message,
      signature: wallet.sign(message),
      address: wallet.address,
      policy,
      takeNonce: nonces.take,
    },
  };
};

describe("SIWS messages", () => {
  test("format and parse round-trip every field", () => {
    const input = createSignInInput(policy, testWallet().address);
    expect(parseMessage(formatMessage(input))).toEqual(input);
  });

  test("nonces are random 32-char hex", () => {
    const a = createSignInInput(policy, "x").nonce;
    const b = createSignInInput(policy, "x").nonce;
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
  });

  test("rejects text that is not a sign in message", () => {
    expect(() => parseMessage("hello")).toThrow("not a sign in message");
  });
});

describe("verifySignIn", () => {
  test("accepts a correctly signed message once", async () => {
    const { params, wallet } = await signedAttempt();
    expect(await verifySignIn(params)).toBe(wallet.address);
    expect(verifySignIn(params)).rejects.toThrow("unknown or used nonce");
  });

  test("rejects a signature from another wallet", async () => {
    const { params } = await signedAttempt();
    const other = testWallet();
    await expect(
      verifySignIn({ ...params, signature: other.sign(params.message) }),
    ).rejects.toThrow("invalid signature");
  });

  test("rejects a message edited after signing", async () => {
    const { params } = await signedAttempt();
    const tampered = encode(
      new TextDecoder().decode(params.message).replace("devnet", "mainnet"),
    );
    await expect(
      verifySignIn({ ...params, message: tampered }),
    ).rejects.toThrow("invalid signature");
  });

  test("rejects a claimed address that is not in the message", async () => {
    const { params } = await signedAttempt();
    await expect(
      verifySignIn({ ...params, address: testWallet().address }),
    ).rejects.toThrow("address mismatch");
  });

  test("rejects a message for another domain or chain", async () => {
    const domain = await signedAttempt((m) =>
      m.replace("flicko.app wants", "evil.app wants"),
    );
    await expect(verifySignIn(domain.params)).rejects.toThrow("wrong domain");

    const chain = await signedAttempt((m) =>
      m.replace("solana:devnet", "solana:mainnet"),
    );
    await expect(verifySignIn(chain.params)).rejects.toThrow("wrong chain");
  });

  test("rejects an expired message", async () => {
    const { params } = await signedAttempt();
    await expect(
      verifySignIn({ ...params, now: new Date(Date.now() + 301_000) }),
    ).rejects.toThrow("message expired");
  });

  test("rejects a nonce that was never issued", async () => {
    const { params } = await signedAttempt();
    await expect(
      verifySignIn({ ...params, takeNonce: async () => null }),
    ).rejects.toThrow("unknown or used nonce");
  });
});

describe("memoryNonceStore", () => {
  test("nonces expire after their ttl", async () => {
    let now = 0;
    const nonces = memoryNonceStore(() => now);
    await nonces.put("n", "wallet", 60);
    now = 61_000;
    expect(await nonces.take("n")).toBeNull();
  });
});
