import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CameraIcon, FeedIcon, MarketsIcon } from "@/components/ui/icons";
import { cam, colors } from "@/theme";

/*
 * The bottom bar shared by Markets, Camera and Feed (design-reference/Camera.html):
 * solid ink, hairline top border, items centred at 20% / 50% / 80%.
 */
export const MAIN_TABS = [
  { name: "markets", label: "Markets", Icon: MarketsIcon, at: 0.2 },
  { name: "camera", label: "Camera", Icon: CameraIcon, at: 0.5 },
  { name: "feed", label: "Feed", Icon: FeedIcon, at: 0.8 },
] as const;

export type MainTab = (typeof MAIN_TABS)[number]["name"];

const BAR_HEIGHT = 74;
const ITEM_WIDTH = 80;
const CONTENT_HEIGHT = 56; // 12 top padding + icon + gap + label

export const tabBarHeight = (bottomInset: number) =>
  Math.max(BAR_HEIGHT, CONTENT_HEIGHT + bottomInset);

export function TabBar({
  index,
  onSelect,
}: {
  index: number;
  onSelect: (index: number) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.bar, { height: tabBarHeight(insets.bottom) }]}
    >
      {MAIN_TABS.map(({ name, label, Icon, at }, i) => {
        const active = i === index;
        const color = active ? colors.text : cam.tabInactive;
        return (
          <Pressable
            key={name}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(i)}
            style={[styles.item, { left: `${at * 100}%` }]}
          >
            <Icon size={26} color={color} />
            <Text
              style={[
                styles.label,
                {
                  color,
                  fontFamily: active ? "DMSans_700Bold" : "DMSans_500Medium",
                },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  item: {
    position: "absolute",
    top: 0,
    width: ITEM_WIDTH,
    marginLeft: -ITEM_WIDTH / 2,
    height: CONTENT_HEIGHT,
    paddingTop: 12,
    alignItems: "center",
    gap: 4,
  },
  label: { fontSize: 11, lineHeight: 14 },
});
