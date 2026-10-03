/* Number and time formats for the feed. */

/** 312, 4.8k, 21.3k, 1.2M */
export const compactCount = (n: number) => {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${trim(n / 1000)}k`;
  return `${trim(n / 1_000_000)}M`;
};

const trim = (n: number) => (n >= 100 ? Math.round(n).toString() : n.toFixed(1).replace(/\.0$/, ""));

/** 1,000 */
export const grouped = (n: number) => n.toLocaleString("en-US");

/** "0.42 SKR" (two decimals, more for tiny prices) */
export const skr = (n: number) => `${price(n)} SKR`;

export const price = (n: number) =>
  n !== 0 && Math.abs(n) < 0.01 ? n.toPrecision(2) : n.toFixed(2);

/** "+338%" */
export const pct = (n: number) => `${n >= 0 ? "+" : "−"}${grouped(Math.round(Math.abs(n)))}%`;

/** "2h ago", "25 min ago", "3d ago" */
export const ago = (ms: number, now = Date.now()) => {
  const min = Math.max(0, Math.floor((now - ms) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

/** "41 min", "2h 8m" */
export const duration = (min: number) =>
  min < 60 ? `${min} min` : `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ""}`;
