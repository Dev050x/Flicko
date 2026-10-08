import { Pressable, StyleSheet, Text, View } from "react-native";

import { Glass } from "@/components/ui/glass";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  type FilterCategory,
} from "@/features/filters/catalog";
import { cam, colors } from "@/theme";

/*
 * Category chips under the carousel. The selected one is a glass pill (none while the
 * plain camera is on); picking a chip scrolls the (single, continuous) filter list to
 * that category's first filter.
 */
export function CategoryChips({
  selected,
  onSelect,
}: {
  selected?: FilterCategory;
  onSelect: (category: FilterCategory) => void;
}) {
  return (
    <View style={styles.row}>
      {CATEGORIES.map((category) => {
        const active = category === selected;
        const label = (
          <Text style={[styles.text, !active && { color: cam.chipText }]}>
            {CATEGORY_LABEL[category]}
          </Text>
        );
        return (
          <Pressable
            key={category}
            accessibilityRole="button"
            accessibilityLabel={`${CATEGORY_LABEL[category]} filters`}
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(category)}
            hitSlop={9}
          >
            {active ? (
              <Glass style={styles.chip}>{label}</Glass>
            ) : (
              <View style={[styles.chip, styles.plain]}>{label}</View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "center", gap: 4 },
  chip: {
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  // Same box as the glass chip (1px border) so chips don't shift when selected.
  plain: { borderWidth: 1, borderColor: "transparent" },
  text: { fontFamily: "DMSans_500Medium", fontSize: 14, color: colors.text },
});
