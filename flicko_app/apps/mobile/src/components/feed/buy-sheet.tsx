import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { config } from "@/config";
import { useLaunchConfig } from "@/features/create/chain";
import { compactCount, grouped, price, skr } from "@/features/feed/format";
import {
  buyLimit,
  networkFeeSol,
  quoteTrade,
  skrNumber,
  TOKEN_UNIT,
  TradeProblem,
  useMemeState,
  useTokenAccountRent,
  useTokenHolding,
  useTrade,
  type TradeSide,
} from "@/features/feed/trade";
import type { Meme } from "@/features/feed/types";
import { formatSkr, useSkrBalance } from "@/features/wallet/skr-balance";
import { useSession } from "@/store/session";
import { feed, geist } from "@/theme";

import { MinusIcon, PlusIcon } from "./icons";
import { PillButton } from "./pill-button";

/*
 * Buy sheet (flicko_feed "Buy sheet" design) over the dimmed feed. The quote is live:
 * the Meme account is read from the chain every few seconds and priced with the SDK's
 * math, so the total is what the program will charge (launch prices climb along the
 * curve as tokens sell). Trading memes reuse the sheet for buy and sell at the pool.
 * Swipe down, the X, the dim or back closes it.
 */
export type { TradeSide };

const CHIPS = [1, 10, 50] as const;
const DEFAULT_QUANTITY = 10;
const CLOSE_DISTANCE = 120;
const CLOSE_VELOCITY = 900;

const clamp = (n: number, max: number) => Math.max(1, Math.min(Math.max(1, max), Math.round(n)));

/** big counts stay short: 742, 12,400, 1.2M */
const count = (n: number) => (n >= 1_000_000 ? compactCount(n) : grouped(n));

