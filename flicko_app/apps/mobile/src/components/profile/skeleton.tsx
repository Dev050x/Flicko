import { useEffect } from "react";
import {
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { profile } from "@/theme";

/* A pulsing placeholder block for first loads. */
export function Bone({
  width,
  height,
  radius = 8,
  style,
}: {
  width: DimensionValue;
  height: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const pulse = useSharedValue(0.5);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
  }, [pulse]);
  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: profile.line },
        animated,
        style,
      ]}
    />
  );
}
