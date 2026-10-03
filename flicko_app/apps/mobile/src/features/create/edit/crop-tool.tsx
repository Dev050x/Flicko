import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { MirrorIcon, RotateIcon } from "@/components/ui/icons";
import { colors } from "@/theme";

import { orientedSize } from "../scene";
import { type Crop, type CropAspect, type Photo, useCreateStore } from "../store";
import { Chip, IconButton, panel } from "./controls";

/*
 * Crop: free crop or a preset (Original, 4:5, 1:1, 9:16), quarter turns and a
 * horizontal flip. While this tool is open the canvas shows the whole photo with the crop
 * box over it: drag a corner to resize, drag inside to move; thirds appear while dragging.
 */
type Rect = Crop["rect"];

const ASPECTS: { id: CropAspect; label: string; ratio?: number }[] = [
  { id: "free", label: "Free" },
  { id: "original", label: "Original" },
  { id: "4:5", label: "4:5", ratio: 4 / 5 },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
];
const MIN_SIZE = 0.1;
const HANDLE_HIT = 32;

/** The preset's width/height in fractions of the oriented photo, or null for free. */
const normalisedRatio = (photo: Photo, crop: Pick<Crop, "aspect" | "turns">) => {
  if (crop.aspect === "free") return null;
  const size = orientedSize(photo, crop.turns);
  const ratio =
    crop.aspect === "original"
      ? size.width / size.height
      : ASPECTS.find((a) => a.id === crop.aspect)!.ratio!;
  return (ratio * size.height) / size.width;
};

