import { Image } from "expo-image";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors } from "@/theme";

import { STICKERS } from "../assets";
import { type StickerLayer, useCreateStore } from "../store";
import { panel } from "./controls";
import { layerId } from "./text-tool";

/*
 * Stickers: the camera's sticker art plus Bobo cutouts. A tap drops one in the middle;
 * then drag, pinch, twist, or hold to delete (same as text).
 */
export function StickerTool({ onAdded }: { onAdded: (id: string) => void }) {
  const change = useCreateStore((s) => s.change);
  const commit = useCreateStore((s) => s.commit);

  const add = (sticker: string) => {
    const layer: StickerLayer = {
      id: layerId(),
      kind: "sticker",
      sticker,
      x: 0.5,
      y: 0.45,
      scale: 1,
      rotation: 0,
    };
    change((e) => ({ ...e, layers: [...e.layers, layer] }));
    commit();
    onAdded(layer.id);
  };

  return (
    <View style={[panel.wrap, { paddingHorizontal: 0 }]}>
      <ScrollView contentContainerStyle={styles.grid}>
        {STICKERS.map((s) => (
          <Pressable
            key={s.id}
            accessibilityRole="button"
            accessibilityLabel={`Add ${s.name} sticker`}
            onPress={() => add(s.id)}
            style={styles.cell}
          >
            <Image source={s.source} style={styles.art} contentFit="contain" />
          </Pressable>
        ))}
      </ScrollView>
      <Text style={[panel.hint, { paddingHorizontal: 24 }]}>
        Tap a sticker to add it. Pinch to resize, twist to rotate, hold to delete.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingHorizontal: 24,
  },
  cell: {
    width: 76,
    height: 76,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  art: { width: 60, height: 60 },
});
