import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { ChevronLeftIcon } from "@/components/ui/icons";

/* 40dp row: back on the left, round icon buttons on the right. */
export function HeaderBar({ children }: { children?: ReactNode }) {
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => router.back()}
        hitSlop={8}
        style={styles.btn}
      >
        <ChevronLeftIcon />
      </Pressable>
      <View style={{ flex: 1 }} />
      {children}
    </View>
  );
}

export function IconButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={styles.btn}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    height: 40,
    marginHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  btn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});
