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
  withRepeat,
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
 * The live trades list (Chart tab and Trades tab share it): an outlined card made of a
 * top piece (title + column header), 36px rows, and a bottom piece, so the Trades tab
 * can virtualise rows as separate list cells. Each row has a size bar anchored to the
 * right, scaled to the biggest visible trade.
 */
export const ROW_HEIGHT = 36;
const BAR = { buy: "rgba(200,255,77,", sell: "rgba(255,107,122," };

/* ---- size and emphasis ---- */

export interface TradeContext {
  /** biggest SKR amount among the rows shown */
  maxSkr: number;
  /** the meme's 95th-percentile trade size, SKR */
  largeSkr: number | null;
  /** pool liquidity, SKR (1% of it counts as large) */
  liquiditySkr: number;
  creator: string;
  wallet: string | undefined;
}

export const isLarge = (t: TradeView, ctx: TradeContext) =>
  (t.wallet === ctx.creator && t.side === "sell") ||
  (ctx.largeSkr !== null && t.skr >= ctx.largeSkr) ||
  (ctx.liquiditySkr > 0 && t.skr >= ctx.liquiditySkr * 0.01);

export const barPct = (t: TradeView, maxSkr: number) =>
  maxSkr <= 0 ? 6 : Math.min(100, Math.max(6, (t.skr / maxSkr) * 100));

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

/* ---- card pieces ---- */

