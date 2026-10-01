import { describe, expect, test } from "bun:test";
import { BN } from "@anchor-lang/core";
import { Keypair } from "@solana/web3.js";
import { curveBuy, curveSell, launchParams, poolBuy, poolSell } from "./math";
import {
  launchProgressBps,
  memePrice,
  quoteBuy,
  quoteSell,
  toFeeConfig,
  toMemeState,
  withSlippage,
  type ConfigAccount,
  type MemeAccount,
  type MemeState,
} from "./quote";

const ONE = 1_000_000n;
const fees = { creatorFeeBps: 200, burnBps: 50 };

/*
 * A freshly created meme: 1,000,000 tokens at 0.001 SKR.
 */
const freshMeme = (): MemeState => {
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

const graduatedMeme = (): MemeState => ({
  ...freshMeme(),
  phase: "graduated",
  tokensSold: 800_000n * ONE,
  poolSkr: 3_200n * ONE,
  poolTokens: 200_000n * ONE,
});

describe("account adapters", () => {
  test("toMemeState converts BN fields and the phase enum", () => {
    const account = {
      creator: Keypair.generate().publicKey,
      mint: Keypair.generate().publicKey,
      parent: null,
      imageHash: new Array(32).fill(0),
      phase: { graduated: {} },
      totalSupply: new BN("1000000000000"),
      saleSupply: new BN("800000000000"),
      poolSupply: new BN("200000000000"),
      virtualSkr: new BN("1066666666"),
      curveSkr: new BN("4266666667"),
      curveTokens: new BN("266666666666"),
      tokensSold: new BN("800000000000"),
      realSkr: new BN("3200000001"),
      poolSkr: new BN("3200000001"),
      poolTokens: new BN("200000000000"),
      creatorFees: new BN("65641027"),
      createdAt: new BN(1_790_000_000),
      bump: 254,
    } as unknown as MemeAccount;

    const state = toMemeState(account);
    expect(state.phase).toBe("graduated");
    expect(state.curveSkr).toBe(4_266_666_667n);
    expect(state.poolSkr).toBe(3_200_000_001n);
    expect(state.creatorFees).toBe(65_641_027n);
    expect(
      toMemeState({ ...account, phase: { launch: {} } } as MemeAccount).phase,
    ).toBe("launch");
  });

  test("toFeeConfig keeps the bps values", () => {
    const config = { creatorFeeBps: 200, burnBps: 50 } as ConfigAccount;
    expect(toFeeConfig(config)).toEqual(fees);
  });
});

describe("quotes follow the phase like the program", () => {
  test("launch phase uses the curve with the remaining sale supply", () => {
    const meme = { ...freshMeme(), tokensSold: 10n * ONE };
    expect(quoteBuy(meme, fees, 50n * ONE)).toEqual(
      curveBuy(
        meme.curveSkr,
        meme.curveTokens,
        meme.saleSupply - meme.tokensSold,
        50n * ONE,
        200,
        50,
      ),
    );
    expect(quoteSell(meme, fees, ONE)).toEqual(
      curveSell(meme.curveSkr, meme.curveTokens, meme.tokensSold, ONE, 200, 50),
    );
  });

  test("graduated phase uses the pool", () => {
    const meme = graduatedMeme();
    expect(quoteBuy(meme, fees, 50n * ONE)).toEqual(
      poolBuy(meme.poolSkr, meme.poolTokens, 50n * ONE, 200, 50),
    );
    expect(quoteSell(meme, fees, ONE)).toEqual(
      poolSell(meme.poolSkr, meme.poolTokens, ONE, 200, 50),
    );
  });
});

describe("display helpers", () => {
  test("memePrice is SKR base units per whole token", () => {
    /*
     * V0 = floor(p0 * T0 / 1e6) rounds down, so the start price reads 999, as Meme::price() does on-chain.
     */
    expect(memePrice(freshMeme())).toBe(999n);
    expect(memePrice(graduatedMeme())).toBe(16_000n);
  });

  test("launchProgressBps goes from 0 to 10,000", () => {
    expect(launchProgressBps(freshMeme())).toBe(0n);
    expect(
      launchProgressBps({ ...freshMeme(), tokensSold: 400_000n * ONE }),
    ).toBe(5_000n);
    expect(launchProgressBps(graduatedMeme())).toBe(10_000n);
  });

  test("withSlippage lowers the minimum by the given bps", () => {
    expect(withSlippage(10_000n, 100)).toBe(9_900n);
    expect(withSlippage(10_000n, 0)).toBe(10_000n);
  });
});
