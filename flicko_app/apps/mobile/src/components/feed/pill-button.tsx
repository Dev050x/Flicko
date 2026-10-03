import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";

import { feed } from "@/theme";

/*
 * Pill buttons for the feed and buy sheet. The pressed state lives in React state
 * because NativeWind drops function-valued `style` on Pressable (the button then
 * renders with no background).
 */
export function PillButton({
  kind,
  label,
  onPress,
  disabled = false,
  height = 54,
  style,
  children,
}: {
  kind: "accent" | "outline";
  label: string;
  onPress: () => void;
  disabled?: boolean;
  height?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        styles.pill,
        { height, borderRadius: height / 2 },
        kind === "accent" ? styles.accent : styles.outline,
        (pressed || disabled) && { opacity: disabled ? 0.55 : 0.85 },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  accent: { backgroundColor: feed.accent },
  // Secondary (Sell): dark glass with a hairline border.
  outline: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(31,29,38,0.85)",
  },
});
