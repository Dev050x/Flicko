import { Pressable, StyleSheet, Text, View } from "react-native";

import { RedoIcon, UndoIcon } from "@/components/ui/icons";
import { colors } from "@/theme";

import { useCreateStore } from "../store";
import { IconButton, panel, Swatches } from "./controls";

/*
 * Draw: a brush in three sizes and the text colours; strokes are smoothed with
 * quadratic curves. Undo/redo step through the whole edit session.
 */
export const BRUSH_SIZES = [
  { size: 0.008, label: "Thin", dot: 6 },
  { size: 0.016, label: "Medium", dot: 10 },
  { size: 0.03, label: "Thick", dot: 16 },
];

export interface Brush {
  size: number;
  color: string;
}

export function DrawTool({
  brush,
  onBrush,
}: {
  brush: Brush;
  onBrush: (brush: Brush) => void;
}) {
  const canUndo = useCreateStore((s) => s.index > 0);
  const canRedo = useCreateStore((s) => s.index < s.history.length - 1);
  const undo = useCreateStore((s) => s.undo);
  const redo = useCreateStore((s) => s.redo);

  return (
    <View style={panel.wrap}>
      <View style={panel.row}>
        {BRUSH_SIZES.map((b) => {
          const selected = brush.size === b.size;
          return (
            <Pressable
              key={b.label}
              accessibilityRole="button"
              accessibilityLabel={`${b.label} brush`}
              accessibilityState={{ selected }}
              onPress={() => onBrush({ ...brush, size: b.size })}
              style={[styles.size, selected && styles.sizeOn]}
            >
              <View
                style={{
                  width: b.dot,
                  height: b.dot,
                  borderRadius: b.dot / 2,
                  backgroundColor: colors.text,
                }}
              />
            </Pressable>
          );
        })}
        <View style={{ flex: 1 }} />
        <IconButton label="Undo" disabled={!canUndo} onPress={undo}>
          <UndoIcon size={20} />
        </IconButton>
        <IconButton label="Redo" disabled={!canRedo} onPress={redo}>
          <RedoIcon size={20} />
        </IconButton>
      </View>
      <Swatches value={brush.color} onChange={(color) => onBrush({ ...brush, color })} />
      <Text style={panel.hint}>Draw on the photo with one finger.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  size: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  sizeOn: { borderColor: "rgba(255,255,255,0.55)", backgroundColor: colors.surfaceSunken },
});
