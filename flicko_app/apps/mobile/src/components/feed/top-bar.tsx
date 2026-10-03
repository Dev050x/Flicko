import { Pressable, StyleSheet, Text, View } from "react-native";

import type { FeedTab } from "@/features/feed/types";
import { feed, geist } from "@/theme";

import { SearchIcon } from "./icons";

/*
 * Centred tabs (active: white with a 2dp pink underline) and the round search button.
 */
const TABS: { id: FeedTab; label: string }[] = [
  { id: "following", label: "Following" },
  { id: "forYou", label: "For you" },
  { id: "launching", label: "Launching" },
];

export const TOP_BAR_HEIGHT = 56;

export function FeedTopBar({
  top,
  tab,
  onTab,
  onSearch,
}: {
  top: number;
  tab: FeedTab;
  onTab: (tab: FeedTab) => void;
  onSearch: () => void;
}) {
  return (
    <View style={[styles.bar, { top }]} pointerEvents="box-none">
      <View style={styles.tabs} accessibilityRole="tablist">
        {TABS.map(({ id, label }) => {
          const active = id === tab;
          return (
            <Pressable
              key={id}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => onTab(id)}
              style={styles.tab}
            >
              <Text style={[styles.label, { color: active ? feed.text : feed.textMuted }]}>
                {label}
              </Text>
              <View style={[styles.underline, active && styles.underlineOn]} />
            </Pressable>
          );
        })}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Search"
        onPress={onSearch}
        style={styles.search}
      >
        <SearchIcon size={22} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    height: TOP_BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  tabs: { flexDirection: "row", gap: 20 },
  tab: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingTop: 6 },
  label: {
    fontFamily: geist.semibold,
    fontSize: 16,
    lineHeight: 20,
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  underline: { alignSelf: "stretch", height: 2, borderRadius: 1, marginTop: 7 },
  underlineOn: { backgroundColor: feed.accent },
  search: {
    position: "absolute",
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: feed.glass,
    alignItems: "center",
    justifyContent: "center",
  },
});
