import type { IdlAccounts } from "@anchor-lang/core";
import { BPS_DENOMINATOR } from "../core/constants";
import type { FlickoPrograms } from "../idl/flicko_programs";
import {
  curveBuy,
  curveSell,
  poolBuy,
  poolSell,
  spotPrice,
  type BuyQuote,
  type SellQuote,
} from "../math/math";

export type MemeAccount = IdlAccounts<FlickoPrograms>["meme"];
export type ConfigAccount = IdlAccounts<FlickoPrograms>["config"];

export type Phase = "launch" | "graduated";

export interface MemeState {
  phase: Phase;
  totalSupply: bigint;
  saleSupply: bigint;
  poolSupply: bigint;
  virtualSkr: bigint;
  curveSkr: bigint;
  curveTokens: bigint;
  tokensSold: bigint;
  realSkr: bigint;
  poolSkr: bigint;
  poolTokens: bigint;
  creatorFees: bigint;
}

export interface FeeConfig {
  creatorFeeBps: number;
  burnBps: number;
}

const big = (value: { toString(): string }) => BigInt(value.toString());

export const toMemeState = (account: MemeAccount): MemeState => ({
  phase: "graduated" in account.phase ? "graduated" : "launch",
  totalSupply: big(account.totalSupply),
  saleSupply: big(account.saleSupply),
  poolSupply: big(account.poolSupply),
  virtualSkr: big(account.virtualSkr),
  curveSkr: big(account.curveSkr),
  curveTokens: big(account.curveTokens),
  tokensSold: big(account.tokensSold),
  realSkr: big(account.realSkr),
  poolSkr: big(account.poolSkr),
  poolTokens: big(account.poolTokens),
  creatorFees: big(account.creatorFees),
});

export const toFeeConfig = (account: ConfigAccount): FeeConfig => ({
  creatorFeeBps: account.creatorFeeBps,
  burnBps: account.burnBps,
});

export const quoteBuy = (
  meme: MemeState,
  config: FeeConfig,
  skrIn: bigint,
): BuyQuote =>
  meme.phase === "launch"
    ? curveBuy(
        meme.curveSkr,
        meme.curveTokens,
        meme.saleSupply - meme.tokensSold,
        skrIn,
        config.creatorFeeBps,
        config.burnBps,
      )
    : poolBuy(
        meme.poolSkr,
        meme.poolTokens,
        skrIn,
        config.creatorFeeBps,
        config.burnBps,
      );

export const quoteSell = (
  meme: MemeState,
  config: FeeConfig,
  tokensIn: bigint,
): SellQuote =>
  meme.phase === "launch"
    ? curveSell(
        meme.curveSkr,
        meme.curveTokens,
        meme.tokensSold,
        tokensIn,
        config.creatorFeeBps,
        config.burnBps,
      )
    : poolSell(
        meme.poolSkr,
        meme.poolTokens,
        tokensIn,
        config.creatorFeeBps,
        config.burnBps,
      );

export const memePrice = (meme: MemeState) =>
  meme.phase === "launch"
    ? spotPrice(meme.curveSkr, meme.curveTokens)
    : spotPrice(meme.poolSkr, meme.poolTokens);

export const launchProgressBps = (meme: MemeState) =>
  meme.phase === "graduated" || meme.saleSupply === 0n
    ? BPS_DENOMINATOR
    : (meme.tokensSold * BPS_DENOMINATOR) / meme.saleSupply;

export const withSlippage = (amount: bigint, slippageBps: number) =>
  (amount * (BPS_DENOMINATOR - BigInt(slippageBps))) / BPS_DENOMINATOR;
