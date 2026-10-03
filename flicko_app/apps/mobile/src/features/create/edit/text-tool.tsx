import { useState } from "react";
import {
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "@/theme";

import { type TextLayer, type TextStyle, useCreateStore } from "../store";
import { Chip, panel, Swatches } from "./controls";

/*
 * Text: tap the photo to add text (or "Add text"), tap a text again to edit it. Styles:
 * Meme (Unbounded, white with a black outline), Clean (DM Sans Bold), Label (text on a
 * dark pill). Drag to move, pinch to scale, twist to rotate, long-press to delete.
 */
export const TEXT_STYLES: { id: TextStyle; label: string }[] = [
  { id: "meme", label: "Meme" },
  { id: "clean", label: "Clean" },
  { id: "label", label: "Label" },
];

const FONT: Record<TextStyle, string> = {
  meme: "Unbounded_800ExtraBold",
  clean: "DMSans_700Bold",
  label: "DMSans_700Bold",
};

export interface TextDefaults {
  style: TextStyle;
  color: string;
}

let nextId = 0;
export const layerId = () => `${Date.now().toString(36)}-${nextId++}`;

export const newTextLayer = (
  defaults: TextDefaults,
  x = 0.5,
  y = 0.45,
): TextLayer => ({
  id: layerId(),
  kind: "text",
  text: "",
  style: defaults.style,
  color: defaults.color,
  x,
  y,
  scale: 1,
  rotation: 0,
});

export const updateLayer = <T extends TextLayer>(id: string, patch: Partial<T>) =>
  useCreateStore.getState().change((e) => ({
    ...e,
    layers: e.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as typeof l) : l)),
  }));

export function TextTool({
  selected,
  defaults,
  onDefaults,
  onAdd,
}: {
  selected: TextLayer | null;
  defaults: TextDefaults;
  onDefaults: (d: TextDefaults) => void;
  onAdd: () => void;
}) {
  const commit = useCreateStore((s) => s.commit);
  const style = selected?.style ?? defaults.style;
  const color = selected?.color ?? defaults.color;

  const apply = (patch: Partial<TextDefaults>) => {
    onDefaults({ style, color, ...patch });
    if (selected) {
      updateLayer(selected.id, patch);
      commit();
    }
  };

  return (
    <View style={panel.wrap}>
      <View style={panel.row}>
        {TEXT_STYLES.map((s) => (
          <Chip
            key={s.id}
            label={s.label}
            selected={style === s.id}
            onPress={() => apply({ style: s.id })}
          />
        ))}
        <View style={{ flex: 1 }} />
        <Pressable accessibilityRole="button" onPress={onAdd} hitSlop={8}>
          <Text style={[panel.text, { color: colors.text }]}>Add text</Text>
        </Pressable>
      </View>
      <Swatches value={color} onChange={(c) => apply({ color: c })} />
      <Text style={panel.hint}>
        Tap the photo to add text. Pinch to resize, twist to rotate, hold to delete.
      </Text>
    </View>
  );
}

/*
 * Full-screen text entry over the editor. Empty text removes the layer on Done.
 */
export function TextEditor({
  layer,
  onDone,
}: {
  layer: TextLayer;
  onDone: (text: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState(layer.text);
  const commit = useCreateStore((s) => s.commit);
  const live = useCreateStore(
    (s) => s.edits.layers.find((l) => l.id === layer.id) as TextLayer | undefined,
  );
  const style = live?.style ?? layer.style;
  const color = live?.color ?? layer.color;

  const restyle = (patch: Partial<TextLayer>) => {
    updateLayer(layer.id, patch);
    commit();
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={[StyleSheet.absoluteFill, styles.scrim]}>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <View style={panel.row}>
          {TEXT_STYLES.map((s) => (
            <Chip
              key={s.id}
              label={s.label}
              selected={style === s.id}
              onPress={() => restyle({ style: s.id })}
            />
          ))}
        </View>
        <Pressable accessibilityRole="button" onPress={() => onDone(text)} hitSlop={10}>
          <Text style={styles.done}>Done</Text>
        </Pressable>
      </View>
      <View style={styles.middle}>
        <TextInput
          value={text}
          onChangeText={setText}
          autoFocus
          multiline
          maxLength={80}
          placeholder="Type something"
          placeholderTextColor="rgba(255,255,255,0.5)"
          selectionColor={colors.text}
          textAlign="center"
          style={[
            styles.input,
            { fontFamily: FONT[style], color },
            style === "label" && styles.label,
          ]}
        />
      </View>
      <View style={styles.swatches}>
        <Swatches value={color} onChange={(c) => restyle({ color: c })} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: colors.scrim },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  done: { fontFamily: "DMSans_700Bold", fontSize: 16, color: colors.text },
  middle: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  input: { fontSize: 30, lineHeight: 38, textAlign: "center", padding: 8 },
  label: {
    alignSelf: "center",
    backgroundColor: "rgba(14,11,20,0.85)",
    borderRadius: 24,
    paddingHorizontal: 18,
  },
  swatches: { alignItems: "center", paddingBottom: 16 },
});