export function BuySheet({
  meme,
  side,
  onClose,
  onDone,
  onConnect,
}: {
  meme: Meme;
  side: TradeSide;
  onClose: () => void;
  /** after a confirmed trade, with a message for a toast */
  onDone: (message: string) => void;
  /** a guest pressed approve */
  onConnect: () => void;
}) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const wallet = useSession((s) => s.session?.wallet);
  const balance = useSkrBalance(wallet);
  const holding = useTokenHolding(wallet, meme.id);
  const rent = useTokenAccountRent();
  const launchConfig = useLaunchConfig();
  const state = useMemeState(meme.id);
  const fees = launchConfig.data
    ? { creatorFeeBps: launchConfig.data.creatorFeeBps, burnBps: launchConfig.data.burnBps }
    : undefined;
  const trade = useTrade(fees);
  const [problem, setProblem] = useState<string | null>(null);

  const chain = state.data;
  const launching = chain ? chain.phase === "launch" : meme.status === "launching";
  const sold = chain ? Number(chain.tokensSold / TOKEN_UNIT) : meme.supplySold;
  const total = chain ? Number(chain.saleSupply / TOKEN_UNIT) : meme.supplyTotal;
  const left = Math.max(0, total - sold);
  const skrUnits = balance.data != null ? BigInt(Math.floor(balance.data * 10 ** config.skrDecimals)) : 0n;
  const held = holding.data ? Number(holding.data.amount / TOKEN_UNIT) : 0;
  const max =
    side === "sell"
      ? held
      : launching
        ? left
        : chain && fees
          ? Math.max(1, buyLimit(chain, fees, skrUnits))
          : 1;

  const [quantity, setQuantity] = useState(DEFAULT_QUANTITY);
  // Keep the amount in range as the limits load or move.
  const shown = max < 1 ? 0 : clamp(quantity, max);
  const quote = chain && fees && shown > 0 ? quoteTrade(chain, fees, side, shown) : null;
  const totalSkr = quote ? skrNumber(quote.skr) : null;
  const priceEach = totalSkr != null && shown > 0 ? totalSkr / shown : meme.price;
  const fee = networkFeeSol(side === "buy" && holding.data && !holding.data.exists ? (rent.data ?? 0) : 0);

  const busy = trade.step !== "idle";
  const short =
    !wallet || !quote
      ? null
      : side === "buy"
        ? balance.data != null && quote.skr > skrUnits
          ? "Not enough SKR"
          : null
        : held < 1
          ? `No $${meme.ticker} to sell`
          : null;

  const set = (n: number) => {
    const next = clamp(n, max);
    if (next !== shown) Haptics.selectionAsync().catch(() => {});
    setQuantity(next);
    setProblem(null);
  };

  // Slide in, follow the finger down, close past a distance or a flick.
  const offset = useSharedValue(window.height);
  const dim = useSharedValue(0);
  useEffect(() => {
    offset.value = withSpring(0, { damping: 26, stiffness: 260, mass: 0.9 });
    dim.value = withTiming(1, { duration: 180 });
  }, [offset, dim]);

  const close = () => {
    if (busy) return;
    dim.value = withTiming(0, { duration: 160 });
    offset.value = withTiming(window.height, { duration: 200 }, (done) => {
      if (done) scheduleOnRN(onClose);
    });
  };

  const pan = Gesture.Pan()
    .enabled(!busy)
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

  const approve = async () => {
    if (!wallet) return onConnect();
    setProblem(null);
    try {
      const message = await trade.run(meme.id, meme.ticker, side, shown);
      if (message) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        onDone(message);
      }
    } catch (err) {
      setProblem(err instanceof TradeProblem ? err.message : "Something went wrong. Try again.");
    }
  };

  const verb = side === "buy" ? "Buy" : "Sell";
  const feePct = fees ? (fees.creatorFeeBps + fees.burnBps) / 100 : 2.5;
  const subtitle = launching ? "launch price" : "pool price";
  const footnote = launching
    ? `Your SKR goes into the $${meme.ticker} pool. Trading opens when all ${count(total)} sell.`
    : side === "buy"
      ? `Pool trades move the price. Includes the ${feePct}% trading fee.`
      : `Selling moves the pool price down. Includes the ${feePct}% trading fee.`;
  const label = !wallet
    ? "Connect wallet"
    : trade.step === "wallet"
      ? "Waiting for wallet…"
      : trade.step === "confirming"
        ? "Confirming…"
        : max < 1
          ? side === "sell"
            ? `No $${meme.ticker} to sell`
            : "Sold out"
          : (short ?? "Approve in wallet");
  const disabled = !!wallet && (busy || !quote || !!short || max < 1);
  const totalText = totalSkr == null ? "—" : `${price(totalSkr)} SKR`;

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
                  <View style={[styles.fill, { width: `${total > 0 ? Math.min(1, sold / total) * 100 : 0}%` }]} />
                </View>
                <View style={styles.row}>
                  <Text style={styles.soldLabel}>
                    <Text style={styles.mono}>
                      {count(sold)} / {count(total)}
                    </Text>{" "}
                    sold
                  </Text>
                  <Text style={styles.leftText}>Only {count(left)} left</Text>
                </View>
              </View>
            ) : (
              <View style={styles.supply}>
                <View style={styles.row}>
                  <Text style={styles.soldLabel}>
                    {side === "sell" ? "You hold" : "Trading in pool"}
                  </Text>
                  <Text style={[styles.mono, { fontSize: 14 }]}>
                    {side === "sell" ? `${count(held)} $${meme.ticker}` : `${skr(meme.price)} now`}
                  </Text>
                </View>
              </View>
            )}

            <Text style={styles.label}>How many</Text>
            <View style={styles.stepper}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="One less"
                disabled={busy || shown <= 1}
                onPress={() => set(shown - 1)}
                style={[styles.step, (busy || shown <= 1) && styles.disabled]}
              >
                <MinusIcon size={22} />
              </Pressable>
              <Text style={styles.quantity} numberOfLines={1} adjustsFontSizeToFit accessibilityLiveRegion="polite">
                {grouped(shown)}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="One more"
                disabled={busy || shown >= max}
                onPress={() => set(shown + 1)}
                style={[styles.step, (busy || shown >= max) && styles.disabled]}
              >
                <PlusIcon size={22} />
              </Pressable>
            </View>

            <View style={styles.chips}>
              {[...CHIPS, "max" as const].map((chip) => {
                const value = chip === "max" ? max : chip;
                const selected = shown > 0 && (chip === "max" ? shown === max : shown === chip);
                return (
                  <Pressable
                    key={chip}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    disabled={busy || max < 1}
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
              <SummaryRow label={side === "sell" ? "Average price" : "Price each"} value={`${price(priceEach)} SKR`} />
              <SummaryRow label="Network fee" value={`≈ ${fee < 0.001 ? fee : fee.toFixed(4)} SOL`} />
              <SummaryRow
                label="Your SKR balance"
                value={!wallet ? "Not connected" : balance.data == null ? "—" : `${formatSkr(balance.data)} SKR`}
              />
              <View style={[styles.row, { marginTop: 10 }]}>
                <Text style={styles.totalLabel}>{side === "sell" ? "You get" : "Total"}</Text>
                {state.isLoading ? (
                  <ActivityIndicator color={feed.textSecondary} />
                ) : (
                  <Text style={styles.total}>{totalText}</Text>
                )}
              </View>
            </View>

            <PillButton
              kind="accent"
              label={label}
              disabled={disabled}
              onPress={approve}
              height={56}
              style={styles.approve}
            >
              {busy && <ActivityIndicator color={feed.text} style={{ marginRight: 10 }} />}
              <Text style={styles.approveText}>{label}</Text>
            </PillButton>

            <Text style={[styles.footnote, problem && { color: feed.pinkText }]}>{problem ?? footnote}</Text>
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
  approve: { marginTop: 18 },

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
