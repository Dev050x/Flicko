import type { ReactNode } from "react";
import { Pressable, StyleSheet, type ViewStyle } from "react-native";

import { Glass } from "@/components/ui/glass";

/*
 * 40dp glass circle for controls over a photo (✕, Save, the quick-edit rail). With a
 * `style` it floats (absolute), e.g. { top, left }.
 */
export function GlassButton({
  label,
  style,
  onPress,
  children,
}: {
  label: string;
  style?: ViewStyle;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={style ? [styles.floating, style] : undefined}
    >
      <Glass style={styles.circle}>{children}</Glass>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  floating: { position: "absolute" },
  circle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
