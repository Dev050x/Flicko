import { useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Easing, useSharedValue, withTiming } from "react-native-reanimated";

import { IntroScene, TIMELINE } from "@/components/intro/intro";

/*
 * Dev preview of the intro: the keyframes frozen like the design board, plus a replay of
 * the whole intro at a chosen speed. Open from the home screen in development builds.
 */
const FRAMES = [
  { label: "1 · Focus", at: TIMELINE.pull },
  { label: "2 · Snap", at: TIMELINE.flashPeak },
  { label: "3 · Trade", at: TIMELINE.assembled },
  { label: "4 · Reveal", at: TIMELINE.end },
];

/*
 * The trade step assembling, then the reveal halfway through the lift.
 */
const ASSEMBLY = [
  { label: "Tile springs in", at: TIMELINE.stem },
  { label: "Stem draws up", at: TIMELINE.crossbar },
  { label: "Crossbar", at: TIMELINE.head },
  { label: "Lifting", at: TIMELINE.reveal + 300 },
];

const SPEEDS = [1, 0.5, 0.25];

export default function IntroFrames() {
  const { width } = useWindowDimensions();
  const card = (width - 16 * 3) / 2;

  return (
    <ScrollView
      className="flex-1 bg-mist"
      contentContainerClassName="gap-6 p-4 pt-14"
    >
      <Replay width={width - 32} />
      <View className="flex-row flex-wrap gap-4">
        {FRAMES.map((frame) => (
          <Frame key={frame.label} {...frame} width={card} />
        ))}
      </View>
      <View className="flex-row flex-wrap gap-4">
        {ASSEMBLY.map((frame) => (
          <Frame key={frame.label} {...frame} width={card} />
        ))}
      </View>
    </ScrollView>
  );
}

/*
 * Replays the intro from the start on every tap.
 */
function Replay({ width }: { width: number }) {
  const clock = useSharedValue<number>(TIMELINE.pull);
  const [speed, setSpeed] = useState(0.5);

  const play = () => {
    clock.value = 0;
    clock.value = withTiming(TIMELINE.end, {
      duration: TIMELINE.end / speed,
      easing: Easing.linear,
    });
  };

  return (
    <View className="gap-3">
      <Pressable onPress={play}>
        <View
          className="overflow-hidden rounded-3xl bg-ink"
          style={{ width, height: width * 1.6 }}
        >
          <IntroScene clock={clock} width={width} />
        </View>
      </Pressable>
      <View className="flex-row items-center gap-2">
        <Text className="font-bold text-ink">Intro · tap to play</Text>
        <View className="flex-1" />
        {SPEEDS.map((value) => (
          <Pressable
            key={value}
            onPress={() => setSpeed(value)}
            className={`rounded-full px-3 py-1 ${speed === value ? "bg-ink" : "bg-white"}`}
          >
            <Text
              className={`font-medium ${speed === value ? "text-white" : "text-ink"}`}
            >
              {value}x
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Frame({
  label,
  at,
  width,
}: {
  label: string;
  at: number;
  width: number;
}) {
  const clock = useSharedValue<number>(at);
  return (
    <View className="gap-2">
      <View
        className="overflow-hidden rounded-3xl bg-ink"
        style={{ width, height: width * (536 / 240) }}
      >
        <IntroScene clock={clock} width={width} />
      </View>
      <Text className="font-bold text-ink">{label}</Text>
    </View>
  );
}
