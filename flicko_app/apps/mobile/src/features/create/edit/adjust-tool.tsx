import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { colors, ref } from "@/theme";

import { type AdjustKey, useCreateStore } from "../store";
import { Chip, panel } from "./controls";

/*
 * Adjust: Light / Color / Detail tabs of sliders from -100 to +100. The fill grows from
 * the centre toward the thumb; double-tap a slider to reset it; Reset clears the tab.
 */
const TABS: { name: string; keys: { key: AdjustKey; label: string }[] }[] = [
  {
    name: "Light",
    keys: [
      { key: "brightness", label: "Brightness" },
      { key: "contrast", label: "Contrast" },
      { key: "shadows", label: "Shadows" },
      { key: "highlights", label: "Highlights" },
    ],
  },
  {
    name: "Color",
    keys: [
      { key: "saturation", label: "Saturation" },
      { key: "warmth", label: "Warmth" },
      { key: "tint", label: "Tint" },
    ],
  },
  {
    name: "Detail",
    keys: [
      { key: "sharpness", label: "Sharpness" },
      { key: "vignette", label: "Vignette" },
    ],
  },
];

export function AdjustTool() {
  const [tab, setTab] = useState(0);
  const adjust = useCreateStore((s) => s.edits.adjust);
  const change = useCreateStore((s) => s.change);
  const commit = useCreateStore((s) => s.commit);

  const set = (key: AdjustKey, value: number) =>
    change((e) => ({ ...e, adjust: { ...e.adjust, [key]: value } }));

  const resetTab = () => {
    change((e) => ({
      ...e,
      adjust: {
        ...e.adjust,
        ...Object.fromEntries(TABS[tab].keys.map(({ key }) => [key, 0])),
      },
    }));
    commit();
  };

  return (
    <View style={panel.wrap}>
      <View style={panel.row}>
        {TABS.map((t, i) => (
          <Chip key={t.name} label={t.name} selected={i === tab} onPress={() => setTab(i)} />
        ))}
        <View style={{ flex: 1 }} />
        <Pressable accessibilityRole="button" onPress={resetTab} hitSlop={8}>
          <Text style={panel.text}>Reset</Text>
        </Pressable>
      </View>
      <View style={{ gap: 18 }}>
        {TABS[tab].keys.map(({ key, label }) => (
          <Slider
            key={key}
            label={label}
            value={adjust[key]}
            onChange={(v) => set(key, v)}
            onEnd={commit}
          />
        ))}
      </View>
    </View>
  );
}

const THUMB = 20;

/*
 * The thumb and fill move on the UI thread; the store (and so the photo) only hears
 * about whole-number changes.
 */
function Slider({
  label,
  value,
  onChange,
  onEnd,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  onEnd: () => void;
}) {
  const [width, setWidth] = useState(0);
  const position = useSharedValue(value);
  const dragging = useSharedValue(false);
  const handlers = useRef({ onChange, onEnd });
  handlers.current = { onChange, onEnd };

  // Undo, Reset and double-tap move the thumb from outside.
  useEffect(() => {
    if (!dragging.value) position.value = value;
  }, [value, position, dragging]);

  const gesture = useMemo(() => {
    const emit = (v: number) => handlers.current.onChange(v);
    const end = () => handlers.current.onEnd();
    const reset = () => {
      handlers.current.onChange(0);
      handlers.current.onEnd();
    };
    const pan = Gesture.Pan()
      .minDistance(1)
      .onStart(() => {
        dragging.value = true;
      })
      .onUpdate((e) => {
        if (width <= 0) return;
        const next = Math.round(Math.max(-100, Math.min(100, ((e.x / width) * 2 - 1) * 100)));
        if (next !== position.value) {
          position.value = next;
          scheduleOnRN(emit, next);
        }
      })
      .onEnd(() => scheduleOnRN(end))
      .onFinalize(() => {
        dragging.value = false;
      });
    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .onEnd(() => {
        position.value = 0;
        scheduleOnRN(reset);
      });
    return Gesture.Simultaneous(doubleTap, pan);
  }, [width, position, dragging]);

  const half = width / 2;
  const fillStyle = useAnimatedStyle(() => {
    const thumb = half + (position.value / 100) * (half - THUMB / 2);
    return { left: Math.min(half, thumb), width: Math.abs(thumb - half) };
  });
  const thumbStyle = useAnimatedStyle(() => ({
    left: half + (position.value / 100) * (half - THUMB / 2) - THUMB / 2,
  }));

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.labels}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value > 0 ? `+${value}` : value}</Text>
      </View>
      <GestureDetector gesture={gesture}>
        <View
          style={styles.track}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ min: -100, max: 100, now: value }}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(e) => {
            const step = e.nativeEvent.actionName === "increment" ? 10 : -10;
            onChange(Math.max(-100, Math.min(100, value + step)));
            onEnd();
          }}
        >
          <View style={styles.rail} />
          <View style={[styles.tick, { left: half - 1 }]} />
          <Animated.View style={[styles.fill, fillStyle]} />
          <Animated.View style={[styles.thumb, thumbStyle]} />
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  labels: { flexDirection: "row", justifyContent: "space-between" },
  label: { fontFamily: "DMSans_500Medium", fontSize: 13, color: colors.text },
  value: { fontFamily: "DMSans_400Regular", fontSize: 13, color: colors.textMuted },
  track: { height: THUMB, justifyContent: "center" },
  rail: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 8,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  tick: {
    position: "absolute",
    top: 4,
    width: 2,
    height: 12,
    backgroundColor: ref.lineDashed,
  },
  fill: {
    position: "absolute",
    top: 8,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.text,
  },
  thumb: {
    position: "absolute",
    top: 0,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.text,
  },
});
