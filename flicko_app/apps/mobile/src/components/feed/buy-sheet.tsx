import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { CloseIcon } from "@/components/ui/icons";
import { grouped, price, skr } from "@/features/feed/format";
import type { Meme } from "@/features/feed/types";
import { formatSkr, useSkrBalance } from "@/features/wallet/skr-balance";
import { useSession } from "@/store/session";
import { feed, geist } from "@/theme";

import { MinusIcon, PlusIcon } from "./icons";

/*
 * Buy sheet (flicko_feed "Buy sheet" design) over the dimmed feed. Launching memes buy
 * at the fixed launch price, clamped to the supply left. Trading memes reuse the sheet
 * for buy and sell at the pool price. Swipe down, the X, the dim or back closes it.
 */
export type TradeSide = "buy" | "sell";

export interface TradeOrder {
  memeId: string;
  ticker: string;
  side: TradeSide;
  quantity: number;
  priceEach: number;
  total: number;
}

const CHIPS = [1, 10, 50] as const;
const DEFAULT_QUANTITY = 10;
// TODO(milestone 3): the pool's real limits (sell: the wallet's balance; buy: what the
// SKR balance and pool depth allow). These caps only keep the mock stepper bounded.
const MOCK_POOL_BUY_MAX = 10_000;
const MOCK_HELD = 120;
// One signature at the base fee. TODO(milestone 3): add rent for a new token account.
const BASE_FEE_SOL = 0.000005;
const CLOSE_DISTANCE = 120;
const CLOSE_VELOCITY = 900;

const clamp = (n: number, max: number) => Math.max(1, Math.min(max, Math.round(n)));

/** Two decimals; more for amounts under 0.01 so tiny prices don't read as 0.00. */
const amount = (n: number) => price(n);