function PulseDot() {
  const o = useSharedValue(1);
  useEffect(() => {
    o.value = withRepeat(withTiming(0.35, { duration: 700 }), -1, true);
  }, [o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[styles.dot, style]} />;
}

export function TradesCardTop({
  symbol,
  launching,
  onSeeAll,
}: {
  symbol: string;
  launching: boolean;
  onSeeAll?: () => void;
}) {
  return (
    <View style={styles.top}>
      <View style={styles.head}>
        <View style={styles.headLeft}>
          <Text style={styles.headTitle}>Live trades</Text>
          <PulseDot />
        </View>
        {onSeeAll && (
          <Pressable accessibilityRole="button" onPress={onSeeAll} hitSlop={10}>
            <Text style={styles.seeAll}>See all</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.columns}>
        <View style={styles.markerSpace} />
        <Text style={[styles.colText, styles.skrCol]}>SKR</Text>
        <Text style={[styles.colText, styles.tokCol]} numberOfLines={1}>
          ${symbol}
        </Text>
        <Text style={[styles.colText, styles.traderCol]}>
          {launching ? "Buyer" : "Trader"}
        </Text>
        <Text style={[styles.colText, styles.ageCol]}>Age</Text>
      </View>
    </View>
  );
}

/* Closes the card; shows loading blocks or the empty line when there are no rows. */
export function TradesCardBottom({
  state,
}: {
  state: "rows" | "loading" | "empty";
}) {
  return (
    <View style={styles.bottom}>
      {state === "loading" &&
        Array.from({ length: 6 }, (_, i) => (
          <View key={i} style={styles.row}>
            <View style={[styles.marker, { backgroundColor: D.grid }]} />
            <View style={[styles.skrCol, styles.boneWrap]}>
              <View style={[styles.bone, { width: 40 }]} />
            </View>
            <View style={[styles.tokCol, styles.boneWrap]}>
              <View style={[styles.bone, { width: 36 }]} />
            </View>
            <View style={[styles.traderCol, { flexDirection: "row", gap: 6 }]}>
              <View
                style={[
                  styles.bone,
                  { width: 16, height: 16, borderRadius: 8 },
                ]}
              />
              <View style={[styles.bone, { width: 70 }]} />
            </View>
            <View style={[styles.ageCol, styles.boneWrap]}>
              <View style={[styles.bone, { width: 20 }]} />
            </View>
          </View>
        ))}
      {state === "empty" && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No trades yet</Text>
        </View>
      )}
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
  bar,
  large,
  mine,
  creator,
  flash,
  onPress,
}: {
  trade: TradeView;
  symbol: string;
  /** size bar width, percent */
  bar: number;
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
      ["rgba(31,29,38,0)", D.grid],
    ),
  }));

  const buy = trade.side === "buy";
  const tone = buy ? D.gain : D.loss;
  const who = mine ? "you" : trade.trader.replace(/^@/, "");
  return (
    <Animated.View
      entering={flash ? dropIn : undefined}
      layout={slide}
      style={styles.side}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${buy ? "Buy" : "Sell"}, ${skrLive(trade.skr)} SKR, ${tokensSpoken(trade.tokens)} $${symbol}, by ${who}, ${ageSpoken(trade.at)}`}
        onPress={() => onPress(trade)}
        onLongPress={() => onPress(trade)}
      >
        <Animated.View style={[styles.row, bg]}>
          <View
            style={[
              styles.sizeBar,
              {
                width: `${bar}%`,
                backgroundColor: `${buy ? BAR.buy : BAR.sell}${large ? 0.14 : buy ? 0.07 : 0.08})`,
              },
            ]}
          />
          <View
            style={[styles.marker, { backgroundColor: mine ? D.accent : tone }]}
          />
          <Text
            style={[
              styles.num,
              styles.skrCol,
              styles.skr,
              { color: tone },
              large && styles.large,
            ]}
            numberOfLines={1}
          >
            {skrLive(trade.skr)}
          </Text>
          <Text
            style={[styles.num, styles.tokCol, styles.tokens]}
            numberOfLines={1}
          >
            {tokensLive(trade.tokens)}
          </Text>
          <View style={[styles.traderCol, styles.trader]}>
            <Identicon address={trade.wallet} />
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
            {creator && (
              <View style={styles.tag}>
                <Text style={styles.tagText}>Creator</Text>
              </View>
            )}
          </View>
          <Text style={[styles.num, styles.ageCol, styles.age]}>{age}</Text>
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
  top: {
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: D.line,
    borderTopLeftRadius: D.radius,
    borderTopRightRadius: D.radius,
  },
  head: {
    height: 40,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: D.line,
  },
  headLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  headTitle: { fontFamily: geist.semibold, fontSize: 14, color: D.text },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: D.gain },
  seeAll: { fontFamily: geist.regular, fontSize: 13, color: D.secondary },
  columns: {
    height: 28,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  colText: { fontFamily: geist.regular, fontSize: 11, color: D.muted },
  side: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: D.line },
  bottom: {
    minHeight: 8,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: D.line,
    borderBottomLeftRadius: D.radius,
    borderBottomRightRadius: D.radius,
  },
  row: {
    height: ROW_HEIGHT,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  sizeBar: { position: "absolute", right: 0, top: 0, bottom: 0 },
  marker: { width: 3, height: 16, borderRadius: 2 },
  markerSpace: { width: 3 },
  skrCol: { width: 72, marginLeft: 8, textAlign: "right" },
  tokCol: { width: 64, marginLeft: 12, textAlign: "right" },
  traderCol: { flex: 1, marginLeft: 12 },
  ageCol: { width: 36, textAlign: "right" },
  num: { fontVariant: ["tabular-nums"] },
  skr: { fontFamily: geist.medium, fontSize: 13 },
  large: { fontFamily: geist.semibold },
  tokens: { fontFamily: geist.regular, fontSize: 13, color: D.secondary },
  trader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingRight: 8,
  },
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
    height: 18,
    paddingHorizontal: 6,
    borderRadius: 9,
    backgroundColor: D.line,
    justifyContent: "center",
  },
  tagText: { fontFamily: geist.semibold, fontSize: 10, color: D.secondary },
  age: { fontFamily: geist.regular, fontSize: 12, color: D.muted },
  boneWrap: { alignItems: "flex-end" },
  bone: { height: 10, borderRadius: 3, backgroundColor: D.grid },
  empty: { height: 48, alignItems: "center", justifyContent: "center" },
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
