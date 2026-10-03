import { ceilDiv, launchParams, spotPrice } from "../math/math";

/*
 * The numbers the Launch screen shows before a meme exists, from the same math the
 * program runs (`launchParams`, the curve's ceil rounding, `spotPrice`). Amounts are in
 * base units: tokens with MEME_DECIMALS, SKR with the SKR mint's decimals; prices are
 * SKR base units per whole token.
 */
export interface LaunchSummary {
  /** R = 80% of the supply, sold on the launch curve */
  saleSupply: bigint;
  /** Q = 20%, seeded into the pool at graduation */
  poolSupply: bigint;
  /** the curve's opening price (p0 after rounding) */
  startPrice: bigint;
  /** price when the last launch token sells (16 × p0, also the pool's opening price) */
  sellOutPrice: bigint;
  /** real SKR in the curve at sell-out (3.2 × p0 × S), seeded into the pool */
  raisedAtSellOut: bigint;
}

export const launchSummary = (
  supply: bigint,
  startPrice: bigint,
): LaunchSummary => {
  const params = launchParams(supply, startPrice);
  const k = params.virtualSkr * params.virtualTokens;
  const tokensLeft = params.virtualTokens - params.saleSupply;
  const skrAtSellOut = ceilDiv(k, tokensLeft);
  return {
    saleSupply: params.saleSupply,
    poolSupply: params.poolSupply,
    startPrice: spotPrice(params.virtualSkr, params.virtualTokens),
    sellOutPrice: spotPrice(skrAtSellOut, tokensLeft),
    raisedAtSellOut: skrAtSellOut - params.virtualSkr,
  };
};

/*
 * Account sizes `create_meme` pays rent for: the Token-2022 mint (metadata pointer, then
 * the metadata TLV grows with name, symbol and uri), the Meme account and the two
 * vaults. Measured from accounts the devnet program created.
 */
const MINT_BASE_SIZE = 318;
const MEME_SIZE = 259;
const TOKEN_ACCOUNT_SIZE = 165;
/** creator, mint keypair, and the attestor's ed25519 verify instruction */
export const CREATE_MEME_SIGNATURES = 3;

export const createMemeAccountSizes = (
  name: string,
  symbol: string,
  uri: string,
) => {
  const bytes = (text: string) => new TextEncoder().encode(text).length;
  return [
    MINT_BASE_SIZE + bytes(name) + bytes(symbol) + bytes(uri),
    MEME_SIZE,
    TOKEN_ACCOUNT_SIZE,
    TOKEN_ACCOUNT_SIZE,
  ];
};
