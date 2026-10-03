import { BlurView } from "expo-blur";
import type { ReactNode } from "react";
import { Platform, StyleSheet, View, type ViewStyle } from "react-native";

import { cam } from "@/theme";

/*
 * Glass surface for controls floating over the camera: 40% ink, hairline white border,
 * a light blur behind it on iOS. Android's blur can't sample the camera surface, so it
 * keeps the plain tint (which is what the blur sits under anyway). No shadow.
 */
export function Glass({
  style,
  children,
}: {
  style?: ViewStyle | ViewStyle[];
  children?: ReactNode;
}) {
  return (
    <View style={[styles.glass, style]}>
      {Platform.OS === "ios" && (
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  glass: {
    backgroundColor: cam.glass,
    borderWidth: 1,
    borderColor: cam.glassBorder,
    overflow: "hidden",
  },
});
