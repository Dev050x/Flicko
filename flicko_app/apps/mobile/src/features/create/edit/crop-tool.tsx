import { useCallback, useEffect, useMemo } from "react";
import { PixelRatio, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

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

/* What a drag holds: nothing, the whole box, or one corner. */
const NONE = 0;
const MOVE = 1;
const TL = 2;
const TR = 3;
const BL = 4;
const BR = 5;
const TOP = 6;
const BOTTOM = 7;
const LEFT = 8;
const RIGHT = 9;
const EDGE_HIT = 22;
const PIXEL = PixelRatio.get();

const clampW = (v: number, lo: number, hi: number) => {
  "worklet";
  return Math.min(hi, Math.max(lo, v));
};

const targetAt = (r: Rect, x: number, y: number, width: number, height: number) => {
  "worklet";
  const left = r.x * width;
  const top = r.y * height;
  const right = left + r.width * width;
  const bottom = top + r.height * height;
  const near = (cx: number, cy: number) =>
    Math.abs(x - cx) < HANDLE_HIT && Math.abs(y - cy) < HANDLE_HIT;
  if (near(left, top)) return TL;
  if (near(right, top)) return TR;
  if (near(left, bottom)) return BL;
  if (near(right, bottom)) return BR;
  // Anywhere along a side (between the corners) moves that side.
  const alongX = x > left && x < right;
  const alongY = y > top && y < bottom;
  if (alongX && Math.abs(y - top) < EDGE_HIT) return TOP;
  if (alongX && Math.abs(y - bottom) < EDGE_HIT) return BOTTOM;
  if (alongY && Math.abs(x - left) < EDGE_HIT) return LEFT;
  if (alongY && Math.abs(x - right) < EDGE_HIT) return RIGHT;
  if (alongX && alongY) return MOVE;
  return NONE;
};

/* `rect` moved or resized by (dx, dy) in fractions; `ratio` 0 means free. */
const resizeRect = (rect: Rect, target: number, dx: number, dy: number, ratio: number): Rect => {
  "worklet";
  if (target === MOVE) {
    return {
      x: clampW(rect.x + dx, 0, 1 - rect.width),
      y: clampW(rect.y + dy, 0, 1 - rect.height),
      width: rect.width,
      height: rect.height,
    };
  }
  if (target === LEFT || target === RIGHT) {
    // The opposite side stays put; with a fixed shape the height follows, centred.
    const right = rect.x + rect.width;
    let w =
      target === LEFT
        ? right - clampW(rect.x + dx, 0, right - MIN_SIZE)
        : clampW(right + dx, rect.x + MIN_SIZE, 1) - rect.x;
    let h = rect.height;
    let y = rect.y;
    if (ratio > 0) {
      const cy = rect.y + rect.height / 2;
      const maxH = 2 * Math.min(cy, 1 - cy);
      h = w / ratio;
      if (h > maxH) {
        h = maxH;
        w = h * ratio;
      }
      if (h < MIN_SIZE) {
        h = MIN_SIZE;
        w = h * ratio;
      }
      y = cy - h / 2;
    }
    return { x: target === LEFT ? right - w : rect.x, y, width: w, height: h };
  }
  if (target === TOP || target === BOTTOM) {
    const bottom = rect.y + rect.height;
    let h =
      target === TOP
        ? bottom - clampW(rect.y + dy, 0, bottom - MIN_SIZE)
        : clampW(bottom + dy, rect.y + MIN_SIZE, 1) - rect.y;
    let w = rect.width;
    let x = rect.x;
    if (ratio > 0) {
      const cx = rect.x + rect.width / 2;
      const maxW = 2 * Math.min(cx, 1 - cx);
      w = h * ratio;
      if (w > maxW) {
        w = maxW;
        h = w / ratio;
      }
      if (w < MIN_SIZE) {
        w = MIN_SIZE;
        h = w / ratio;
      }
      x = cx - w / 2;
    }
    return { x, y: target === TOP ? bottom - h : rect.y, width: w, height: h };
  }
  const left = target === TL || target === BL;
  const top = target === TL || target === TR;
  // The opposite corner stays put.
  const fx = left ? rect.x + rect.width : rect.x;
  const fy = top ? rect.y + rect.height : rect.y;
  const mx = clampW((left ? rect.x : rect.x + rect.width) + dx, 0, 1);
  const my = clampW((top ? rect.y : rect.y + rect.height) + dy, 0, 1);
  const roomX = left ? fx : 1 - fx;
  const roomY = top ? fy : 1 - fy;
  let w = clampW(left ? fx - mx : mx - fx, MIN_SIZE, roomX);
  let h = clampW(top ? fy - my : my - fy, MIN_SIZE, roomY);
  if (ratio > 0) {
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
  return { x: left ? fx - w : fx, y: top ? fy - h : fy, width: w, height: h };
};

/*
 * The crop box over the whole photo, drawn at `width` x `height`. The box follows the
 * finger on the UI thread (the photo under it doesn't change while cropping), and the
 * store gets the new crop when the finger lifts.
 */
export function CropOverlay({ width, height }: { width: number; height: number }) {
  const photo = useCreateStore((s) => s.photo);
  const aspect = useCreateStore((s) => s.edits.crop.aspect);
  const turns = useCreateStore((s) => s.edits.crop.turns);
  const stored = useCreateStore((s) => s.edits.crop.rect);
  const ratio = photo ? (normalisedRatio(photo, { aspect, turns }) ?? 0) : 0;

  const rect = useSharedValue<Rect>(stored);
  const from = useSharedValue<Rect>(stored);
  const target = useSharedValue(NONE);

  // Presets, rotate, flip and undo change the crop from outside.
  useEffect(() => {
    if (target.value === NONE) rect.value = stored;
  }, [stored, rect, target]);

  const save = useCallback((next: Rect) => {
    const { change, commit } = useCreateStore.getState();
    change((ed) => ({ ...ed, crop: { ...ed.crop, rect: next } }));
    commit();
  }, []);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .onBegin((e) => {
          target.value = targetAt(rect.value, e.x, e.y, width, height);
          from.value = rect.value;
        })
        .onUpdate((e) => {
          if (target.value === NONE) return;
          rect.value = resizeRect(
            from.value,
            target.value,
            e.translationX / width,
            e.translationY / height,
            ratio,
          );
        })
        .onFinalize(() => {
          if (target.value === NONE) return;
          target.value = NONE;
          scheduleOnRN(save, rect.value);
        }),
    [width, height, ratio, rect, from, target, save],
  );

  // Every edge computed once and snapped to device pixels, so the dimmed areas meet
  // without a seam.
  const edges = useDerivedValue(() => {
    const snap = (v: number) => Math.round(v * PIXEL) / PIXEL;
    const r = rect.value;
    const left = snap(r.x * width);
    const top = snap(r.y * height);
    return { left, top, right: snap((r.x + r.width) * width), bottom: snap((r.y + r.height) * height) };
  });
  const topDim = useAnimatedStyle(() => ({ height: edges.value.top }));
  const bottomDim = useAnimatedStyle(() => ({
    top: edges.value.bottom,
    height: height - edges.value.bottom,
  }));
  const leftDim = useAnimatedStyle(() => ({
    top: edges.value.top,
    height: edges.value.bottom - edges.value.top,
    width: edges.value.left,
  }));
  const rightDim = useAnimatedStyle(() => ({
    top: edges.value.top,
    height: edges.value.bottom - edges.value.top,
    left: edges.value.right,
    width: width - edges.value.right,
  }));
  const boxStyle = useAnimatedStyle(() => ({
    left: edges.value.left,
    top: edges.value.top,
    width: edges.value.right - edges.value.left,
    height: edges.value.bottom - edges.value.top,
  }));
  // Thirds while dragging.
  const gridStyle = useAnimatedStyle(() => ({ opacity: target.value === NONE ? 0 : 1 }));

  return (
    <GestureDetector gesture={pan}>
      <View style={[StyleSheet.absoluteFill, { width, height }]}>
        <Animated.View style={[styles.dim, { left: 0, top: 0, width }, topDim]} />
        <Animated.View style={[styles.dim, { left: 0, width }, bottomDim]} />
        <Animated.View style={[styles.dim, { left: 0 }, leftDim]} />
        <Animated.View style={[styles.dim, rightDim]} />
        <Animated.View pointerEvents="none" style={[styles.box, boxStyle]}>
          <Animated.View style={[StyleSheet.absoluteFill, gridStyle]}>
            <View style={[styles.gridV, { left: "33.333%" }]} />
            <View style={[styles.gridV, { left: "66.666%" }]} />
            <View style={[styles.gridH, { top: "33.333%" }]} />
            <View style={[styles.gridH, { top: "66.666%" }]} />
          </Animated.View>
          <View style={[styles.corner, { left: -3, top: -3, borderLeftWidth: 3, borderTopWidth: 3 }]} />
          <View style={[styles.corner, { right: -3, top: -3, borderRightWidth: 3, borderTopWidth: 3 }]} />
          <View style={[styles.corner, { left: -3, bottom: -3, borderLeftWidth: 3, borderBottomWidth: 3 }]} />
          <View style={[styles.corner, { right: -3, bottom: -3, borderRightWidth: 3, borderBottomWidth: 3 }]} />
          <View style={[styles.edgeH, { top: -3 }]} />
          <View style={[styles.edgeH, { bottom: -3 }]} />
          <View style={[styles.edgeV, { left: -3 }]} />
          <View style={[styles.edgeV, { right: -3 }]} />
        </Animated.View>
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
  // Grab bars in the middle of each side.
  edgeH: {
    position: "absolute",
    left: "50%",
    marginLeft: -12,
    width: 24,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.text,
  },
  edgeV: {
    position: "absolute",
    top: "50%",
    marginTop: -12,
    width: 4,
    height: 24,
    borderRadius: 2,
    backgroundColor: colors.text,
  },
});
