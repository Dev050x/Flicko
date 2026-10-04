import { Image } from "expo-image";
import { memo, useEffect, useState } from "react";
import {
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  Easing,
  LinearTransition,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { PillButton } from "@/components/feed/pill-button";
import { config } from "@/config";
import type { TradeView } from "@/features/meme/tabs";
import {
  ageLive,
  ageSpoken,
  priceCompact,
  skrLive,
  tokensLive,
  tokensSpoken,
} from "@/lib/format";
import { detail as D, geist } from "@/theme";

import { Identicon } from "./identicon";

/*
 * The trades table (Chart tab "Live trades" and the Trades tab share it): no container,
 * 1px #1F1D26 lines between rows and between columns (none on the outer edges).
 * Columns: Side · SKR · $TICKER · Trader · Age. Only the side word is coloured.
 * Header and rows are separate pieces so the Trades tab can virtualise rows.
 */
export const ROW_HEIGHT = 34;
const LINE = D.grid;
const HIGHLIGHT = "#17161D";

/* Top 5% by size for this meme (the server's 95th percentile). */
export const isLarge = (t: TradeView, largeSkr: number | null) =>
  largeSkr !== null && t.skr >= largeSkr;

/* ---- age that ticks: every second under a minute, then every minute ---- */

const useAge = (at: number) => {
  const [label, setLabel] = useState(() => ageLive(at));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setLabel(ageLive(at));
      const age = Date.now() - at;
      timer = setTimeout(tick, age < 60_000 ? 1_000 : 60_000);
    };
    tick();
    return () => clearTimeout(timer);
  }, [at]);
  return label;
};

/* ---- section title (Chart tab) and column header ---- */

export function LiveTradesTitle({ onSeeAll }: { onSeeAll: () => void }) {
  return (
    <View style={styles.title}>
      <View style={styles.titleLeft}>
        <Text style={styles.titleText}>Live trades</Text>
        <View style={styles.dot} />
      </View>
      <Pressable accessibilityRole="button" onPress={onSeeAll} hitSlop={10}>
        <Text style={styles.seeAll}>See all</Text>
      </Pressable>
    </View>
  );
}

export function TradesHeader({
  symbol,
  launching,
}: {
  symbol: string;
  launching: boolean;
}) {
  return (
    <View style={[styles.row, styles.headerRow]}>
      <Text style={[styles.headText, styles.sideCol, styles.cellLine]}>
        Side
      </Text>
      <Text
        style={[styles.headText, styles.skrCol, styles.cellLine, styles.right]}
      >
        SKR
      </Text>
      <Text
        style={[styles.headText, styles.tokCol, styles.cellLine, styles.right]}
        numberOfLines={1}
      >
        ${symbol}
      </Text>
      <Text style={[styles.headText, styles.traderCol, styles.cellLine]}>
        {launching ? "Buyer" : "Trader"}
      </Text>
      <Text style={[styles.headText, styles.ageCol, styles.right]}>Age</Text>
    </View>
  );
}

