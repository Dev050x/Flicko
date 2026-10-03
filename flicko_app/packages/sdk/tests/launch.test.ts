import { describe, expect, test } from "bun:test";
import { curveBuy, launchParams } from "../src/math/math";
import {
  createMemeAccountSizes,
  launchSummary,
} from "../src/launch/launch";

const ONE = 1_000_000n;

describe("launch summary", () => {
  test("matches the AGENTS.md example: 1M supply at 0.001 SKR", () => {
    const s = launchSummary(1_000_000n * ONE, 1_000n);
    expect(s.saleSupply).toBe(800_000n * ONE);
    expect(s.poolSupply).toBe(200_000n * ONE);
    // V0 rounds down, so each value lands at most one base unit under the formula
    const near = (value: bigint, exact: bigint) =>
      expect(exact - value >= 0n && exact - value <= 1n).toBe(true);
    near(s.startPrice, 1_000n);
    near(s.sellOutPrice, 16_000n);
    near(s.raisedAtSellOut, 3_200n * ONE);
  });

  test("equals what a sell-out buy leaves in the curve", () => {
    for (const [supply, price] of [
      [69_420_000n * ONE, 100n],
      [1_000_000_000n * ONE, 10n],
      [12_345_675n * ONE, 7n],
    ] as const) {
      const params = launchParams(supply, price);
      const buy = curveBuy(
        params.virtualSkr,
        params.virtualTokens,
        params.saleSupply,
        1n << 62n,
        200,
        50,
      );
      expect(buy.graduates).toBe(true);
      const s = launchSummary(supply, price);
      expect(s.raisedAtSellOut).toBe(buy.skrReserve - params.virtualSkr);
      expect(s.saleSupply).toBe(buy.tokensOut);
    }
  });

  test("raises 3.2 x p0 x S and sells out at 16 x p0", () => {
    const s = launchSummary(69_420_000n * ONE, 100n);
    expect(s.raisedAtSellOut).toBe(22_214_400_000n);
    expect(s.sellOutPrice).toBe(1_600n);
  });
});

describe("create_meme account sizes", () => {
  test("mint grows with name, symbol and uri (devnet Smoke Test = 363 bytes)", () => {
    const [mint, meme, tokenVault, skrVault] = createMemeAccountSizes(
      "Smoke Test",
      "SMOKE",
      "https://example.com/smoke.json",
    );
    expect(mint).toBe(363);
    expect([meme, tokenVault, skrVault]).toEqual([259, 165, 165]);
  });
});
