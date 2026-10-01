import { describe, expect, test } from "bun:test";
import { PRICE_SCALE } from "../core/constants";
import {
  ceilDiv,
  curveBuy,
  curveSell,
  fee,
  feesForNet,
  FlickoMathError,
  grossOf,
  launchParams,
  poolBuy,
  poolSell,
  splitFees,
  toU64,
  U64_MAX,
} from "./math";
import type { FlickoProgramsErrorName } from "../idl/flicko_programs_errors";

/*
 * Port of the #[cfg(test)] module in flicko_programs/.../src/math.rs.
 * Test names match the Rust ones so the two suites can be compared side by side.
 */

const ONE = 1_000_000n;
const launch = () => launchParams(1_000_000n * ONE, 1_000n);
const abs = (v: bigint) => (v < 0n ? -v : v);

const expectCode = (call: () => unknown, code: FlickoProgramsErrorName) => {
  try {
    call();
  } catch (err) {
    expect(err).toBeInstanceOf(FlickoMathError);
    expect((err as FlickoMathError).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
};

describe("launch params", () => {
  test("splits_supply_80_20", () => {
    const p = launchParams(1_000_000n * ONE, 1_000n);
    expect(p.saleSupply).toBe(800_000n * ONE);
    expect(p.poolSupply).toBe(200_000n * ONE);
    expect(p.saleSupply + p.poolSupply).toBe(1_000_000n * ONE);
  });

  test("derives_virtual_reserves", () => {
    const p = launchParams(1_500_000n * ONE, 1_000n);
    expect(p.virtualTokens).toBe(1_600_000n * ONE);
    expect(p.virtualSkr).toBe(1_600n * ONE);
  });

  test("sell_out_price_is_sixteen_times_start", () => {
    const p = launchParams(1_500_000n * ONE, 1_000n);
    const k = p.virtualSkr * p.virtualTokens;
    const tokensLeft = p.virtualTokens - p.saleSupply;
    const skrAtSellOut = k / tokensLeft;
    expect((skrAtSellOut * PRICE_SCALE) / tokensLeft).toBe(16_000n);
    expect(skrAtSellOut - p.virtualSkr).toBe(3n * p.virtualSkr);
  });

  test("rejects_supply_not_divisible_by_5", () => {
    expectCode(() => launchParams(1_000_001n, 1_000n), "InvalidSupply");
  });

  test("rejects_price_that_rounds_to_zero", () => {
    expectCode(() => launchParams(5n, 1n), "PriceOutOfRange");
  });

  test("handles_u64_max_supply", () => {
    const supply = U64_MAX - (U64_MAX % 5n);
    expect(() => launchParams(supply, 1_000n)).not.toThrow();
  });

  test("rejects_overflowing_reserves", () => {
    const supply = U64_MAX - (U64_MAX % 5n);
    expectCode(() => launchParams(supply, U64_MAX), "MathOverflow");
  });
});

describe("fees", () => {
  test("fee_rounds_up", () => {
    expect(fee(0n, 200)).toBe(0n);
    expect(fee(1n, 200)).toBe(1n);
    expect(fee(10_000n, 200)).toBe(200n);
    expect(fee(10_001n, 200)).toBe(201n);
  });

  test("split_fees_adds_up_to_gross", () => {
    for (const gross of [100n, 12_345n, 99n * ONE, 1_000_003n]) {
      const fees = splitFees(gross, 200, 50);
      expect(grossOf(fees)).toBe(gross);
      expect(fees.creator).toBe(fee(gross, 200));
      expect(fees.burn).toBe(fee(gross, 50));
    }
  });

  test("split_fees_rejects_dust", () => {
    expectCode(() => splitFees(1n, 200, 50), "ZeroAmount");
  });

  test("fees_for_net_finds_smallest_gross", () => {
    for (let net = 1n; net < 5_000n; net++) {
      const fees = feesForNet(net, 200, 50);
      const gross = grossOf(fees);
      expect(fees.net).toBe(net);
      expect(splitFees(gross, 200, 50)).toEqual(fees);
      try {
        expect(splitFees(gross - 1n, 200, 50).net < net).toBe(true);
      } catch (err) {
        expect(err).toBeInstanceOf(FlickoMathError);
      }
    }
  });
});

describe("buy", () => {
  test("curve_buy_follows_constant_product", () => {
    const p = launch();
    const skrIn = 100n * ONE;
    const q = curveBuy(
      p.virtualSkr,
      p.virtualTokens,
      p.saleSupply,
      skrIn,
      200,
      50,
    );
    const fees = splitFees(skrIn, 200, 50);
    const k = p.virtualSkr * p.virtualTokens;
    const skrAfter = p.virtualSkr + fees.net;
    const tokensAfter = ceilDiv(k, skrAfter);

    expect(q.fees).toEqual(fees);
    expect(q.graduates).toBe(false);
    expect(q.tokensOut).toBe(p.virtualTokens - tokensAfter);
    expect(q.skrReserve).toBe(skrAfter);
    expect(q.tokenReserve).toBe(tokensAfter);
    expect(q.skrReserve * q.tokenReserve >= k).toBe(true);
  });

  test("curve_buy_rounds_in_pool_favour", () => {
    const p = launch();
    let skr = p.virtualSkr;
    let tokens = p.virtualTokens;
    let sold = 0n;
    const k = skr * tokens;
    for (let i = 1n; i < 200n; i++) {
      const q = curveBuy(skr, tokens, p.saleSupply - sold, i * 7_919n, 200, 50);
      skr = q.skrReserve;
      tokens = q.tokenReserve;
      sold += q.tokensOut;
      expect(skr * tokens >= k).toBe(true);
      expect(tokens + sold).toBe(p.virtualTokens);
    }
  });

  test("sell_out_buy_fills_to_sale_supply_and_refunds", () => {
    const p = launch();
    const skrIn = 10_000n * ONE;
    const q = curveBuy(
      p.virtualSkr,
      p.virtualTokens,
      p.saleSupply,
      skrIn,
      200,
      50,
    );
    const realSkr = q.skrReserve - p.virtualSkr;

    expect(q.graduates).toBe(true);
    expect(q.tokensOut).toBe(p.saleSupply);
    expect(q.tokenReserve).toBe(p.virtualTokens - p.saleSupply);
    expect(q.fees.net).toBe(realSkr);
    expect(grossOf(q.fees) < skrIn).toBe(true);
    expect(
      realSkr >= 3n * p.virtualSkr && realSkr <= 3n * p.virtualSkr + 1n,
    ).toBe(true);
  });

  test("exact_sell_out_amount_graduates", () => {
    const p = launch();
    const first = curveBuy(
      p.virtualSkr,
      p.virtualTokens,
      p.saleSupply,
      10_000n * ONE,
      200,
      50,
    );
    const q = curveBuy(
      p.virtualSkr,
      p.virtualTokens,
      p.saleSupply,
      grossOf(first.fees),
      200,
      50,
    );
    expect(q.graduates).toBe(true);
    expect(q).toEqual(first);
  });

  test("pool_opens_at_sell_out_price", () => {
    const p = launch();
    const q = curveBuy(
      p.virtualSkr,
      p.virtualTokens,
      p.saleSupply,
      10_000n * ONE,
      200,
      50,
    );
    const realSkr = q.skrReserve - p.virtualSkr;
    const curvePrice = (q.skrReserve * PRICE_SCALE) / q.tokenReserve;
    const poolPrice = (realSkr * PRICE_SCALE) / p.poolSupply;
    expect(abs(curvePrice - poolPrice) <= 1n).toBe(true);
    expect(abs(poolPrice - 16_000n) <= 1n).toBe(true);
  });

  test("pool_buy_follows_constant_product", () => {
    const skrIn = 50n * ONE;
    const q = poolBuy(3_200n * ONE, 200_000n * ONE, skrIn, 200, 50);
    const fees = splitFees(skrIn, 200, 50);
    const k = 3_200n * ONE * (200_000n * ONE);
    const tokensAfter = ceilDiv(k, 3_200n * ONE + fees.net);

    expect(q.fees).toEqual(fees);
    expect(q.tokensOut).toBe(200_000n * ONE - tokensAfter);
    expect(q.skrReserve * q.tokenReserve >= k).toBe(true);
  });

  test("buy_rejects_amount_too_small_for_tokens", () => {
    const p = launch();
    expect(() =>
      curveBuy(p.virtualSkr, p.virtualTokens, p.saleSupply, 1n, 200, 50),
    ).toThrow(FlickoMathError);
    expect(() => poolBuy(ONE, 10n, 2n, 0, 0)).toThrow(FlickoMathError);
  });
});

describe("sell", () => {
  test("curve_sell_follows_constant_product", () => {
    const p = launch();
    const bought = curveBuy(
      p.virtualSkr,
      p.virtualTokens,
      p.saleSupply,
      500n * ONE,
      200,
      50,
    );
    const tokensIn = bought.tokensOut / 2n;
    const q = curveSell(
      bought.skrReserve,
      bought.tokenReserve,
      bought.tokensOut,
      tokensIn,
      200,
      50,
    );
    const k = bought.skrReserve * bought.tokenReserve;
    const tokensAfter = bought.tokenReserve + tokensIn;
    const skrAfter = ceilDiv(k, tokensAfter);

    expect(q.fees).toEqual(splitFees(bought.skrReserve - skrAfter, 200, 50));
    expect(q.skrReserve).toBe(skrAfter);
    expect(q.tokenReserve).toBe(tokensAfter);
    expect(q.skrReserve * q.tokenReserve >= k).toBe(true);
  });

  test("buy_then_sell_never_returns_more_than_paid", () => {
    const p = launch();
    for (const skrIn of [ONE, 7n * ONE + 3n, 250n * ONE, 3_399n * ONE]) {
      let b = curveBuy(
        p.virtualSkr,
        p.virtualTokens,
        p.saleSupply,
        skrIn,
        200,
        50,
      );
      let s = curveSell(
        b.skrReserve,
        b.tokenReserve,
        b.tokensOut,
        b.tokensOut,
        200,
        50,
      );
      expect(s.fees.net < skrIn).toBe(true);
      expect(s.skrReserve >= p.virtualSkr).toBe(true);

      b = poolBuy(3_200n * ONE, 200_000n * ONE, skrIn, 200, 50);
      s = poolSell(
        toU64(b.skrReserve),
        toU64(b.tokenReserve),
        b.tokensOut,
        200,
        50,
      );
      expect(s.fees.net < skrIn).toBe(true);
      expect(s.skrReserve >= 3_200n * ONE).toBe(true);
    }
  });

  test("curve_sell_rejects_more_than_sold", () => {
    const p = launch();
    expectCode(
      () => curveSell(p.virtualSkr, p.virtualTokens, 0n, ONE, 200, 50),
      "InsufficientLiquidity",
    );
    expectCode(
      () => curveSell(p.virtualSkr, p.virtualTokens, ONE, 0n, 200, 50),
      "ZeroAmount",
    );
  });

  test("sell_rejects_dust", () => {
    const p = launch();
    const b = curveBuy(
      p.virtualSkr,
      p.virtualTokens,
      p.saleSupply,
      100n * ONE,
      200,
      50,
    );
    expect(() =>
      curveSell(b.skrReserve, b.tokenReserve, b.tokensOut, 1n, 200, 50),
    ).toThrow(FlickoMathError);
  });

  test("random_trades_keep_vault_solvent", () => {
    const p = launchParams(1_000n * ONE, 1_000n);
    /*
     * Same xorshift64 generator and seed as the Rust test, with u64 wrap-around.
     */
    let seed = 0x2545_f491_4f6c_dd1dn;
    const next = (max: bigint) => {
      seed ^= (seed << 13n) & U64_MAX;
      seed ^= seed >> 7n;
      seed ^= (seed << 17n) & U64_MAX;
      return (seed % max) + 1n;
    };

    let curveSkr = p.virtualSkr;
    let curveTokens = p.virtualTokens;
    let sold = 0n;
    let realSkr = 0n;
    let poolSkr = 0n;
    let poolTokens = 0n;
    let vault = 0n;
    let creatorFees = 0n;
    let held = 0n;
    let graduated = false;

    for (let i = 0; i < 5_000; i++) {
      if (held === 0n || next(2n) === 1n) {
        const skrIn = next(ONE);
        let q;
        try {
          q = graduated
            ? poolBuy(poolSkr, poolTokens, skrIn, 200, 50)
            : curveBuy(
                curveSkr,
                curveTokens,
                p.saleSupply - sold,
                skrIn,
                200,
                50,
              );
        } catch {
          continue;
        }
        vault += q.fees.net + q.fees.creator;
        creatorFees += q.fees.creator;
        held += q.tokensOut;
        if (graduated) {
          poolSkr = q.skrReserve;
          poolTokens = q.tokenReserve;
        } else {
          curveSkr = q.skrReserve;
          curveTokens = q.tokenReserve;
          sold += q.tokensOut;
          realSkr = curveSkr - p.virtualSkr;
          if (q.graduates) {
            graduated = true;
            poolSkr = realSkr;
            poolTokens = p.poolSupply;
          }
        }
      } else {
        const tokensIn = next(held);
        let q;
        try {
          q = graduated
            ? poolSell(poolSkr, poolTokens, tokensIn, 200, 50)
            : curveSell(curveSkr, curveTokens, sold, tokensIn, 200, 50);
        } catch {
          continue;
        }
        vault -= q.fees.net + q.fees.burn;
        creatorFees += q.fees.creator;
        held -= tokensIn;
        if (graduated) {
          poolSkr = q.skrReserve;
          poolTokens = q.tokenReserve;
        } else {
          curveSkr = q.skrReserve;
          curveTokens = q.tokenReserve;
          sold -= tokensIn;
          realSkr = curveSkr - p.virtualSkr;
        }
      }

      const reserve = graduated ? poolSkr : realSkr;
      expect(vault >= reserve + creatorFees).toBe(true);
    }
    expect(graduated).toBe(true);
  });
});
