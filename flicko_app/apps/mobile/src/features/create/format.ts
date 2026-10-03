/*
 * Number formatting for the Launch and Live screens. Amounts arrive as base units
 * (bigint) and are shown exactly, trimmed of trailing zeros.
 */

/** 22214400000n, 6 → "22,214.4" (grouped, at most `maxDecimals` decimals) */
export const formatUnits = (units: bigint, decimals: number, maxDecimals = decimals) => {
  const base = 10n ** BigInt(decimals);
  const whole = units / base;
  let fraction = (units % base).toString().padStart(decimals, "0").slice(0, maxDecimals);
  fraction = fraction.replace(/0+$/, "");
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction ? `${grouped}.${fraction}` : grouped;
};

/** 55_536_000 → "55.5M", 1_000_000_000 → "1B" */
export const compact = (value: number) => {
  const units: [number, string][] = [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [size, suffix] of units) {
    if (value >= size) {
      const n = value / size;
      return `${n >= 100 ? Math.round(n) : Number(n.toFixed(1))}${suffix}`;
    }
  }
  return String(Math.round(value));
};

/** "69420000" → "69,420,000" while typing */
export const groupDigits = (digits: string) =>
  digits.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** "0.0001" SKR → base units with `decimals` */
export const parseUnits = (value: string, decimals: number) => {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole || "0") * 10n ** BigInt(decimals) +
    BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
};

/** A price in base units to 3 significant digits: 15999n, 6 → "0.016" */
export const formatPrice = (units: bigint, decimals: number) => {
  const value = Number(units) / 10 ** decimals;
  if (value === 0) return "0";
  return Number(value.toPrecision(3)).toLocaleString("en-US", {
    maximumFractionDigits: decimals,
  });
};
