import { Image } from "expo-image";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ChangeChip } from "@/components/ui/change-chip";
import type { MarketItem, Window } from "@/features/markets/api";
import { ageShort, compact, priceSkr } from "@/lib/format";
import { colors, market, mono } from "@/theme";

export const ROW_HEIGHT = 76;

/*
 * One Markets row (Markets.html): rank, thumbnail, $TICKER + age + POOL tag or launch
 * progress, a muted "MCap · Vol · holders" line, and price + change on the right.
 */
export const MarketRow = memo(function MarketRow({
  item,
  rank,
  window,
  onPress,
}: {
  item: MarketItem;
  rank: number;
  window: Window;
  onPress: (mint: string) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`$${item.symbol}, ${priceSkr(item.priceSkr)} SKR`}
      onPress={() => onPress(item.mint)}
      android_ripple={{ color: "rgba(255,255,255,0.06)" }}
      style={styles.row}
    >
      <Text style={styles.rank}>{rank}</Text>
      <View style={styles.thumb}>
        {item.image && (
          <Image
            source={item.image}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            recyclingKey={item.mint}
            transition={120}
          />
        )}
      </View>
      <View style={styles.middle}>
        <View style={styles.titleLine}>
          <Text style={styles.ticker} numberOfLines={1}>
            ${item.symbol}
          </Text>
          <Text style={styles.age}>{ageShort(item.createdAt)}</Text>
          {item.phase === "pool" ? (
            <View style={styles.tag}>
              <Text style={styles.tagText}>POOL</Text>
            </View>
          ) : (
            <View style={styles.progress}>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.min(100, item.launchPct)}%` }]} />
              </View>
              <Text style={styles.pct}>{Math.floor(item.launchPct)}%</Text>
            </View>
          )}
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          MCap <Text style={styles.metaNum}>{compact(item.marketCapSkr)}</Text> · Vol{" "}
          <Text style={styles.metaNum}>{compact(item.volumeSkr[window])}</Text> ·{" "}
          <Text style={styles.metaNum}>{compact(item.holders)}</Text> holders
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.price}>{priceSkr(item.priceSkr)}</Text>
        <ChangeChip pct={item.change[window]} />
      </View>
    </Pressable>
  );
});

/* A grey placeholder row while the list loads. */
export function MarketRowSkeleton() {
  return (
    <View style={styles.row}>
      <View style={{ width: 14 }} />
      <View style={[styles.thumb, styles.bone]} />
      <View style={[styles.middle, { gap: 8 }]}>
        <View style={[styles.bone, { width: 110, height: 14, borderRadius: 7 }]} />
        <View style={[styles.bone, { width: 180, height: 10, borderRadius: 5 }]} />
      </View>
      <View style={[styles.right, { gap: 8 }]}>
        <View style={[styles.bone, { width: 56, height: 14, borderRadius: 7 }]} />
        <View style={[styles.bone, { width: 52, height: 22, borderRadius: 11 }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: market.line,
  },
  rank: {
    width: 14,
    textAlign: "right",
    fontFamily: mono.medium,
    fontSize: 12,
    color: colors.textFaint,
  },
  thumb: {
    width: 46,
    height: 46,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  middle: { flex: 1, minWidth: 0, gap: 4 },
  titleLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  ticker: { fontFamily: "DMSans_700Bold", fontSize: 15, color: colors.text, flexShrink: 1 },
  age: { fontFamily: mono.medium, fontSize: 12, color: colors.textFaint },
  tag: {
    height: 18,
    paddingHorizontal: 6,
    borderRadius: 9,
    backgroundColor: market.chipSelected,
    justifyContent: "center",
  },
  tagText: { fontFamily: "DMSans_700Bold", fontSize: 10, color: colors.textMuted },
  progress: { flexDirection: "row", alignItems: "center", gap: 5 },
  track: { width: 34, height: 4, borderRadius: 2, backgroundColor: market.barTrack },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.text },
  pct: { fontFamily: mono.medium, fontSize: 10, color: colors.textMuted },
  meta: { fontFamily: "DMSans_400Regular", fontSize: 12, color: market.label },
  metaNum: { fontFamily: mono.medium },
  right: { alignItems: "flex-end", gap: 4 },
  price: { fontFamily: mono.medium, fontSize: 15, color: colors.text },
  bone: { backgroundColor: colors.surface },
});
