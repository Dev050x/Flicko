import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { motion } from "@/theme";
import { canBump, MemeTile } from "./meme-tile";
import { wallItems, type WallItem } from "./wall-data";

/*
 * Tile heights cycle so the columns never line up (dp at the 412dp reference width).
 */
const HEIGHTS = [150, 120, 170, 140, 175, 130];
const GAP = 10;
const COLUMNS = 3;

const shuffle = <T,>(items: T[]) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
};

interface Placed extends WallItem {
  height: number;
}

/*
 * The decorative login wall: three columns of meme tiles scrolling forever (the middle
 * one upwards against the others), with a cosmetic price tick every 2.4s. Paused when
 * the screen is unfocused or the app is backgrounded; static with Reduce Motion.
 */
export function MemeWall({ width, height }: { width: number; height: number }) {
  const reduceMotion = useReducedMotion();
  const scale = width / 412;
  const columnWidth = (width - GAP * (COLUMNS + 1)) / COLUMNS;

  const columns = useMemo(() => {
    const cols: Placed[][] = [[], [], []];
    shuffle(wallItems).forEach((item, i) => {
      cols[i % COLUMNS]!.push({
        ...item,
        height: HEIGHTS[i % HEIGHTS.length]! * scale,
      });
    });
    return cols;
  }, [scale]);

  const [bumps, setBumps] = useState<Record<string, number>>({});
  const [focused, setFocused] = useState(true);
  const [active, setActive] = useState(AppState.currentState === "active");
  const running = focused && active && !reduceMotion;

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) =>
      setActive(state === "active"),
    );
    return () => sub.remove();
  }, []);

  /*
   * Cosmetic only: bumps a random rising tag so the wall feels alive.
   */
  useEffect(() => {
    if (!running) return;
    const risers = wallItems.filter((item) => canBump(item.change));
    const timer = setInterval(() => {
      const pick = risers[Math.floor(Math.random() * risers.length)];
      if (pick) setBumps((b) => ({ ...b, [pick.id]: (b[pick.id] ?? 0) + 1 }));
    }, motion.wallTickMs);
    return () => clearInterval(timer);
  }, [running]);

  return (
    <View
      accessible
      accessibilityLabel="Examples of memes on Flicko"
      importantForAccessibility="yes"
      style={{
        width,
        height,
        overflow: "hidden",
        flexDirection: "row",
        paddingHorizontal: GAP,
        gap: GAP,
      }}
    >
      {columns.map((items, i) => (
        <Column
          key={i}
          items={items}
          width={columnWidth}
          bumps={bumps}
          duration={motion.wallColumnLoopMs[i]!}
          reverse={i === 1}
          running={running}
          still={reduceMotion}
        />
      ))}
    </View>
  );
}

/*
 * One column: its list rendered twice, translated by one list height and looped.
 */
function Column({
  items,
  width,
  bumps,
  duration,
  reverse,
  running,
  still,
}: {
  items: Placed[];
  width: number;
  bumps: Record<string, number>;
  duration: number;
  reverse: boolean;
  running: boolean;
  still: boolean;
}) {
  const listHeight = items.reduce((sum, item) => sum + item.height + GAP, 0);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!running) {
      cancelAnimation(progress);
      return;
    }
    loop(progress, duration);
    return () => cancelAnimation(progress);
  }, [running, duration, progress]);

  const style = useAnimatedStyle(() => {
    const p = reverse ? 1 - progress.value : progress.value;
    return { transform: [{ translateY: -listHeight * p }] };
  });

  const copies = still ? [0] : [0, 1];
  return (
    <View
      style={{ width, overflow: "hidden" }}
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[{ gap: GAP, paddingTop: GAP }, style]}>
        {copies.flatMap((copy) =>
          items.map((item) => (
            <MemeTile
              key={`${copy}-${item.id}`}
              image={item.image}
              change={item.change}
              bumps={bumps[item.id] ?? 0}
              width={width}
              height={item.height}
            />
          )),
        )}
      </Animated.View>
    </View>
  );
}

/*
 * Continues from the current position to the end, then repeats the full loop forever.
 */
const loop = (progress: SharedValue<number>, duration: number) => {
  const linear = { easing: Easing.linear };
  progress.value = withSequence(
    withTiming(1, { ...linear, duration: (1 - progress.value) * duration }),
    withTiming(0, { duration: 0 }),
    withRepeat(withTiming(1, { ...linear, duration }), -1, false),
  );
};
