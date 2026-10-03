import { router, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChevronLeftIcon } from "@/components/ui/icons";
import { colors } from "@/theme";

/*
 * Meme detail (chart, buy/sell). Placeholder until that screen is built.
 */
export default function MemeDetail() {
  const insets = useSafeAreaInsets();
  const { mint } = useLocalSearchParams<{ mint: string }>();
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.back}
        >
          <ChevronLeftIcon />
        </Pressable>
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>Meme details are coming soon</Text>
        <Text style={styles.mint} selectable>
          {mint}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { height: 44, justifyContent: "center" },
  back: { marginLeft: 20 },
  body: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 24 },
  title: { fontFamily: "DMSans_700Bold", fontSize: 18, color: colors.text },
  mint: { fontFamily: "DMSans_400Regular", fontSize: 13, color: colors.textMuted },
});