export function BuySheet({
  meme,
  side,
  onClose,
  onApprove,
}: {
  meme: Meme;
  side: TradeSide;
  onClose: () => void;
  onApprove: (order: TradeOrder) => void;
}) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const wallet = useSession((s) => s.session?.wallet);
  const balance = useSkrBalance(wallet);

  const launching = meme.status === "launching";
  const left = Math.max(0, meme.supplyTotal - meme.supplySold);
  const max = launching ? left : side === "sell" ? MOCK_HELD : MOCK_POOL_BUY_MAX;
  // TODO(milestone 3): quote the pool through @flicko/sdk (price impact, fees) instead
  // of multiplying by the current pool price.
  const priceEach = launching ? meme.launchPrice : (meme.poolPrice ?? meme.launchPrice);
  const [quantity, setQuantity] = useState(() => clamp(DEFAULT_QUANTITY, Math.max(1, max)));
  const total = quantity * priceEach;
  const soldOut = max < 1;

  const set = (n: number) => {
    const next = clamp(n, max);
    if (next !== quantity) Haptics.selectionAsync().catch(() => {});
    setQuantity(next);
  };

  // Slide in, follow the finger down, close past a distance or a flick.
  const offset = useSharedValue(window.height);
  const dim = useSharedValue(0);
  useEffect(() => {
    offset.value = withSpring(0, { damping: 26, stiffness: 260, mass: 0.9 });
    dim.value = withTiming(1, { duration: 180 });
  }, [offset, dim]);

  const close = () => {
    dim.value = withTiming(0, { duration: 160 });
    offset.value = withTiming(window.height, { duration: 200 }, (done) => {
      if (done) scheduleOnRN(onClose);
    });
  };

  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetX([-20, 20])
    .onUpdate((e) => {
      offset.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > CLOSE_DISTANCE || e.velocityY > CLOSE_VELOCITY) {
        dim.value = withTiming(0, { duration: 160 });
        offset.value = withTiming(window.height, { duration: 200 }, (done) => {
          if (done) scheduleOnRN(onClose);
        });
      } else {
        offset.value = withSpring(0, { damping: 26, stiffness: 260 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value }));

  const verb = side === "buy" ? "Buy" : "Sell";
  const subtitle = launching ? "fixed launch price" : "pool price";
  const footnote = launching
    ? `Your SKR goes into the $${meme.ticker} pool. Trading opens when all ${grouped(meme.supplyTotal)} sell.`
    : side === "buy"
      ? "Pool trades move the price. You'll see the exact amount in your wallet before you approve."
      : "Selling moves the pool price down. You'll see the exact SKR in your wallet before you approve.";

  return (
    <Modal transparent visible statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={close}>
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, dimStyle]}>
          <Pressable accessibilityLabel="Close" style={[StyleSheet.absoluteFill, { backgroundColor: feed.dim }]} onPress={close} />
        </Animated.View>

        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.sheet, { paddingBottom: 20 + insets.bottom }, sheetStyle]}>
            <View style={styles.handle} />

            <View style={styles.header}>
              <Image source={meme.imageUrl} style={styles.thumb} contentFit="cover" />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.title} numberOfLines={1}>
                  {verb} ${meme.ticker}
                </Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                  by @{meme.creator.handle} · {subtitle}
                </Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={styles.close}>
                <CloseIcon size={20} color={feed.text} />
              </Pressable>
            </View>

            {launching ? (
              <View style={styles.supply}>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.min(1, meme.supplySold / meme.supplyTotal) * 100}%` }]} />
                </View>
                <View style={styles.row}>
                  <Text style={styles.soldLabel}>
                    <Text style={styles.mono}>
                      {grouped(meme.supplySold)} / {grouped(meme.supplyTotal)}
                    </Text>{" "}
                    sold
                  </Text>
                  <Text style={styles.leftText}>Only {grouped(left)} left</Text>
                </View>
              </View>
            ) : (
              <View style={styles.supply}>
                <View style={styles.row}>
                  <Text style={styles.soldLabel}>Trading in pool</Text>
                  <Text style={[styles.mono, { fontSize: 14 }]}>{skr(priceEach)}</Text>
                </View>
              </View>
            )}

            <Text style={styles.label}>How many</Text>
            <View style={styles.stepper}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="One less"
                disabled={soldOut || quantity <= 1}
                onPress={() => set(quantity - 1)}
                style={[styles.step, (soldOut || quantity <= 1) && styles.disabled]}
              >
                <MinusIcon size={22} />
              </Pressable>
              <Text style={styles.quantity} accessibilityLiveRegion="polite">
                {soldOut ? 0 : grouped(quantity)}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="One more"
                disabled={soldOut || quantity >= max}
                onPress={() => set(quantity + 1)}
                style={[styles.step, (soldOut || quantity >= max) && styles.disabled]}
              >
                <PlusIcon size={22} />
              </Pressable>
            </View>

            <View style={styles.chips}>
              {[...CHIPS, "max" as const].map((chip) => {
                const value = chip === "max" ? max : Math.min(chip, max);
                const selected = !soldOut && (chip === "max" ? quantity === max : quantity === chip);
                return (
                  <Pressable
                    key={chip}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    disabled={soldOut}
                    onPress={() => set(value)}
                    style={[styles.chip, selected && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextOn]}>
                      {chip === "max" ? "Max" : chip}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.divider} />

            <View style={styles.summary}>
              <SummaryRow label="Price each" value={skr(priceEach)} />
              <SummaryRow label="Network fee" value={`≈ ${BASE_FEE_SOL} SOL`} />
              <SummaryRow
                label="Your SKR balance"
                value={
                  !wallet ? "Not connected" : balance.data == null ? "—" : `${formatSkr(balance.data)} SKR`
                }
              />
              <View style={[styles.row, { marginTop: 10 }]}>
                <Text style={styles.totalLabel}>{side === "sell" ? "You get" : "Total"}</Text>
                <Text style={styles.total}>
                  {launching ? "" : "≈ "}
                  {amount(total)} SKR
                </Text>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={soldOut}
              onPress={() =>
                onApprove({
                  memeId: meme.id,
                  ticker: meme.ticker,
                  side,
                  quantity,
                  priceEach,
                  total,
                })
              }
              style={({ pressed }) => [styles.approve, (pressed || soldOut) && { opacity: 0.85 }]}
            >
              <Text style={styles.approveText}>{soldOut ? "Sold out" : "Approve in wallet"}</Text>
            </Pressable>

            <Text style={styles.footnote}>{footnote}</Text>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: feed.sheet,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: feed.border,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: feed.borderStrong,
    marginBottom: 18,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  thumb: { width: 52, height: 52, borderRadius: 12, backgroundColor: feed.raised },
  title: { fontFamily: geist.semibold, fontSize: 20, lineHeight: 26, color: feed.text },
  subtitle: { fontFamily: geist.regular, fontSize: 13, lineHeight: 18, color: feed.textSecondary },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: feed.raised,
    alignItems: "center",
    justifyContent: "center",
  },
  supply: {
    marginTop: 18,
    backgroundColor: feed.raised,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  track: { height: 6, borderRadius: 3, backgroundColor: feed.border, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3, backgroundColor: feed.accent },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  soldLabel: { fontFamily: geist.regular, fontSize: 14, color: feed.textSecondary },
  mono: { fontFamily: geist.mono, color: feed.text },
  leftText: { fontFamily: geist.medium, fontSize: 14, color: feed.pinkText },
  label: {
    marginTop: 22,
    fontFamily: geist.medium,
    fontSize: 14,
    color: feed.textSecondary,
  },
  stepper: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  step: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: feed.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.4 },
  quantity: {
    flex: 1,
    textAlign: "center",
    fontFamily: geist.monoMedium,
    fontSize: 44,
    lineHeight: 52,
    color: feed.text,
  },
  chips: { marginTop: 14, flexDirection: "row", gap: 8 },
  chip: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: feed.borderStrong,
    backgroundColor: feed.raised,
    alignItems: "center",
    justifyContent: "center",
  },
  chipOn: { backgroundColor: feed.text, borderColor: feed.text },
  chipText: { fontFamily: geist.semibold, fontSize: 15, color: feed.text },
  chipTextOn: { color: feed.bg },
  divider: { marginTop: 18, height: 1, backgroundColor: feed.border },
  summary: { marginTop: 14, gap: 8 },
  rowLabel: { fontFamily: geist.regular, fontSize: 14, color: feed.textSecondary },
  rowValue: { fontFamily: geist.mono, fontSize: 14, color: feed.text },
  totalLabel: { fontFamily: geist.semibold, fontSize: 15, color: feed.text },
  total: { fontFamily: geist.monoMedium, fontSize: 22, color: feed.text },
  approve: {
    marginTop: 18,
    height: 56,
    borderRadius: 28,
    backgroundColor: feed.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  approveText: { fontFamily: geist.semibold, fontSize: 17, color: feed.text },
  footnote: {
    marginTop: 12,
    fontFamily: geist.regular,
    fontSize: 12,
    lineHeight: 17,
    color: feed.textMuted,
    textAlign: "center",
  },
});
