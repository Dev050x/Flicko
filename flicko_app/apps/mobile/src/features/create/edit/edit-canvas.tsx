import * as Haptics from "expo-haptics";
import { useMemo, useRef } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { LiveSceneCanvas } from "@/components/create/scene-canvas";

import type { SceneAssets } from "../assets";
import { layerSize } from "../scene";
import { type Layer, useCreateStore } from "../store";
import type { Brush } from "./draw-tool";

/*
 * The editor's photo with its gestures. Text and stickers: tap selects (tap a selected
 * text to edit it), drag moves, pinch scales, twist rotates, long-press deletes. In
 * Draw, one finger paints. In Text, tapping empty photo adds text there. The selection
 * outline is a view on top, so it never ends up in the image.
 *
 * Gestures are built once per tool and read the latest layers from the store, so a drag
 * only updates the store and the canvas, never this component.
 */
export type EditTool = "crop" | "adjust" | "text" | "stickers" | "draw" | "filters";

const HIT_PAD = 12;
const MIN_POINT_GAP = 2;

const layers = () => useCreateStore.getState().edits.layers;

export function EditCanvas({
  assets,
  width,
  height,
  tool,
  selectedId,
  onSelect,
  onEditText,
  onAddText,
  brush,
}: {
  assets: SceneAssets | null;
  width: number;
  height: number;
  tool: EditTool;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onEditText: (id: string) => void;
  onAddText: (x: number, y: number) => void;
  brush: Brush;
}) {
  // The gestures read these when they fire, so they don't have to be rebuilt.
  const props = useRef({ assets, width, height, selectedId, onSelect, onEditText, onAddText, brush });
  props.current = { assets, width, height, selectedId, onSelect, onEditText, onAddText, brush };

  const gesture = useMemo(() => {
    const { change, commit } = useCreateStore.getState();
    let drag: { id: string; x: number; y: number } | null = null;
    let pinch: { id: string; scale: number } | null = null;
    let turn: { id: string; rotation: number } | null = null;
    let drawing = false;
    let lastPoint: { x: number; y: number } | null = null;

    const hitTest = (x: number, y: number): Layer | null => {
      const { assets, width, height } = props.current;
      if (!assets) return null;
      const all = layers();
      for (let i = all.length - 1; i >= 0; i--) {
        const layer = all[i];
        const size = layerSize(layer, assets, width);
        const dx = x - layer.x * width;
        const dy = y - layer.y * height;
        const cos = Math.cos(-layer.rotation);
        const sin = Math.sin(-layer.rotation);
        const lx = dx * cos - dy * sin;
        const ly = dx * sin + dy * cos;
        if (
          Math.abs(lx) <= size.width / 2 + HIT_PAD &&
          Math.abs(ly) <= size.height / 2 + HIT_PAD
        ) {
          return layer;
        }
      }
      return null;
    };

    const selectedLayer = () => {
      const id = props.current.selectedId;
      return id ? (layers().find((l) => l.id === id) ?? null) : null;
    };

    const target = (x: number, y: number) =>
      tool === "draw" ? null : (hitTest(x, y) ?? selectedLayer());

    const patch = (id: string, values: Partial<Layer>) =>
      change((e) => ({
        ...e,
        layers: e.layers.map((l) => (l.id === id ? ({ ...l, ...values } as Layer) : l)),
      }));

    const remove = (layer: Layer) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      Alert.alert(
        layer.kind === "text" ? "Delete this text?" : "Delete this sticker?",
        undefined,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              change((e) => ({ ...e, layers: e.layers.filter((l) => l.id !== layer.id) }));
              commit();
              props.current.onSelect(null);
            },
          },
        ],
      );
    };

    const tap = Gesture.Tap()
      .runOnJS(true)
      .onEnd((e) => {
        const { width, height, selectedId, onSelect, onEditText, onAddText } = props.current;
        const hit = tool === "draw" ? null : hitTest(e.x, e.y);
        if (hit) {
          if (hit.kind === "text" && hit.id === selectedId) onEditText(hit.id);
          else onSelect(hit.id);
          return;
        }
        if (tool === "text") onAddText(e.x / width, e.y / height);
        else onSelect(null);
      });

    const hold = Gesture.LongPress()
      .runOnJS(true)
      .minDuration(500)
      .onStart((e) => {
        if (tool === "draw") return;
        const hit = hitTest(e.x, e.y);
        if (hit) remove(hit);
      });

    const pan = Gesture.Pan()
      .runOnJS(true)
      .minDistance(tool === "draw" ? 0 : 4)
      .onStart((e) => {
        const { width, height, brush, onSelect } = props.current;
        if (tool === "draw") {
          drawing = true;
          lastPoint = { x: e.x, y: e.y };
          change((ed) => ({
            ...ed,
            strokes: [
              ...ed.strokes,
              { color: brush.color, size: brush.size, points: [e.x / width, e.y / height] },
            ],
          }));
          return;
        }
        const hit = target(e.x, e.y);
        if (!hit) return;
        onSelect(hit.id);
        drag = { id: hit.id, x: hit.x, y: hit.y };
      })
      .onUpdate((e) => {
        const { width, height } = props.current;
        if (drawing) {
          if (lastPoint && Math.hypot(e.x - lastPoint.x, e.y - lastPoint.y) < MIN_POINT_GAP) {
            return;
          }
          lastPoint = { x: e.x, y: e.y };
          change((ed) => {
            const strokes = ed.strokes.slice();
            const stroke = strokes[strokes.length - 1];
            strokes[strokes.length - 1] = {
              ...stroke,
              points: [...stroke.points, e.x / width, e.y / height],
            };
            return { ...ed, strokes };
          });
          return;
        }
        if (!drag) return;
        patch(drag.id, {
          x: Math.min(1, Math.max(0, drag.x + e.translationX / width)),
          y: Math.min(1, Math.max(0, drag.y + e.translationY / height)),
        });
      })
      .onEnd(() => {
        if (drawing || drag) commit();
      })
      .onFinalize(() => {
        drawing = false;
        drag = null;
      });

    const pinchGesture = Gesture.Pinch()
      .runOnJS(true)
      .onStart((e) => {
        const hit = target(e.focalX, e.focalY);
        if (hit) pinch = { id: hit.id, scale: hit.scale };
      })
      .onUpdate((e) => {
        if (pinch) patch(pinch.id, { scale: Math.min(6, Math.max(0.2, pinch.scale * e.scale)) });
      })
      .onEnd(() => pinch && commit())
      .onFinalize(() => {
        pinch = null;
      });

    const rotate = Gesture.Rotation()
      .runOnJS(true)
      .onStart((e) => {
        const hit = target(e.anchorX, e.anchorY);
        if (hit) turn = { id: hit.id, rotation: hit.rotation };
      })
      .onUpdate((e) => {
        if (turn) patch(turn.id, { rotation: turn.rotation + e.rotation });
      })
      .onEnd(() => turn && commit())
      .onFinalize(() => {
        turn = null;
      });

    return Gesture.Simultaneous(pan, pinchGesture, rotate, Gesture.Exclusive(hold, tap));
  }, [tool]);

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ width, height }} collapsable={false}>
        <LiveSceneCanvas assets={assets} width={width} height={height} />
        {tool !== "draw" && selectedId && assets && (
          <SelectionOutline id={selectedId} assets={assets} width={width} height={height} />
        )}
      </View>
    </GestureDetector>
  );
}

/* The dashed box around the selected layer; it alone follows the layer while dragging. */
function SelectionOutline({
  id,
  assets,
  width,
  height,
}: {
  id: string;
  assets: SceneAssets;
  width: number;
  height: number;
}) {
  const selected = useCreateStore((s) => s.edits.layers.find((l) => l.id === id));
  if (!selected) return null;
  const box = layerSize(selected, assets, width);
  return (
    <View
      pointerEvents="none"
      style={[
        styles.outline,
        {
          left: selected.x * width - box.width / 2 - 6,
          top: selected.y * height - box.height / 2 - 6,
          width: box.width + 12,
          height: box.height + 12,
          transform: [{ rotate: `${selected.rotation}rad` }],
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  outline: {
    position: "absolute",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.85)",
    borderRadius: 6,
  },
});
