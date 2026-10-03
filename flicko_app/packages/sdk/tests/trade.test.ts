import { describe, expect, test } from "bun:test";
import { BN } from "@anchor-lang/core";
import { Connection, Keypair, type TransactionInstruction } from "@solana/web3.js";
import { decodeMemeAccount } from "../src/accounts/meme";
import { buyInstruction, sellInstruction } from "../src/builders/builders";
import { buyInstructionRaw, sellInstructionRaw } from "../src/builders/trade";
import { getReadonlyProgram } from "../src/core/program";
import { launchParams } from "../src/math/math";
import { skrInForTokens } from "../src/quote/inverse";
import { quoteBuy, type MemeState } from "../src/quote/quote";

const program = getReadonlyProgram(new Connection("http://127.0.0.1:1"));
const ONE = 1_000_000n;
const fees = { creatorFeeBps: 200, burnBps: 50 };

const same = (a: TransactionInstruction, b: TransactionInstruction) => {
  expect(a.programId.equals(b.programId)).toBe(true);
  expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
  expect(a.keys.map((k) => [k.pubkey.toBase58(), k.isSigner, k.isWritable])).toEqual(
    b.keys.map((k) => [k.pubkey.toBase58(), k.isSigner, k.isWritable]),
  );
};

describe("raw trade instructions", () => {
  const params = {
    trader: Keypair.generate().publicKey,
    mint: Keypair.generate().publicKey,
    skrMint: Keypair.generate().publicKey,
  };

  test("buy matches Anchor's builder", async () => {
    const amounts = { skrIn: 123_456_789_012n, minTokensOut: (1n << 63n) + 5n };
    same(
      buyInstructionRaw({ ...params, ...amounts }, program.programId),
      await buyInstruction(program, { ...params, ...amounts }),
    );
  });

  test("sell matches Anchor's builder", async () => {
    const amounts = { tokensIn: 42n, minSkrOut: 7n };
    same(
      sellInstructionRaw({ ...params, ...amounts }, program.programId),
      await sellInstruction(program, { ...params, ...amounts }),
    );
  });

  test("rejects amounts outside u64", () => {
    expect(() =>
      buyInstructionRaw({ ...params, skrIn: 1n << 64n, minTokensOut: 0n }),
    ).toThrow();
  });
});

describe("decodeMemeAccount", () => {
  const base = {
    creator: Keypair.generate().publicKey,
    mint: Keypair.generate().publicKey,
    imageHash: Array.from({ length: 32 }, (_, i) => i),
    phase: { graduated: {} },
    totalSupply: new BN("1000000000000"),
    saleSupply: new BN("800000000000"),
    poolSupply: new BN("200000000000"),
    virtualSkr: new BN("340282366920938463463374607431768211455"),
    curveSkr: new BN("18446744073709551617"),
    curveTokens: new BN("1066666666666"),
    tokensSold: new BN("800000000000"),
    realSkr: new BN("3200000000"),
    poolSkr: new BN("3100000000"),
    poolTokens: new BN("200000000001"),
    creatorFees: new BN("64000000"),
    createdAt: new BN(-5),
    bump: 253,
  };

  for (const parent of [null, Keypair.generate().publicKey]) {
    test(`matches Anchor's coder (parent ${parent ? "set" : "none"})`, async () => {
      const data = await program.coder.accounts.encode("meme", { ...base, parent });
      const d = decodeMemeAccount(data);
      expect(d.creator.equals(base.creator)).toBe(true);
      expect(d.mint.equals(base.mint)).toBe(true);
      expect(d.parent?.toBase58() ?? null).toBe(parent?.toBase58() ?? null);
      expect(Array.from(d.imageHash)).toEqual(base.imageHash);
      expect(d).toMatchObject({
        phase: "graduated",
        totalSupply: 1_000_000_000_000n,
        saleSupply: 800_000_000_000n,
        poolSupply: 200_000_000_000n,
        virtualSkr: (1n << 128n) - 1n,
        curveSkr: (1n << 64n) + 1n,
        curveTokens: 1_066_666_666_666n,
        tokensSold: 800_000_000_000n,
        realSkr: 3_200_000_000n,
        poolSkr: 3_100_000_000n,
        poolTokens: 200_000_000_001n,
        creatorFees: 64_000_000n,
        createdAt: -5n,
        bump: 253,
      });
    });
  }
});

describe("skrInForTokens", () => {
  const fresh = (): MemeState => {
    const p = launchParams(1_000_000n * ONE, 1_000n);
    return {
      phase: "launch",
      totalSupply: 1_000_000n * ONE,
      saleSupply: p.saleSupply,
      poolSupply: p.poolSupply,
      virtualSkr: p.virtualSkr,
      curveSkr: p.virtualSkr,
      curveTokens: p.virtualTokens,
      tokensSold: 0n,
      realSkr: 0n,
      poolSkr: 0n,
      poolTokens: 0n,
      creatorFees: 0n,
    };
  };
  const pool: MemeState = {
    ...fresh(),
    phase: "graduated",
    poolSkr: 3_200n * ONE,
    poolTokens: 200_000n * ONE,
  };

  for (const [name, meme] of [
    ["launch", fresh()],
    ["pool", pool],
  ] as const) {
    test(`${name}: smallest amount that buys the tokens`, () => {
      for (const tokens of [1n, ONE, 10n * ONE, 50n * ONE, 12_345n * ONE]) {
        const skr = skrInForTokens(meme, fees, tokens)!;
        expect(quoteBuy(meme, fees, skr).tokensOut).toBeGreaterThanOrEqual(tokens);
        let less: bigint | null = null;
        try {
          less = quoteBuy(meme, fees, skr - 1n).tokensOut;
        } catch {
          less = null;
        }
        if (less !== null) expect(less).toBeLessThan(tokens);
      }
    });
  }

  test("launch: asking past the tokens left buys exactly the rest", () => {
    const meme = fresh();
    const skr = skrInForTokens(meme, fees, meme.saleSupply * 2n)!;
    const quote = quoteBuy(meme, fees, skr);
    expect(quote.tokensOut).toBe(meme.saleSupply);
    expect(quote.graduates).toBe(true);
  });

  test("zero tokens costs nothing", () => {
    expect(skrInForTokens(fresh(), fees, 0n)).toBe(0n);
  });
});
