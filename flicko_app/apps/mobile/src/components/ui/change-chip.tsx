import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { mono } from "@/theme";
import { CHIP_BORDER, changeStyle } from "@/theme/priceChange";

/* A % change chip coloured by `changeStyle` (null = "NEW"). */
export function ChangeChip({
  pct,
  size = "md",
  style,
}: {
  pct: number | null;
  size?: "sm" | "md";
  style?: StyleProp<ViewStyle>;
}) {
  const tone = changeStyle(pct);
  return (
    <View
      style={[styles.chip, size === "sm" && styles.sm, { backgroundColor: tone.bg }, style]}
    >
      <Text style={[styles.text, size === "sm" && styles.smText, { color: tone.text }]}>
        {tone.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CHIP_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  sm: { height: 20, paddingHorizontal: 6, borderRadius: 10 },
  text: { fontFamily: mono.medium, fontSize: 12 },
  smText: { fontSize: 11 },
});
