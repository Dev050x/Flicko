import { Image } from "expo-image";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import type { FeedTab } from "@/features/feed/types";
import { useMyAvatar } from "@/features/avatars/catalog";
import { useSession } from "@/store/session";
import { feed, geist } from "@/theme";

import { CheckMarkIcon, ChevronDownIcon, SearchIcon } from "./icons";

/*
 * Feed top bar over the photo: your avatar (opens the profile menu) on the left, the
 * current feed as a "For you ⌄" pill in the middle that opens a menu of the three
 * feeds, and search on the right. All three sit in matching dark see-through shapes.
 */
const TABS: { id: FeedTab; label: string; hint: string }[] = [
  { id: "following", label: "Following", hint: "Creators you follow" },
  { id: "forYou", label: "For you", hint: "Picked for you" },
  { id: "launching", label: "Launching", hint: "Live launches, newest first" },
];

export const TOP_BAR_HEIGHT = 56;
const ROUND = 40;
const GLASS = "rgba(11,11,15,0.6)";
const GLASS_BORDER = "rgba(255,255,255,0.12)";

export function FeedTopBar({
  top,
  tab,
  onTab,
  onSearch,
  onProfile,
}: {
  top: number;
  tab: FeedTab;
  onTab: (tab: FeedTab) => void;
  onSearch: () => void;
  onProfile: () => void;
}) {
  const avatar = useMyAvatar();
  const [open, setOpen] = useState(false);
  const current = TABS.find((t) => t.id === tab) ?? TABS[1];

  return (
    <View style={[styles.bar, { top }]} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Profile menu"
        onPress={onProfile}
        hitSlop={4}
        style={styles.round}
      >
        <Image source={avatar} style={styles.avatarImage} contentFit="cover" />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Feed: ${current.label}. Change feed`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        style={styles.pill}
      >
        <Text style={styles.pillText}>{current.label}</Text>
        <ChevronDownIcon size={16} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Search"
        onPress={onSearch}
        hitSlop={4}
        style={styles.round}
      >
        <SearchIcon size={20} />
      </Pressable>

      {open && (
        <Modal
          transparent
          visible
          statusBarTranslucent
          animationType="none"
          onRequestClose={() => setOpen(false)}
        >
          <Pressable
            accessibilityLabel="Close"
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
          />
          <View
            style={[styles.menuWrap, { top: top + TOP_BAR_HEIGHT - 4 }]}
            pointerEvents="box-none"
          >
            <Animated.View
              entering={FadeIn.duration(120)}
              style={styles.menu}
              accessibilityRole="menu"
            >
              {TABS.map(({ id, label, hint }, i) => {
                const selected = id === tab;
                return (
                  <Pressable
                    key={id}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setOpen(false);
                      onTab(id);
                    }}
                    style={[styles.item, i > 0 && styles.itemBorder]}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.itemLabel}>{label}</Text>
                      <Text style={styles.itemHint}>{hint}</Text>
                    </View>
                    {selected && <CheckMarkIcon size={18} />}
                  </Pressable>
                );
              })}
            </Animated.View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    height: TOP_BAR_HEIGHT,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  round: {
    width: ROUND,
    height: ROUND,
    borderRadius: ROUND / 2,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: { width: "100%", height: "100%" },
  pill: {
    height: ROUND,
    paddingLeft: 16,
    paddingRight: 12,
    borderRadius: ROUND / 2,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pillText: { fontFamily: geist.semibold, fontSize: 15, color: feed.text },
  menuWrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  menu: {
    width: 260,
    backgroundColor: "rgba(21,20,26,0.97)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: feed.border,
    overflow: "hidden",
  },
  item: {
    minHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  itemBorder: { borderTopWidth: 1, borderTopColor: feed.border },
  itemLabel: { fontFamily: geist.semibold, fontSize: 15, color: feed.text },
  itemHint: { fontFamily: geist.regular, fontSize: 12, color: feed.textMuted },
});
