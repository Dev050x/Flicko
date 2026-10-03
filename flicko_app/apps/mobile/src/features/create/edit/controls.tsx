import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, ref } from "@/theme";

/*
 * Small controls shared by the editor's tool panels. Selection is white (never pink):
 * a raised chip with a light border, or a white ring around a swatch.
 */
export const SWATCHES = [
  { color: "#FFFFFF", name: "White" },
  { color: "#000000", name: "Black" },
  { color: colors.accent, name: "Pink" },
  { color: colors.gain, name: "Green" },
  { color: colors.loss, name: "Red" },
  { color: colors.warning, name: "Gold" },
] as const;

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={[styles.chip, selected && styles.chipOn]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

export function Swatches({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (color: string) => void;
}) {
  return (
    <View style={styles.swatches}>
      {SWATCHES.map(({ color, name }) => {
        const selected = value?.toUpperCase() === color.toUpperCase();
        return (
          <Pressable
            key={color}
            accessibilityRole="button"
            accessibilityLabel={name}
            accessibilityState={{ selected }}
            onPress={() => onChange(color)}
            hitSlop={4}
            style={[styles.ring, selected && styles.ringOn]}
          >
            <View style={[styles.swatch, { backgroundColor: color }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

export function IconButton({
  label,
  disabled = false,
  onPress,
  children,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={[styles.iconButton, disabled && { opacity: 0.35 }]}
    >
      {children}
    </Pressable>
  );
}

export const panel = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 24, paddingTop: 16, gap: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  hint: { fontFamily: "DMSans_400Regular", fontSize: 13, color: colors.textMuted },
  text: { fontFamily: "DMSans_500Medium", fontSize: 13, color: colors.textMuted },
});

const styles = StyleSheet.create({
  chip: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "transparent",
    justifyContent: "center",
  },
  chipOn: { backgroundColor: ref.walletTile, borderColor: ref.lineDashed },
  chipText: { fontFamily: "DMSans_500Medium", fontSize: 13, color: colors.textMuted },
  chipTextOn: { fontFamily: "DMSans_700Bold", color: colors.text },
  swatches: { flexDirection: "row", gap: 10 },
  ring: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  ringOn: { borderColor: colors.text },
  swatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
