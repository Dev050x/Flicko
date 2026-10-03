import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { usePriceHistory } from "@/features/feed/api";
import { ago, duration, pct, skr } from "@/features/feed/format";
import { useFeedStore } from "@/features/feed/store";
import type { Meme } from "@/features/feed/types";
import { feed, geist } from "@/theme";

import { Sparkline } from "./sparkline";

/*
 * The see-through info card at the bottom of a feed page: creator + follow, ticker and
 * price, launch progress (or pool price line once trading), and the buy/sell buttons.
 */
export function StatusCard({
  meme,
  active,
  onBuy,
  onSell,
}: {
  meme: Meme;
  active: boolean;
  onBuy: () => void;
  onSell: () => void;
}) {
  const toggleFollow = useFeedStore((s) => s.toggleFollow);
  const launching = meme.status === "launching";
  const change = meme.changeSinceLaunchPct ?? 0;
  const soldPct = meme.supplyTotal > 0 ? Math.floor((meme.supplySold / meme.supplyTotal) * 100) : 0;
  const { creator } = meme;
  const history = usePriceHistory(meme.id, !launching && active);
  const points = history.data ?? meme.priceHistory;

  return (
    <View style={styles.card}>
      <View style={styles.creator}>
        <View style={styles.avatarRing}>
          <Image source={creator.avatarUrl} style={styles.avatar} contentFit="cover" />
        </View>
        <Text style={styles.handle} numberOfLines={1}>
          @{creator.handle}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${creator.isFollowing ? "Unfollow" : "Follow"} @${creator.handle}`}
          onPress={() => toggleFollow(creator.wallet)}
          hitSlop={10}
          style={[styles.follow, creator.isFollowing && styles.following]}
        >
          <Text style={[styles.followText, creator.isFollowing && { color: feed.textSecondary }]}>
            {creator.isFollowing ? "Following" : "Follow"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.headline}>
        <View style={styles.side}>
          <Text style={styles.ticker} numberOfLines={1}>
            ${meme.ticker}
          </Text>
          <Text style={styles.small} numberOfLines={1}>
            {launching
              ? `Launched ${ago(meme.createdAt)}`
              : `Sold out in ${duration(meme.soldOutDurationMin ?? 0)}`}
          </Text>
        </View>
        <View style={[styles.side, { alignItems: "flex-end" }]}>
          <Text style={styles.price} numberOfLines={1}>
            {skr(meme.price)}
          </Text>
          {launching ? (
            <Text style={styles.small}>price now</Text>
          ) : (
            <Text style={[styles.change, { color: change >= 0 ? feed.lime : feed.textSecondary }]}>
              {pct(change)} since launch
            </Text>
          )}
        </View>
      </View>

      <View style={styles.progressRow}>
        <View style={styles.status}>
          {launching && <PulseDot active={active} />}
          <Text style={styles.statusText}>
            {launching ? `Launching · ${soldPct}% sold` : "Trading in pool"}
          </Text>
        </View>
        <Text style={styles.small}>
          {launching ? "Pool opens at 100%" : "Creator earns 2% of trades"}
        </Text>
      </View>
      {launching ? (
        <SupplyBar sold={meme.supplySold} total={meme.supplyTotal} height={4} />
      ) : points && points.length > 1 ? (
        <SparklineRow values={points} />
      ) : (
        <View style={styles.sparkline} />
      )}

      {launching ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Buy $${meme.ticker} at ${skr(meme.price)}`}
          onPress={onBuy}
          style={({ pressed }) => [styles.cta, styles.buy, pressed && styles.pressed]}
        >
          <Text style={styles.ctaText}>Buy ${meme.ticker}</Text>
        </Pressable>
      ) : (
        <View style={styles.ctaRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Buy $${meme.ticker}`}
            onPress={onBuy}
            style={({ pressed }) => [styles.cta, styles.buy, styles.half, pressed && styles.pressed]}
          >
            <Text style={styles.ctaText}>Buy</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Sell $${meme.ticker}`}
            onPress={onSell}
            style={({ pressed }) => [styles.cta, styles.sell, styles.half, pressed && styles.pressed]}
          >
            <Text style={styles.ctaText}>Sell</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function SparklineRow({ values }: { values: number[] }) {
  const [width, setWidth] = useState(0);
  return (
    <View style={styles.sparkline} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && <Sparkline values={values} width={width} height={28} />}
    </View>
  );
}

export function SupplyBar({ sold, total, height }: { sold: number; total: number; height: number }) {
  const fill = total > 0 ? Math.min(1, sold / total) : 0;
  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]}>
      <View style={[styles.fill, { width: `${fill * 100}%`, borderRadius: height / 2 }]} />
    </View>
  );
}

function PulseDot({ active }: { active: boolean }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (active) {
      pulse.value = withRepeat(withTiming(0.35, { duration: 800 }), -1, true);
    } else {
      cancelAnimation(pulse);
      pulse.value = 1;
    }
  }, [active, pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Animated.View style={[styles.dot, style]} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(11,11,15,0.38)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 20,
    padding: 14,
    gap: 10,
  },
  creator: { flexDirection: "row", alignItems: "center", gap: 8 },
  avatarRing: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: feed.accent,
    overflow: "hidden",
  },
  avatar: { flex: 1 },
  handle: { flexShrink: 1, fontFamily: geist.semibold, fontSize: 14, color: feed.text },
  follow: {
    height: 26,
    paddingHorizontal: 11,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  following: { backgroundColor: "rgba(31,29,38,0.7)", borderColor: feed.borderStrong },
  followText: { fontFamily: geist.semibold, fontSize: 12, color: feed.text },
  headline: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  side: { flexShrink: 1, gap: 2 },
  ticker: { fontFamily: geist.semibold, fontSize: 24, lineHeight: 30, color: feed.text },
  price: { fontFamily: geist.monoMedium, fontSize: 18, lineHeight: 30, color: feed.text },
  small: { fontFamily: geist.regular, fontSize: 12, lineHeight: 16, color: feed.textSecondary },
  change: { fontFamily: geist.mono, fontSize: 12, lineHeight: 16 },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  status: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: feed.lime },
  statusText: { fontFamily: geist.medium, fontSize: 12, lineHeight: 16, color: feed.text },
  track: { backgroundColor: "rgba(255,255,255,0.18)", overflow: "hidden", marginTop: -2 },
  fill: { height: "100%", backgroundColor: feed.text },
  sparkline: { height: 28, overflow: "hidden" },
  ctaRow: { flexDirection: "row", gap: 10 },
  cta: {
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    marginTop: 4,
  },
  half: { flex: 1 },
  buy: { backgroundColor: feed.accent },
  sell: { borderWidth: 1.5, borderColor: feed.text },
  pressed: { opacity: 0.85 },
  ctaText: { fontFamily: geist.semibold, fontSize: 15, color: feed.text },
});
