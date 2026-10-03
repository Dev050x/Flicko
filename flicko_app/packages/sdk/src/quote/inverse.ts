import { FlickoMathError } from "../math/math";
import { quoteBuy, type FeeConfig, type MemeState } from "./quote";

/*
 * The smallest `skr_in` whose buy returns at least `tokens` (base units), found by
 * binary search over `quoteBuy`, so it matches the program's rounding exactly. During
 * launch a request past the tokens left is capped there (the sell-out buy fills to the
 * end and refunds the rest). Returns null if no amount up to u64 max is enough.
 */
const U64_MAX = (1n << 64n) - 1n;

const tokensFor = (meme: MemeState, config: FeeConfig, skrIn: bigint) => {
  try {
    return quoteBuy(meme, config, skrIn).tokensOut;
  } catch (err) {
    if (err instanceof FlickoMathError) return null;
    throw err;
  }
};

export const skrInForTokens = (
  meme: MemeState,
  config: FeeConfig,
  tokens: bigint,
): bigint | null => {
  if (tokens <= 0n) return 0n;
  const want =
    meme.phase === "launch" && tokens > meme.saleSupply - meme.tokensSold
      ? meme.saleSupply - meme.tokensSold
      : tokens;
  if (want <= 0n) return null;
  const enough = (skrIn: bigint) => (tokensFor(meme, config, skrIn) ?? -1n) >= want;

  let hi = 1n;
  while (!enough(hi)) {
    if (hi >= U64_MAX) return null;
    hi = hi * 2n > U64_MAX ? U64_MAX : hi * 2n;
  }
  let lo = hi / 2n; // not enough (or 0)
  while (hi - lo > 1n) {
    const mid = (lo + hi) / 2n;
    if (enough(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
};