/** The largest centred box with the preset's shape. */
const presetRect = (photo: Photo, crop: Pick<Crop, "aspect" | "turns">): Rect => {
  const r = normalisedRatio(photo, crop);
  if (r === null) return { x: 0, y: 0, width: 1, height: 1 };
  const width = r <= 1 ? r : 1;
  const height = r <= 1 ? 1 : 1 / r;
  return { x: (1 - width) / 2, y: (1 - height) / 2, width, height };
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function CropTool() {
  const photo = useCreateStore((s) => s.photo)!;
  const crop = useCreateStore((s) => s.edits.crop);
  const change = useCreateStore((s) => s.change);
  const commit = useCreateStore((s) => s.commit);

  const update = (next: Partial<Crop>) => {
    change((e) => ({ ...e, crop: { ...e.crop, ...next } }));
    commit();
  };

  return (
    <View style={panel.wrap}>
      <View style={[panel.row, { flexWrap: "wrap" }]}>
        {ASPECTS.map((a) => (
          <Chip
            key={a.id}
            label={a.label}
            selected={crop.aspect === a.id}
            onPress={() =>
              update({
                aspect: a.id,
                rect: a.id === "free" ? crop.rect : presetRect(photo, { ...crop, aspect: a.id }),
              })
            }
          />
        ))}
      </View>
      <View style={panel.row}>
        <IconButton
          label="Rotate 90 degrees"
          onPress={() => {
            const turns = ((crop.turns + 1) % 4) as Crop["turns"];
            update({ turns, rect: presetRect(photo, { ...crop, turns }) });
          }}
        >
          <RotateIcon size={20} />
        </IconButton>
        <IconButton
          label="Flip horizontally"
          onPress={() =>
            update({
              flip: !crop.flip,
              rect: { ...crop.rect, x: 1 - crop.rect.x - crop.rect.width },
            })
          }
        >
          <MirrorIcon size={20} />
        </IconButton>
      </View>
    </View>
  );
}

type Target = "move" | "tl" | "tr" | "bl" | "br";

/*
 * The crop box over the whole photo, drawn at `width` x `height`.
 */
export function CropOverlay({ width, height }: { width: number; height: number }) {
  const photo = useCreateStore((s) => s.photo)!;
  const crop = useCreateStore((s) => s.edits.crop);
  const change = useCreateStore((s) => s.change);
  const commit = useCreateStore((s) => s.commit);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ target: Target; rect: Rect } | null>(null);

  const box = {
    x: crop.rect.x * width,
    y: crop.rect.y * height,
    width: crop.rect.width * width,
    height: crop.rect.height * height,
  };

  const targetAt = (x: number, y: number): Target | null => {
    const near = (cx: number, cy: number) =>
      Math.abs(x - cx) < HANDLE_HIT && Math.abs(y - cy) < HANDLE_HIT;
    const r = box.x + box.width;
    const b = box.y + box.height;
    if (near(box.x, box.y)) return "tl";
    if (near(r, box.y)) return "tr";
    if (near(box.x, b)) return "bl";
    if (near(r, b)) return "br";
    if (x > box.x && x < r && y > box.y && y < b) return "move";
    return null;
  };

  const resize = (s: { target: Target; rect: Rect }, dx: number, dy: number): Rect => {
    const { rect, target } = s;
    if (target === "move") {
      return {
        ...rect,
        x: clamp(rect.x + dx, 0, 1 - rect.width),
        y: clamp(rect.y + dy, 0, 1 - rect.height),
      };
    }
    const left = target === "tl" || target === "bl";
    const top = target === "tl" || target === "tr";
    // The opposite corner stays put.
    const fx = left ? rect.x + rect.width : rect.x;
    const fy = top ? rect.y + rect.height : rect.y;
    const mx = clamp((left ? rect.x : rect.x + rect.width) + dx, 0, 1);
    const my = clamp((top ? rect.y : rect.y + rect.height) + dy, 0, 1);
    const roomX = left ? fx : 1 - fx;
    const roomY = top ? fy : 1 - fy;
    let w = clamp(left ? fx - mx : mx - fx, MIN_SIZE, roomX);
    let h = clamp(top ? fy - my : my - fy, MIN_SIZE, roomY);
    const ratio = normalisedRatio(photo, crop);
    if (ratio !== null) {
      h = w / ratio;
      if (h > roomY) {
        h = roomY;
        w = h * ratio;
      }
      if (h < MIN_SIZE) {
        h = MIN_SIZE;
        w = h * ratio;
      }
    }
    return {
      x: left ? fx - w : fx,
      y: top ? fy - h : fy,
      width: w,
      height: h,
    };
  };

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin((e) => {
      const target = targetAt(e.x, e.y);
      start.current = target ? { target, rect: crop.rect } : null;
      if (target) setDragging(true);
    })
    .onUpdate((e) => {
      const s = start.current;
      if (!s) return;
      const rect = resize(s, e.translationX / width, e.translationY / height);
      change((ed) => ({ ...ed, crop: { ...ed.crop, rect } }));
    })
    .onFinalize(() => {
      if (start.current) commit();
      start.current = null;
      setDragging(false);
    });

  const r = box.x + box.width;
  const b = box.y + box.height;
  return (
    <GestureDetector gesture={pan}>
      <View style={[StyleSheet.absoluteFill, { width, height }]}>
        <View style={[styles.dim, { left: 0, top: 0, width, height: box.y }]} />
        <View style={[styles.dim, { left: 0, top: b, width, height: height - b }]} />
        <View style={[styles.dim, { left: 0, top: box.y, width: box.x, height: box.height }]} />
        <View style={[styles.dim, { left: r, top: box.y, width: width - r, height: box.height }]} />
        <View
          pointerEvents="none"
          style={[styles.box, { left: box.x, top: box.y, width: box.width, height: box.height }]}
        >
          {dragging &&
            [1, 2].map((i) => (
              <View key={`v${i}`} style={[styles.gridV, { left: (box.width * i) / 3 }]} />
            ))}
          {dragging &&
            [1, 2].map((i) => (
              <View key={`h${i}`} style={[styles.gridH, { top: (box.height * i) / 3 }]} />
            ))}
          <View style={[styles.corner, { left: -3, top: -3, borderLeftWidth: 3, borderTopWidth: 3 }]} />
          <View style={[styles.corner, { right: -3, top: -3, borderRightWidth: 3, borderTopWidth: 3 }]} />
          <View style={[styles.corner, { left: -3, bottom: -3, borderLeftWidth: 3, borderBottomWidth: 3 }]} />
          <View style={[styles.corner, { right: -3, bottom: -3, borderRightWidth: 3, borderBottomWidth: 3 }]} />
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  dim: { position: "absolute", backgroundColor: "rgba(0,0,0,0.55)" },
  box: { position: "absolute", borderWidth: 1, borderColor: colors.text },
  gridV: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.7)",
  },
  gridH: {
    position: "absolute",
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.7)",
  },
  corner: { position: "absolute", width: 22, height: 22, borderColor: colors.text },
});
