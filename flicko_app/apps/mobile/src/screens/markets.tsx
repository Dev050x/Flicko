import { useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DevnetPill } from "@/components/ui/devnet-pill";
import { colors, type } from "@/theme";

/*
 * Placeholder until the markets list is built. The camera's "pumping" pill opens it
 * with ?sort=gainers.
 */
export default function Markets() {
  const insets = useSafeAreaInsets();
  const { sort } = useLocalSearchParams<{ sort?: string }>();
  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <Text style={[type.h1, { color: colors.text }]}>Markets</Text>
        <DevnetPill />
      </View>
      <View style={styles.body}>
        <Text style={styles.note}>
          {sort === "gainers"
            ? "Top gainers are coming soon."
            : "Markets are coming soon."}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  body: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  note: { fontFamily: "DMSans_400Regular", fontSize: 16, color: colors.textMuted },
});
