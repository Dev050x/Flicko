import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { Glass } from "@/components/ui/glass";
import { colors } from "@/theme";

const VISIBLE_MS = 2500;
const FADE_MS = 200;

/*
 * A short glass message near the top of the screen. `show` replaces any message still
 * showing; render `toast` last so it sits above the screen.
 */
export const useToast = (top = 0) => {
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useSharedValue(0);

  const show = useCallback(
    (text: string) => {
      setMessage(text);
      opacity.value = withSequence(
        withTiming(1, { duration: FADE_MS }),
        withDelay(
          VISIBLE_MS,
          withTiming(0, { duration: FADE_MS }, (done) => {
            if (done) runOnJS(setMessage)(null);
          }),
        ),
      );
    },
    [opacity],
  );

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const toast = message ? (
    <Animated.View
      pointerEvents="none"
      style={[styles.row, { top }, style]}
      accessibilityLiveRegion="polite"
    >
      <Glass style={styles.chip}>
        <Text style={styles.text}>{message}</Text>
      </Glass>
    </Animated.View>
  ) : null;

  return { toast, show };
};

const styles = StyleSheet.create({
  row: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  chip: {
    minHeight: 36,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 8,
    justifyContent: "center",
  },
  text: { fontFamily: "DMSans_500Medium", fontSize: 14, color: colors.text },
});
