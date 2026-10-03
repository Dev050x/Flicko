import { memo, useEffect } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { ArrowDownIcon, ArrowUpIcon } from "@/components/markets/icons";
import { config } from "@/config";
import type { TradeView } from "@/features/meme/tabs";
import { ageTiny, compact, priceCompact } from "@/lib/format";
import { detail as D, geist } from "@/theme";

/*
 * One trade, used by the Chart tab's live trades and the Trades tab. Columns:
 * Amount (SKR) · Price (or tokens during launch) · Trader · Age. Tapping opens the
 * transaction in the explorer; `flash` fades a highlight in from #1F1D26 over 600ms.
 */
export const COLUMNS = [1.1, 1, 1.3, 0.5];

export function TradeHeader({ launching }: { launching: boolean }) {
  const labels = [
    "Amount (SKR)",
    launching ? "Tokens" : "Price",
    "Trader",
    "Age",
  ];
  return (
    <View style={styles.header}>
      {labels.map((label, i) => (
        <Text
          key={label}
          style={[
            styles.headerText,
            { flex: COLUMNS[i] },
            i === 3 && styles.right,
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      ))}
    </View>
  );
}

export const TradeRow = memo(function TradeRow({
  trade,
  symbol,
  launching,
  mine,
  flash = false,
}: {
  trade: TradeView;
  symbol: string;
  launching: boolean;
  mine: boolean;
  flash?: boolean;
}) {
  const glow = useSharedValue(flash ? 1 : 0);
  useEffect(() => {
    if (flash) glow.value = withTiming(0, { duration: 600 });
  }, [flash, glow]);
  const bg = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      glow.value,
      [0, 1],
      ["rgba(31,29,38,0)", D.grid],
    ),
  }));

  const buy = trade.side === "buy";
  const tone = buy ? D.gain : D.loss;
  const Arrow = buy ? ArrowUpIcon : ArrowDownIcon;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${buy ? "Buy" : "Sell"} of ${trade.skr} SKR at ${trade.price} SKR by ${mine ? "you" : trade.trader}`}
      onPress={() =>
        Linking.openURL(
          `https://explorer.solana.com/tx/${trade.id}?cluster=${config.cluster}`,
        ).catch(() => {})
      }
    >
      <Animated.View style={[styles.row, bg]}>
        <View style={[styles.amount, { flex: COLUMNS[0] }]}>
          <Arrow size={14} color={tone} />
          <Text
            style={[styles.text, styles.num, { color: tone }]}
            numberOfLines={1}
          >
            {compact(trade.skr)}
          </Text>
        </View>
        <Text
          style={[styles.text, styles.num, { flex: COLUMNS[1] }]}
          numberOfLines={1}
        >
          {launching
            ? `${compact(trade.tokens)} $${symbol}`
            : priceCompact(trade.price)}
        </Text>
        <Text
          style={[
            styles.text,
            { flex: COLUMNS[2] },
            mine
              ? styles.you
              : trade.traderIsAddress
                ? styles.address
                : styles.handle,
          ]}
          numberOfLines={1}
        >
          {mine ? "You" : trade.trader}
        </Text>
        <Text
          style={[styles.age, styles.num, { flex: COLUMNS[3] }, styles.right]}
        >
          {ageTiny(trade.at)}
        </Text>
      </Animated.View>
    </Pressable>
  );
});

/* Three dim rows while trades load. */
export function TradeRowsLoading() {
  return (
    <View style={{ opacity: 0.4 }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.row}>
          {COLUMNS.map((flex, j) => (
            <View key={j} style={{ flex, paddingRight: 12 }}>
              <View style={styles.bone} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", paddingBottom: 8 },
  headerText: { fontFamily: geist.regular, fontSize: 12, color: D.muted },
  row: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: D.rowLine,
  },
  amount: { flexDirection: "row", alignItems: "center", gap: 4 },
  text: { fontFamily: geist.regular, fontSize: 13, color: D.text },
  num: { fontVariant: ["tabular-nums"] },
  handle: { fontFamily: geist.medium, color: D.secondary },
  address: { fontFamily: geist.mono, fontSize: 13, color: D.secondary },
  you: { fontFamily: geist.semibold, color: D.text },
  age: { fontFamily: geist.regular, fontSize: 13, color: D.muted },
  right: { textAlign: "right" },
  bone: { height: 10, borderRadius: 5, backgroundColor: D.line },
});
