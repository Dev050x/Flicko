import { Image } from "expo-image";
import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { colors, radius } from "@/theme";

/*
 * Price tags: "+4,206%" style percentages, "+3.2x" multiples, or "NEW". `bumps` nudges a
 * positive value up for the cosmetic FOMO tick.
 */
const TAG = /^([+-])([\d,]+(?:\.\d+)?)(%|x)$/;

export const tagLabel = (change: string, bumps: number) => {
  const match = TAG.exec(change);
  if (!match) return { text: change, color: colors.text };
  const [, sign, digits, unit] = match;
  const value = Number(digits!.replace(/,/g, ""));
  if (sign === "-") return { text: `▼ ${digits}${unit}`, color: colors.loss };
  const step = unit === "x" ? 0.1 : Math.max(1, Math.round(value * 0.025));
  const next = value + step * bumps;
  const text =
    unit === "x"
      ? `+${next.toFixed(1)}x`
      : `+${Math.round(next).toLocaleString("en-US")}%`;
  return { text, color: colors.gain };
};

export const canBump = (change: string) => TAG.exec(change)?.[1] === "+";

/*
 * One wall tile: the meme photo with its price chip bottom-left. The chip rolls up
 * (200ms) whenever its value changes.
 */
export function MemeTile({
  image,
  change,
  bumps,
  width,
  height,
}: {
  image: number;
  change: string;
  bumps: number;
  width: number;
  height: number;
}) {
  const { text, color } = tagLabel(change, bumps);
  const roll = useSharedValue(0);

  useEffect(() => {
    if (bumps === 0) return;
    roll.value = 1;
    roll.value = withTiming(0, { duration: 200 });
  }, [bumps, roll]);

  const rollStyle = useAnimatedStyle(() => ({
    opacity: 1 - roll.value,
    transform: [{ translateY: roll.value * 10 }],
  }));

  return (
    <View
      style={{
        width,
        height,
        borderRadius: radius.md,
        overflow: "hidden",
        backgroundColor: colors.surface,
      }}
    >
      <Image
        source={image}
        contentFit="cover"
        style={{ width, height }}
        accessible={false}
        transition={0}
      />
      <View
        style={{
          position: "absolute",
          left: 8,
          bottom: 8,
          height: 24,
          paddingHorizontal: 9,
          borderRadius: radius.pill,
          backgroundColor: colors.bg,
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <Animated.View style={rollStyle}>
          <Text
            style={{
              fontFamily: "DMSans_500Medium",
              fontSize: 11.5,
              color,
              includeFontPadding: false,
            }}
          >
            {text}
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}
