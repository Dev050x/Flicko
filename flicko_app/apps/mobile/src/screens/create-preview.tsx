import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, TextButton } from "@/components/ui/button";
import { ASPECT_RATIO, type Aspect } from "@/features/camera/settings";
import { filterById } from "@/features/filters/catalog";
import { colors, radius, ref } from "@/theme";

/*
 * Where a snap lands: { photoUri, filterId, aspect }. Placeholder until the caption and
 * launch steps are built.
 */
export default function CreatePreview() {
  const insets = useSafeAreaInsets();
  const { photoUri, filterId, aspect } = useLocalSearchParams<{
    photoUri: string;
    filterId?: string;
    aspect?: Aspect;
  }>();
  const ratio = ASPECT_RATIO[aspect ?? "4:5"] ?? ASPECT_RATIO["4:5"];
  const filter = filterById(filterId);

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
          contentFit="cover"
          accessibilityLabel="Your photo"
        />
      </View>
      <Text style={styles.meta}>
        {filter.type === "none" ? "No filter" : filter.name} · {aspect ?? "4:5"}
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
  photo: { width: "100%", maxHeight: "100%", borderRadius: radius.lg },
  meta: {
    marginTop: 16,
    textAlign: "center",
    fontFamily: "DMSans_500Medium",
    fontSize: 14,
    color: ref.textSoft,
  },
  actions: { marginTop: 16, gap: 4 },
});