/* Loading rows, or the one-line empty state. */
export function TradesFooter({
  state,
}: {
  state: "rows" | "loading" | "empty";
}) {
  if (state === "empty") {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No trades here yet</Text>
      </View>
    );
  }
  if (state !== "loading") return null;
  return (
    <View>
      {Array.from({ length: 6 }, (_, i) => (
        <View key={i} style={styles.row}>
          {[
            styles.sideCol,
            styles.skrCol,
            styles.tokCol,
            styles.traderCol,
            styles.ageCol,
          ].map((col, j) => (
            <View
              key={j}
              style={[
                styles.cell,
                col,
                j < 4 && styles.cellLine,
                j > 0 && j < 3 && styles.end,
              ]}
            >
              <View style={[styles.bone, { width: j === 3 ? 80 : 24 }]} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/* ---- row ---- */

// Rows below a new one slide down to make room.
const slide = LinearTransition.duration(160).easing(Easing.out(Easing.quad));

// New rows drop in from above; module-level so it runs as a worklet on Android.
const dropIn = () => {
  "worklet";
  return {
    initialValues: { transform: [{ translateY: -ROW_HEIGHT }], opacity: 0 },
    animations: {
      transform: [
        {
          translateY: withTiming(0, {
            duration: 160,
            easing: Easing.out(Easing.quad),
          }),
        },
      ],
      opacity: withTiming(1, { duration: 160 }),
    },
  };
};

export const TradeRow = memo(function TradeRow({
  trade,
  symbol,
  large,
  mine,
  creator,
  flash,
  onPress,
}: {
  trade: TradeView;
  symbol: string;
  large: boolean;
  mine: boolean;
  creator: boolean;
  flash: boolean;
  onPress: (trade: TradeView) => void;
}) {
  const age = useAge(trade.at);
  const glow = useSharedValue(flash ? 1 : 0);
  useEffect(() => {
    if (flash) glow.value = withTiming(0, { duration: 600 });
  }, [flash, glow]);
  const bg = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      glow.value,
      [0, 1],
      ["rgba(23,22,29,0)", HIGHLIGHT],
    ),
  }));

  const buy = trade.side === "buy";
  const who = mine ? "you" : trade.trader.replace(/^@/, "");
  return (
    <Animated.View entering={flash ? dropIn : undefined} layout={slide}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${buy ? "Buy" : "Sell"}, ${skrLive(trade.skr)} SKR, ${tokensSpoken(trade.tokens)} $${symbol}, by ${who}, ${ageSpoken(trade.at)}`}
        onPress={() => onPress(trade)}
        onLongPress={() => onPress(trade)}
      >
        <Animated.View style={[styles.row, bg]}>
          <Text
            style={[
              styles.text,
              styles.sideCol,
              styles.cellLine,
              styles.sideText,
              { color: buy ? D.gain : D.loss },
            ]}
          >
            {buy ? "Buy" : "Sell"}
          </Text>
          <Text
            style={[
              styles.text,
              styles.skrCol,
              styles.cellLine,
              styles.right,
              styles.skr,
              large && styles.large,
            ]}
            numberOfLines={1}
          >
            {skrLive(trade.skr)}
          </Text>
          <Text
            style={[
              styles.text,
              styles.tokCol,
              styles.cellLine,
              styles.right,
              styles.tokens,
            ]}
            numberOfLines={1}
          >
            {tokensLive(trade.tokens)}
          </Text>
          <View style={[styles.traderCol, styles.cellLine, styles.trader]}>
            {trade.avatar ? (
              <Image source={trade.avatar} style={styles.avatar} />
            ) : mine ? (
              <View style={[styles.avatar, { backgroundColor: D.accent }]} />
            ) : trade.traderIsAddress ? (
              <View style={[styles.avatar, { backgroundColor: D.line }]} />
            ) : (
              <Identicon address={trade.wallet} />
            )}
            <Text
              style={
                mine
                  ? styles.you
                  : trade.traderIsAddress
                    ? styles.address
                    : styles.handle
              }
              numberOfLines={1}
            >
              {mine ? "You" : trade.trader}
            </Text>
            {creator && !mine && (
              <View style={styles.tag}>
                <Text style={styles.tagText}>Creator</Text>
              </View>
            )}
          </View>
          <Text style={[styles.text, styles.ageCol, styles.right, styles.age]}>
            {age}
          </Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
});

/* ---- tap sheet ---- */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const two = (n: number) => String(n).padStart(2, "0");
const when = (ms: number) => {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
};

export function TradeSheet({
  trade,
  symbol,
  bottomInset,
  onClose,
}: {
  trade: TradeView;
  symbol: string;
  bottomInset: number;
  onClose: () => void;
}) {
  const buy = trade.side === "buy";
  const rows: [string, string, boolean?][] = [
    ["Side", buy ? "Buy" : "Sell"],
    ["Amount", `${skrLive(trade.skr)} SKR`],
    ["Tokens", `${tokensLive(trade.tokens)} $${symbol}`],
    ["Price", `${priceCompact(trade.price)} SKR`],
    ["Time", when(trade.at)],
    ["Trader", trade.wallet, true],
  ];
  return (
    <Modal
      transparent
      visible
      statusBarTranslucent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityLabel="Close"
        style={styles.dim}
        onPress={onClose}
      />
      <View style={[styles.sheet, { paddingBottom: bottomInset + 16 }]}>
        <View style={styles.grab} />
        {rows.map(([label, value, mono]) => (
          <View key={label} style={styles.sheetRow}>
            <Text style={styles.sheetLabel}>{label}</Text>
            <Text
              style={[
                mono ? styles.sheetMono : styles.sheetValue,
                label === "Side" && { color: buy ? D.gain : D.loss },
              ]}
              selectable={mono}
            >
              {value}
            </Text>
          </View>
        ))}
        <PillButton
          kind="outline"
          label="View on explorer"
          height={48}
          style={{ marginTop: 16 }}
          onPress={() => {
            Linking.openURL(
              `https://explorer.solana.com/tx/${trade.id}?cluster=${config.cluster}`,
            ).catch(() => {});
            onClose();
          }}
        >
          <Text style={styles.sheetButton}>View on explorer</Text>
        </PillButton>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  title: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  titleLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  titleText: { fontFamily: geist.semibold, fontSize: 15, color: D.text },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: D.gain },
  seeAll: { fontFamily: geist.regular, fontSize: 13, color: D.secondary },
  row: {
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "stretch",
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  headerRow: { height: 28, borderTopWidth: 1, borderTopColor: LINE },
  headText: {
    fontFamily: geist.regular,
    fontSize: 12,
    color: D.muted,
    paddingHorizontal: 8,
    textAlignVertical: "center",
    lineHeight: 27,
  },
  cell: { paddingHorizontal: 8, justifyContent: "center" },
  end: { alignItems: "flex-end" },
  // a line on the right of every column but the last
  cellLine: { borderRightWidth: 1, borderRightColor: LINE },
  // outer edges have no padding
  sideCol: { width: 44, paddingLeft: 0 },
  skrCol: { width: 64 },
  tokCol: { width: 64 },
  traderCol: { flex: 1 },
  ageCol: { width: 40, paddingRight: 0 },
  text: {
    fontSize: 13,
    paddingHorizontal: 8,
    textAlignVertical: "center",
    lineHeight: ROW_HEIGHT - 1,
    fontVariant: ["tabular-nums"],
  },
  right: { textAlign: "right" },
  sideText: { fontFamily: geist.medium },
  skr: { fontFamily: geist.medium, color: D.text },
  large: { fontFamily: geist.semibold },
  tokens: { fontFamily: geist.regular, color: D.secondary },
  trader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
  },
  avatar: { width: 16, height: 16, borderRadius: 8 },
  handle: {
    flexShrink: 1,
    fontFamily: geist.regular,
    fontSize: 13,
    color: D.text,
  },
  address: {
    flexShrink: 1,
    fontFamily: geist.mono,
    fontSize: 12,
    color: D.secondary,
  },
  you: {
    flexShrink: 1,
    fontFamily: geist.semibold,
    fontSize: 13,
    color: D.text,
  },
  tag: {
    height: 16,
    paddingHorizontal: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: D.pending,
    justifyContent: "center",
  },
  tagText: { fontFamily: geist.semibold, fontSize: 10, color: D.secondary },
  age: { fontFamily: geist.regular, fontSize: 12, color: D.muted },
  bone: { height: 10, borderRadius: 3, backgroundColor: LINE },
  empty: {
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  emptyText: { fontFamily: geist.regular, fontSize: 13, color: D.muted },
  dim: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(5,5,8,0.6)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 10,
    backgroundColor: D.bg,
    borderTopWidth: 1,
    borderColor: D.line,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  grab: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: D.line,
    marginBottom: 12,
  },
  sheetRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: D.line,
  },
  sheetLabel: { fontFamily: geist.regular, fontSize: 14, color: D.secondary },
  sheetValue: {
    fontFamily: geist.medium,
    fontSize: 14,
    color: D.text,
    fontVariant: ["tabular-nums"],
  },
  sheetMono: {
    flexShrink: 1,
    fontFamily: geist.mono,
    fontSize: 12,
    color: D.text,
    textAlign: "right",
  },
  sheetButton: { fontFamily: geist.semibold, fontSize: 15, color: D.text },
});
