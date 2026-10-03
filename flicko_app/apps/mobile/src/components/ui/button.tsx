import * as Haptics from "expo-haptics";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { colors, radius, ref, size, type } from "@/theme";

/*
 * Primary action: solid accent pill, 56dp. One per screen.
 */
export function Button({
  label,
  icon,
  onPress,
  disabled = false,
}: {
  label: string;
  icon?: ReactNode;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      style={({ pressed }) => ({
        height: size.buttonHeight,
        borderRadius: radius.pill,
        backgroundColor: pressed ? colors.accentPressed : colors.accent,
        opacity: disabled ? 0.45 : 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
      })}
    >
      {icon}
      <Text style={[type.button, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

/*
 * Secondary text action under a primary button (48dp touch target).
 */
export function TextButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        height: size.secondaryHeight,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text
        style={{
          fontFamily: "DMSans_500Medium",
          fontSize: 16,
          color: ref.textBright,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/*
 * Small rounded chip, e.g. the "One approval" reassurances.
 */
export function Chip({ icon, label }: { icon?: ReactNode; label: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        height: 30,
        paddingHorizontal: 12,
        borderRadius: 15,
        backgroundColor: colors.surfaceSunken,
      }}
    >
      {icon}
      <Text
        style={{
          fontFamily: "DMSans_400Regular",
          fontSize: 13,
          color: ref.textBright,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
