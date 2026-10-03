import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

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
  const toValue = (x: number) =>
    Math.round(Math.max(-100, Math.min(100, ((x / width) * 2 - 1) * 100)));

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(1)
    .onStart((e) => width && onChange(toValue(e.x)))
    .onUpdate((e) => width && onChange(toValue(e.x)))
    .onEnd(onEnd);
  const reset = Gesture.Tap()
    .runOnJS(true)
    .numberOfTaps(2)
    .onEnd(() => {
      onChange(0);
      onEnd();
    });

  const centre = width / 2;
  const thumb = centre + (value / 100) * (width / 2 - THUMB / 2);

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.labels}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value > 0 ? `+${value}` : value}</Text>
      </View>
      <GestureDetector gesture={Gesture.Simultaneous(reset, pan)}>
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
          <View style={[styles.tick, { left: centre - 1 }]} />
          <View
            style={[
              styles.fill,
              { left: Math.min(centre, thumb), width: Math.abs(thumb - centre) },
            ]}
          />
          <View style={[styles.thumb, { left: thumb - THUMB / 2 }]} />
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
