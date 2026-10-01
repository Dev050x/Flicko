import { describe, expect, test } from "bun:test";
import vectors from "./fixtures/math-vectors.json";
import {
  curveBuy,
  curveSell,
  feesForNet,
  FlickoMathError,
  launchParams,
  poolBuy,
  poolSell,
  splitFees,
} from "../src/math/math";

/*
 * Golden vectors produced by the program's own math.rs:
 *   cargo run -q --example math_vectors > tests/fixtures/math-vectors.json   (see the "vectors" script)
 * Every entry is replayed here and must match exactly, including which error is raised.
 */

type Vector = { op: string; args: (string | number)[]; result: unknown };

const big = (v: string | number) => BigInt(v);
const num = (v: string | number) => Number(v);

const run: Record<string, (args: Vector["args"]) => unknown> = {
  launchParams: ([s, p]) => launchParams(big(s!), big(p!)),
  splitFees: ([a, c, b]) => splitFees(big(a!), num(c!), num(b!)),
  feesForNet: ([a, c, b]) => feesForNet(big(a!), num(c!), num(b!)),
  curveBuy: ([s, t, l, i, c, b]) =>
    curveBuy(big(s!), big(t!), big(l!), big(i!), num(c!), num(b!)),
  poolBuy: ([s, t, i, c, b]) =>
    poolBuy(big(s!), big(t!), big(i!), num(c!), num(b!)),
  curveSell: ([s, t, sold, i, c, b]) =>
    curveSell(big(s!), big(t!), big(sold!), big(i!), num(c!), num(b!)),
  poolSell: ([s, t, i, c, b]) =>
    poolSell(big(s!), big(t!), big(i!), num(c!), num(b!)),
};

const normalize = (value: unknown): unknown => {
  if (typeof value === "bigint") return value.toString();
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, normalize(v)]),
    );
  }
  return value;
};

const outcome = (vector: Vector) => {
  try {
    return normalize(run[vector.op]!(vector.args));
  } catch (err) {
    if (err instanceof FlickoMathError) return { error: err.code };
    throw err;
  }
};

describe("math.ts matches math.rs", () => {
  const byOp: Record<string, Vector[]> = {};
  for (const vector of vectors as Vector[]) {
    (byOp[vector.op] ??= []).push(vector);
  }

  for (const [op, cases] of Object.entries(byOp)) {
    test(`${op} (${cases.length} vectors)`, () => {
      for (const vector of cases) {
        expect({ op, args: vector.args, result: outcome(vector) }).toEqual({
          op,
          args: vector.args,
          result: vector.result,
        });
      }
    });
  }

  test("covers every operation, graduation and error path", () => {
    const all = vectors as Vector[];
    const errors = new Set(
      all.flatMap((v) => {
        const r = v.result as { error?: string };
        return r.error ? [r.error] : [];
      }),
    );
    expect(Object.keys(byOp).sort()).toEqual(Object.keys(run).sort());
    expect(
      all.some((v) => (v.result as { graduates?: boolean }).graduates),
    ).toBe(true);
    expect([...errors].sort()).toEqual([
      "InvalidSupply",
      "MathOverflow",
      "PriceOutOfRange",
      "ZeroAmount",
    ]);
  });
});
