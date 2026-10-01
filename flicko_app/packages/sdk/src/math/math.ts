import { BPS_DENOMINATOR, PRICE_SCALE } from "../core/constants";
import type { FlickoProgramsErrorName } from "../idl/flicko_programs_errors";

export const U64_MAX = (1n << 64n) - 1n;
export const U128_MAX = (1n << 128n) - 1n;

export class FlickoMathError extends Error {
  constructor(readonly code: FlickoProgramsErrorName) {
    super(code);
    this.name = "FlickoMathError";
  }
}

const fail = (code: FlickoProgramsErrorName): never => {
  throw new FlickoMathError(code);
};

const require = (ok: boolean, code: FlickoProgramsErrorName) => {
  if (!ok) fail(code);
};

const u128 = (value: bigint) =>
  value < 0n || value > U128_MAX ? fail("MathOverflow") : value;

export const toU64 = (value: bigint) =>
  value < 0n || value > U64_MAX ? fail("MathOverflow") : value;

export interface LaunchParams {
  virtualTokens: bigint;
  virtualSkr: bigint;
  saleSupply: bigint;
  poolSupply: bigint;
}

export interface Fees {
  creator: bigint;
  burn: bigint;
  net: bigint;
}

export interface BuyQuote {
  fees: Fees;
  tokensOut: bigint;
  skrReserve: bigint;
  tokenReserve: bigint;
  graduates: boolean;
}

export interface SellQuote {
  fees: Fees;
  skrReserve: bigint;
  tokenReserve: bigint;
}

export const grossOf = (fees: Fees) =>
  toU64(fees.creator + fees.burn + fees.net);

export const ceilDiv = (numerator: bigint, denominator: bigint) => {
  require(denominator > 0n, "MathOverflow");
  const quotient = numerator / denominator;
  return numerator % denominator === 0n ? quotient : quotient + 1n;
};

export const launchParams = (
  supply: bigint,
  startPrice: bigint,
): LaunchParams => {
  toU64(supply);
  toU64(startPrice);
  require(supply % 5n === 0n, "InvalidSupply");

  const virtualTokens = u128(supply * 16n) / 15n;
  const virtualSkr = u128(startPrice * virtualTokens) / PRICE_SCALE;
  require(virtualSkr > 0n, "PriceOutOfRange");
  u128(virtualSkr * virtualTokens);
  toU64(u128(virtualSkr * 4n));

  const saleSupply = u128(supply * 4n) / 5n;
  return {
    virtualTokens,
    virtualSkr,
    saleSupply: toU64(saleSupply),
    poolSupply: toU64(supply - saleSupply),
  };
};

export const fee = (amount: bigint, bps: number) =>
  toU64(ceilDiv(u128(toU64(amount) * BigInt(bps)), BPS_DENOMINATOR));

export const splitFees = (
  gross: bigint,
  creatorBps: number,
  burnBps: number,
): Fees => {
  const creator = fee(gross, creatorBps);
  const burn = fee(gross, burnBps);
  const net = gross - creator - burn;
  require(net >= 0n, "ZeroAmount");
  return { creator, burn, net };
};

export const feesForNet = (
  net: bigint,
  creatorBps: number,
  burnBps: number,
): Fees => {
  const keep = BPS_DENOMINATOR - BigInt(creatorBps) - BigInt(burnBps);
  require(keep > 0n, "MathOverflow");
  let gross = toU64((toU64(net) * BPS_DENOMINATOR) / keep);

  for (;;) {
    const creator = fee(gross, creatorBps);
    const burn = fee(gross, burnBps);
    const left = gross - creator - burn;
    if (left >= net) return { creator, burn, net: left };
    gross = toU64(gross + 1n);
  }
};

export const curveBuy = (
  curveSkr: bigint,
  curveTokens: bigint,
  tokensLeft: bigint,
  skrIn: bigint,
  creatorBps: number,
  burnBps: number,
): BuyQuote => {
  const fees = splitFees(toU64(skrIn), creatorBps, burnBps);
  require(fees.net > 0n, "ZeroAmount");

  const k = u128(curveSkr * curveTokens);
  const skrAfter = u128(curveSkr + fees.net);
  const tokensAfter = ceilDiv(k, skrAfter);
  const tokensOut = u128(curveTokens - tokensAfter);

  if (tokensOut < tokensLeft) {
    require(tokensOut > 0n, "ZeroAmount");
    return {
      fees,
      tokensOut: toU64(tokensOut),
      skrReserve: skrAfter,
      tokenReserve: tokensAfter,
      graduates: false,
    };
  }

  const tokenReserve = u128(curveTokens - tokensLeft);
  const skrReserve = ceilDiv(k, tokenReserve);
  const net = toU64(u128(skrReserve - curveSkr));

  return {
    fees: feesForNet(net, creatorBps, burnBps),
    tokensOut: tokensLeft,
    skrReserve,
    tokenReserve,
    graduates: true,
  };
};

export const poolBuy = (
  poolSkr: bigint,
  poolTokens: bigint,
  skrIn: bigint,
  creatorBps: number,
  burnBps: number,
): BuyQuote => {
  const fees = splitFees(toU64(skrIn), creatorBps, burnBps);
  require(fees.net > 0n, "ZeroAmount");

  const k = u128(toU64(poolSkr) * toU64(poolTokens));
  const skrAfter = u128(poolSkr + fees.net);
  const tokensAfter = ceilDiv(k, skrAfter);
  const tokensOut = u128(poolTokens - tokensAfter);
  require(tokensOut > 0n, "ZeroAmount");

  return {
    fees,
    tokensOut: toU64(tokensOut),
    skrReserve: skrAfter,
    tokenReserve: tokensAfter,
    graduates: false,
  };
};

const sellAgainst = (
  skrReserve: bigint,
  tokenReserve: bigint,
  tokensIn: bigint,
  creatorBps: number,
  burnBps: number,
): SellQuote => {
  const k = u128(skrReserve * tokenReserve);
  const tokensAfter = u128(tokenReserve + tokensIn);
  const skrAfter = ceilDiv(k, tokensAfter);
  const skrOut = toU64(u128(skrReserve - skrAfter));

  const fees = splitFees(skrOut, creatorBps, burnBps);
  require(fees.net > 0n, "ZeroAmount");

  return { fees, skrReserve: skrAfter, tokenReserve: tokensAfter };
};

export const curveSell = (
  curveSkr: bigint,
  curveTokens: bigint,
  tokensSold: bigint,
  tokensIn: bigint,
  creatorBps: number,
  burnBps: number,
): SellQuote => {
  require(toU64(tokensIn) > 0n, "ZeroAmount");
  require(tokensIn <= tokensSold, "InsufficientLiquidity");
  return sellAgainst(curveSkr, curveTokens, tokensIn, creatorBps, burnBps);
};

export const poolSell = (
  poolSkr: bigint,
  poolTokens: bigint,
  tokensIn: bigint,
  creatorBps: number,
  burnBps: number,
): SellQuote => {
  require(toU64(tokensIn) > 0n, "ZeroAmount");
  return sellAgainst(
    toU64(poolSkr),
    toU64(poolTokens),
    tokensIn,
    creatorBps,
    burnBps,
  );
};

export const spotPrice = (skrReserve: bigint, tokenReserve: bigint) => {
  require(tokenReserve > 0n, "MathOverflow");
  return toU64(u128(skrReserve * PRICE_SCALE) / tokenReserve);
};
