import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { usePriceHistory } from "@/features/feed/api";
import { pct, skr, supplyCount } from "@/features/feed/format";
import type { Meme } from "@/features/feed/types";
import { feed, geist } from "@/theme";

import { Sparkline } from "./sparkline";

/*
 * The see-through status card under the ticker (flicko_feed design). Launching: pulsing
 * lime dot, price, the price line once there are trades, 8dp pink progress bar,
 * sold / left. Trading: pool price, change since launch and a 130x44 sparkline.
 */
export function StatusCard({ meme, active }: { meme: Meme; active: boolean }) {
  return (
    <View style={styles.card}>
      {meme.status === "launching" ? (
        <Launching meme={meme} active={active} />
      ) : (
        <Trading meme={meme} active={active} />
      )}
    </View>
  );
}

function Launching({ meme, active }: { meme: Meme; active: boolean }) {
  const history = usePriceHistory(meme.id, meme.launchPrice, active);
  const [chartWidth, setChartWidth] = useState(0);
  const left = Math.max(0, meme.supplyTotal - meme.supplySold);
  const fill = meme.supplyTotal > 0 ? Math.min(1, meme.supplySold / meme.supplyTotal) : 0;
  return (
    <>
      <View style={styles.row}>
        <View style={styles.status}>
          <PulseDot active={active} />
          <Text style={[styles.statusText, { color: feed.lime }]}>Launching</Text>
        </View>
        <Text style={styles.price}>{skr(meme.price)}</Text>
      </View>
      {history.data && history.data.length > 1 && (
        <View style={styles.chart} onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}>
          {chartWidth > 0 && <Sparkline values={history.data} width={chartWidth} height={32} />}
        </View>
      )}
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${fill * 100}%` }]} />
      </View>
      <View style={styles.row}>
        <Text style={styles.sold}>
          <Text style={styles.soldNumbers}>
            {supplyCount(meme.supplySold)} / {supplyCount(meme.supplyTotal)}
          </Text>{" "}
          sold
        </Text>
        <Text style={styles.left}>{supplyCount(left)} left</Text>
      </View>
    </>
  );
}

function Trading({ meme, active }: { meme: Meme; active: boolean }) {
  const history = usePriceHistory(meme.id, meme.launchPrice, active);
  const change = meme.changeSinceLaunchPct ?? 0;
  return (
    <>
      <View style={styles.row}>
        <Text style={[styles.statusText, { color: feed.textSecondary }]}>Trading in pool</Text>
        <Text style={styles.earns}>Creator earns 2% of trades</Text>
      </View>
      <View style={[styles.row, { alignItems: "flex-end" }]}>
        <View style={{ gap: 4, flexShrink: 1 }}>
          <Text style={styles.poolPrice} numberOfLines={1} adjustsFontSizeToFit>
            {skr(meme.price)}
          </Text>
          <Text style={[styles.change, { color: change >= 0 ? feed.lime : feed.textSecondary }]}>
            {pct(change)} since launch
          </Text>
        </View>
        <View style={styles.spark}>
          {history.data && history.data.length > 1 && <Sparkline values={history.data} />}
        </View>
      </View>
    </>
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
    backgroundColor: "rgba(23,22,29,0.78)",
    borderWidth: 1,
    borderColor: feed.border,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  status: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: feed.lime },
  statusText: { fontFamily: geist.medium, fontSize: 13, lineHeight: 18 },
  price: { fontFamily: geist.mono, fontSize: 15, lineHeight: 20, color: feed.text },
  chart: { height: 32 },
  track: { height: 8, borderRadius: 4, backgroundColor: feed.border, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4, backgroundColor: feed.accent },
  sold: { fontFamily: geist.regular, fontSize: 13, lineHeight: 18, color: feed.textSecondary },
  soldNumbers: { fontFamily: geist.mono, color: feed.text },
  left: { fontFamily: geist.medium, fontSize: 13, lineHeight: 18, color: feed.pinkText },
  earns: { fontFamily: geist.regular, fontSize: 12, lineHeight: 16, color: feed.textSecondary },
  poolPrice: { fontFamily: geist.monoMedium, fontSize: 24, lineHeight: 30, color: feed.text },
  change: { fontFamily: geist.mono, fontSize: 13, lineHeight: 17 },
  spark: { width: 130, height: 44 },
});
