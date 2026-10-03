import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, TextButton } from "@/components/ui/button";
import { Glass } from "@/components/ui/glass";
import { filterById } from "@/features/filters/catalog";
import { colors, radius, ref } from "@/theme";

/*
 * Where a snap lands: { photoUri, width, height, filterId, notice? }. The photo is the
 * whole camera preview. `notice` is a short toast from the camera (e.g. no face found).
 * Placeholder until the caption and launch steps are built.
 */
const TOAST_MS = 3000;

export default function CreatePreview() {
  const insets = useSafeAreaInsets();
  const { photoUri, width, height, filterId, notice } = useLocalSearchParams<{
    photoUri: string;
    width?: string;
    height?: string;
    filterId?: string;
    notice?: string;
  }>();
  const ratio = Number(width) / Number(height) || 9 / 16;
  const filter = filterById(filterId);

  const toast = useSharedValue(notice ? 1 : 0);
  useEffect(() => {
    if (notice) toast.value = withDelay(TOAST_MS, withTiming(0, { duration: 200 }));
  }, [notice, toast]);
  const toastStyle = useAnimatedStyle(() => ({ opacity: toast.value }));

  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <View style={styles.photoWrap}>
        <Image
          source={{ uri: photoUri }}
          style={[styles.photo, { aspectRatio: ratio }]}
          contentFit="contain"
          accessibilityLabel="Your photo"
        />
        {notice && (
          <Animated.View
            pointerEvents="none"
            style={[styles.toast, toastStyle]}
            accessibilityLiveRegion="polite"
          >
            <Glass style={styles.toastChip}>
              <Text style={styles.toastText}>{notice}</Text>
            </Glass>
          </Animated.View>
        )}
      </View>
      <Text style={styles.meta}>
        {filter.type === "none" ? "No filter" : filter.name}
      </Text>
      <View style={styles.actions}>
        <Button label="Next" disabled onPress={() => {}} />
        <TextButton label="Retake" onPress={() => router.back()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24 },
  photoWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  photo: { height: "100%", maxWidth: "100%", borderRadius: radius.lg },
  toast: { position: "absolute", top: 16, left: 0, right: 0, alignItems: "center" },
  toastChip: {
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  toastText: { fontFamily: "DMSans_500Medium", fontSize: 13, color: colors.text },
  meta: {
    marginTop: 16,
    textAlign: "center",
    fontFamily: "DMSans_500Medium",
    fontSize: 14,
    color: ref.textSoft,
  },
  actions: { marginTop: 16, gap: 4 },
});
