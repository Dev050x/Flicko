import { StyleSheet, Text, View } from "react-native";

import type { MarketStats } from "@/features/markets/api";
import { feed, geist } from "@/theme";

const LINE = "#1F1D26";
const PENDING = "#3A3744";

/** 1,234 below 10K, then 12.3K / 128K / 1.28M (at most 4 significant characters) */
export const statNumber = (n: number) => {
  const v = Math.round(n);
  if (v < 10_000) return v.toLocaleString("en-US");
  const [div, suffix] = v >= 1e9 ? [1e9, "B"] : v >= 1e6 ? [1e6, "M"] : [1e3, "K"];
  const x = v / div;
  const digits = x >= 100 ? 0 : x >= 10 ? 1 : 2;
  // floor so 99.96K never rounds up to "100.0K"
  const f = 10 ** digits;
  return `${(Math.floor(x * f) / f).toFixed(digits)}${suffix}`;
};

/*
 * Markets stats strip: one flat row between hairlines, three equal columns split by
 * inset dividers. Loading shows a dim dash; zero shows "0".
 */
export function StatsStrip({ stats }: { stats: MarketStats | undefined }) {
  const cells = [
    { label: "Volume · 24H", value: stats?.volume24hSkr, unit: "SKR" },
    { label: "Trades · 24H", value: stats?.trades24h },
    { label: "Launches · today", value: stats?.launchesToday },
  ];
  return (
    <View style={styles.strip}>
      {cells.map((cell, i) => (
        <View key={cell.label} style={[styles.cell, i > 0 && styles.cellAfter]}>
          {i > 0 && <View style={styles.divider} />}
          <Text style={styles.label} numberOfLines={1}>
            {cell.label}
          </Text>
          {cell.value === undefined ? (
            <Text style={[styles.value, { color: PENDING }]}>—</Text>
          ) : (
            <Text style={styles.value} numberOfLines={1}>
              {statNumber(cell.value)}
              {cell.unit && <Text style={styles.unit}>{` ${cell.unit}`}</Text>}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: LINE,
    paddingVertical: 12,
    marginTop: 12,
    marginBottom: 4,
  },
  cell: { flex: 1, gap: 4 },
  cellAfter: { paddingLeft: 12 },
  divider: {
    position: "absolute",
    left: 0,
    top: 4,
    bottom: 4,
    width: 1,
    backgroundColor: LINE,
  },
  label: { fontFamily: geist.regular, fontSize: 12, color: feed.textMuted },
  value: {
    fontFamily: geist.monoMedium,
    fontSize: 17,
    color: feed.text,
    fontVariant: ["tabular-nums"],
  },
  unit: { fontFamily: geist.regular, fontSize: 13, color: feed.textMuted },
});
