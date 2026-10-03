/*
 * Tiered price-change chip colours (light, translucent glass), from the markets kit.
 * Every % change in the app goes through `changeStyle`; down moves always carry "▼".
 */
export type ChangeStyle = { bg: string; text: string; label: string };

export function changeStyle(pct: number | null): ChangeStyle {
  if (pct === null) return { bg: "rgba(255,255,255,0.20)", text: "#FFFFFF", label: "NEW" };
  const abs = Math.abs(pct);
  const fmt = (n: number) => (n >= 100 ? Math.round(n).toLocaleString("en-US") : n.toFixed(1));
  if (pct >= 1000) return { bg: "rgba(255,210,74,0.38)", text: "#FFF4CC", label: `+${fmt(pct)}%` };
  if (pct >= 100) return { bg: "rgba(61,245,196,0.34)", text: "#E6FFF7", label: `+${fmt(pct)}%` };
  if (pct >= 10) return { bg: "rgba(43,217,163,0.28)", text: "#C9FBEA", label: `+${fmt(pct)}%` };
  if (pct >= 1) return { bg: "rgba(127,217,187,0.24)", text: "#D6F7EC", label: `+${fmt(pct)}%` };
  if (pct > -1) return { bg: "rgba(255,255,255,0.18)", text: "#F2EEF8", label: `${pct.toFixed(1)}%` };
  if (pct > -10) return { bg: "rgba(255,154,155,0.26)", text: "#FFE1E1", label: `▼ ${fmt(abs)}%` };
  if (pct > -50) return { bg: "rgba(255,77,79,0.30)", text: "#FFD6D6", label: `▼ ${fmt(abs)}%` };
  return { bg: "rgba(229,38,43,0.40)", text: "#FFE5E5", label: `▼ ${fmt(abs)}%` };
}

export const CHIP_BORDER = "rgba(255,255,255,0.24)";
