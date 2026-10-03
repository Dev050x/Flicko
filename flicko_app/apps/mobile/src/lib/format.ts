/*
 * Number formats shared by Markets and meme detail (markets kit rules): prices in SKR
 * with 2 decimals from 1 up and 4 significant digits below 1; big values compact.
 */

/** 2.40, 0.0021, 0.00018 */
export const priceSkr = (n: number) => {
  if (!Number.isFinite(n) || n === 0) return "0";
  if (Math.abs(n) >= 1) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return String(Number(n.toPrecision(4)));
};

/** 842, 1.2K, 210K, 1.34M, 4.8B */
export const compact = (n: number) => {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const unit = (v: number, suffix: string) => {
    const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
    return `${sign}${String(Number(v.toFixed(digits)))}${suffix}`;
  };
  if (abs >= 1e9) return unit(abs / 1e9, "B");
  if (abs >= 1e6) return unit(abs / 1e6, "M");
  if (abs >= 1e3) return unit(abs / 1e3, "K");
  return `${sign}${abs >= 100 ? Math.round(abs) : Number(abs.toFixed(abs >= 1 ? 1 : 4))}`;
};

/** 84,213 */
export const grouped = (n: number) => Math.round(n).toLocaleString("en-US");

/** "6h", "22m", "2d" */
export const ageShort = (ms: number, now = Date.now()) => {
  const min = Math.max(0, Math.floor((now - ms) / 60_000));
  if (min < 60) return `${Math.max(1, min)}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
};

/** "1d 22h", "3h 10m", "12m" */
export const ageLong = (ms: number, now = Date.now()) => {
  const min = Math.max(0, Math.floor((now - ms) / 60_000));
  if (min < 60) return `${Math.max(1, min)}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ${min % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
};

/** "7xKp…3fQa" */
export const shortAddress = (address: string) =>
  address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;

const SUBSCRIPT = "₀₁₂₃₄₅₆₇₈₉";

/**
 * Prices below 0.001 in subscript-zero notation: 0.000009 → "0.0₅9" (the subscript is
 * how many zeros follow the decimal point), keeping up to 4 significant digits.
 * Everything else as `priceSkr`.
 */
export const priceCompact = (n: number) => {
  if (!Number.isFinite(n) || n <= 0 || n >= 0.001) return priceSkr(n);
  // 9.120e-6 → digits "912", exponent -6 → 5 zeros after the point
  const [mantissa, exponent] = n.toExponential(3).split("e");
  const zeros = -Number(exponent) - 1;
  const digits = mantissa.replace(".", "").replace(/0+$/, "");
  const sub = String(zeros)
    .split("")
    .map((d) => SUBSCRIPT[Number(d)])
    .join("");
  return `0.0${sub}${digits}`;
};
