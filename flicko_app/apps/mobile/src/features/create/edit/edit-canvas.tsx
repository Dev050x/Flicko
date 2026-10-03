import * as Haptics from "expo-haptics";
import { useRef } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { SceneCanvas } from "@/components/create/scene-canvas";

import type { SceneAssets } from "../assets";
import { layerSize, type Scene } from "../scene";
import { type Layer, useCreateStore } from "../store";
import type { Brush } from "./draw-tool";

/*
 * The editor's photo with its gestures. Text and stickers: tap selects (tap a selected
 * text to edit it), drag moves, pinch scales, twist rotates, long-press deletes. In
 * Draw, one finger paints. In Text, tapping empty photo adds text there. The selection
 * outline is a view on top, so it never ends up in the image.
 */
export type EditTool = "crop" | "adjust" | "text" | "stickers" | "draw" | "filters";

const HIT_PAD = 12;
const MIN_POINT_GAP = 2;

export function EditCanvas({
  scene,
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
  scene: Scene;
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
  const change = useCreateStore((s) => s.change);
  const commit = useCreateStore((s) => s.commit);
  const drag = useRef<{ id: string; x: number; y: number } | null>(null);
  const pinch = useRef<{ id: string; scale: number } | null>(null);
  const turn = useRef<{ id: string; rotation: number } | null>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  const layers = scene.edits.layers;

  const hitTest = (x: number, y: number): Layer | null => {
    if (!assets) return null;
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
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

  const patch = (id: string, values: Partial<Layer>) =>
    change((e) => ({
      ...e,
      layers: e.layers.map((l) => (l.id === id ? ({ ...l, ...values } as Layer) : l)),
    }));

  const current = (id: string) =>
    useCreateStore.getState().edits.layers.find((l) => l.id === id);

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
            onSelect(null);
          },
        },
      ],
    );
  };

  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((e) => {
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
      if (tool === "draw") {
        drawing.current = true;
        lastPoint.current = { x: e.x, y: e.y };
        change((ed) => ({
          ...ed,
          strokes: [
            ...ed.strokes,
            { color: brush.color, size: brush.size, points: [e.x / width, e.y / height] },
          ],
        }));
        return;
      }
      const hit = hitTest(e.x, e.y) ?? (selectedId ? (current(selectedId) ?? null) : null);
      if (!hit) return;
      onSelect(hit.id);
      drag.current = { id: hit.id, x: hit.x, y: hit.y };
    })
    .onUpdate((e) => {
      if (drawing.current) {
        const last = lastPoint.current;
        if (last && Math.hypot(e.x - last.x, e.y - last.y) < MIN_POINT_GAP) return;
        lastPoint.current = { x: e.x, y: e.y };
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
      const d = drag.current;
      if (!d) return;
      patch(d.id, {
        x: Math.min(1, Math.max(0, d.x + e.translationX / width)),
        y: Math.min(1, Math.max(0, d.y + e.translationY / height)),
      });
    })
    .onEnd(() => {
      if (drawing.current || drag.current) commit();
    })
    .onFinalize(() => {
      drawing.current = false;
      drag.current = null;
    });

  const target = (x: number, y: number) =>
    tool === "draw"
      ? null
      : (hitTest(x, y) ?? (selectedId ? (current(selectedId) ?? null) : null));

  const pinchGesture = Gesture.Pinch()
    .runOnJS(true)
    .onStart((e) => {
      const hit = target(e.focalX, e.focalY);
      if (hit) pinch.current = { id: hit.id, scale: hit.scale };
    })
    .onUpdate((e) => {
      const p = pinch.current;
      if (p) patch(p.id, { scale: Math.min(6, Math.max(0.2, p.scale * e.scale)) });
    })
    .onEnd(() => pinch.current && commit())
    .onFinalize(() => {
      pinch.current = null;
    });

  const rotate = Gesture.Rotation()
    .runOnJS(true)
    .onStart((e) => {
      const hit = target(e.anchorX, e.anchorY);
      if (hit) turn.current = { id: hit.id, rotation: hit.rotation };
    })
    .onUpdate((e) => {
      const t = turn.current;
      if (t) patch(t.id, { rotation: t.rotation + e.rotation });
    })
    .onEnd(() => turn.current && commit())
    .onFinalize(() => {
      turn.current = null;
    });

  const gesture = Gesture.Simultaneous(
    pan,
    pinchGesture,
    rotate,
    Gesture.Exclusive(hold, tap),
  );

  const selected = layers.find((l) => l.id === selectedId);
  const box = selected && assets ? layerSize(selected, assets, width) : null;

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ width, height }} collapsable={false}>
        <SceneCanvas scene={scene} assets={assets} width={width} height={height} />
        {selected && box && tool !== "draw" && (
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
        )}
      </View>
    </GestureDetector>
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
