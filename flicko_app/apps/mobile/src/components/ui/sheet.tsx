import { useEffect, type ReactNode } from "react";
import { BackHandler, Pressable, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, motion, radius, ref } from "@/theme";

/*
 * Bottom sheet over a dimmed screen: `scrim`, sheet surface, 28dp top corners, 40x5
 * handle. Slides up with the theme's sheet spring (`still` opens it in place, for
 * previews); Android back and a scrim tap close it.
 */
export function Sheet({
  height,
  onClose,
  children,
  still = false,
}: {
  height: number;
  onClose: () => void;
  children: ReactNode;
  still?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const total = height + insets.bottom;
  const offset = useSharedValue(still ? 0 : total);
  const scrim = useSharedValue(still ? 1 : 0);

  useEffect(() => {
    offset.value = withSpring(0, motion.sheet);
    scrim.value = withTiming(1, { duration: 180 });
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
    // Animates in once; onClose is read when back is pressed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
  }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }));

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, scrimStyle]}>
        <Pressable
          accessibilityLabel="Close"
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}
          onPress={onClose}
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          { height: total, paddingBottom: 30 + insets.bottom },
          sheetStyle,
        ]}
      >
        <View style={styles.handle} />
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: ref.sheet,
    borderTopWidth: 1,
    borderColor: ref.line,
    paddingTop: 12,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 16,
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.borderStrong,
  },
});
