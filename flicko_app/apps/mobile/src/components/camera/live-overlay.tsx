import { Image } from "expo-image";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { Glass } from "@/components/ui/glass";
import type { Filter } from "@/features/filters/catalog";
import {
  approxEyes,
  placementsFor,
  STICKER_SIZE,
  type Placement,
  type Rect,
  type StickerPose,
} from "@/features/filters/placement";
import { colors } from "@/theme";

/*
 * What sits on the live preview, all inside the capture rect (the part that is saved):
 * everything outside it is dimmed, thin guides mark its edges, and the filter's art is
 * drawn inside it: frames fitted, face overlays at the rough eye line, and the sticker,
 * which can be dragged and pinched. `faceHint` explains that face overlays snap to the
 * real eyes after capture.
 */
const DIM = "rgba(0,0,0,0.35)";
const GUIDE = "rgba(255,255,255,0.55)";
const MIN_SCALE = 0.4;
const MAX_SCALE = 3;

export function LiveOverlay({
  filter,
  rect,
  sticker,
  onStickerChange,
  faceHint,
}: {
  filter: Filter;
  rect: Rect;
  sticker: StickerPose;
  onStickerChange: (pose: StickerPose) => void;
  faceHint?: string;
}) {
  const placements = placementsFor(filter, rect, approxEyes(rect), sticker);
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {/* Dim outside the capture rect: above, below, left, right. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.dim, { left: 0, right: 0, top: 0, height: rect.y }]} />
        <View style={[styles.dim, { left: 0, right: 0, top: bottom, bottom: 0 }]} />
        <View
          style={[styles.dim, { left: 0, width: rect.x, top: rect.y, height: rect.height }]}
        />
        <View
          style={[styles.dim, { left: right, right: 0, top: rect.y, height: rect.height }]}
        />
        <View
          style={[
            styles.guide,
            { left: rect.x, top: rect.y, width: rect.width, height: rect.height },
          ]}
        />
      </View>

      {/* Overlay art, clipped to the capture rect. */}
      <View
        pointerEvents="box-none"
        style={[
          styles.clip,
          { left: rect.x, top: rect.y, width: rect.width, height: rect.height },
        ]}
      >
        {filter.type === "sticker" && placements[0] ? (
          <DraggableSticker
            placement={placements[0]}
            rect={rect}
            pose={sticker}
            onChange={onStickerChange}
          />
        ) : (
          placements.map((p, i) => (
            <Image
              key={i}
              source={p.source}
              contentFit="fill"
              pointerEvents="none"
              style={artStyle(p, rect)}
            />
          ))
        )}
      </View>

      {faceHint && (
        <View
          pointerEvents="none"
          style={[styles.hintRow, { top: bottom - 12 - 28, left: rect.x, width: rect.width }]}
        >
          <Glass style={styles.hint}>
            <Text style={styles.hintText}>{faceHint}</Text>
          </Glass>
        </View>
      )}

      {__DEV__ && (
        <View
          pointerEvents="none"
          style={[
            styles.debug,
            { left: rect.x, top: rect.y, width: rect.width, height: rect.height },
          ]}
        >
          <Text style={styles.debugText}>
            captureRect {Math.round(rect.width)}×{Math.round(rect.height)}
          </Text>
        </View>
      )}
    </View>
  );
}

/*
 * Position of a placement inside the clip view (which starts at the rect's corner).
 */
const artStyle = (p: Placement, rect: Rect) => ({
  position: "absolute" as const,
  left: p.x - rect.x - p.anchorX * p.width,
  top: p.y - rect.y - p.anchorY * p.height,
  width: p.width,
  height: p.height,
  transformOrigin: `${p.anchorX * 100}% ${p.anchorY * 100}% 0`,
  transform: p.steps.map((s) =>
    "mirror" in s ? { scaleX: -1 } : { rotate: `${s.rotate}deg` },
  ),
});

/*
 * Drag to move, pinch to scale. Kept inside the capture rect; the pose is reported as
 * fractions when a gesture ends so the captured photo uses the same spot.
 */
function DraggableSticker({
  placement,
  rect,
  pose,
  onChange,
}: {
  placement: Placement;
  rect: Rect;
  pose: StickerPose;
  onChange: (pose: StickerPose) => void;
}) {
  const base = rect.width * STICKER_SIZE;
  const cx = useSharedValue(rect.width * pose.x);
  const cy = useSharedValue(rect.height * pose.y);
  const scale = useSharedValue(pose.scale);
  const start = useSharedValue({ x: 0, y: 0, scale: 1 });

  // Follow resets from outside (new filter, new aspect).
  useEffect(() => {
    cx.value = rect.width * pose.x;
    cy.value = rect.height * pose.y;
    scale.value = pose.scale;
  }, [pose, rect.width, rect.height, cx, cy, scale]);

  const width = rect.width;
  const height = rect.height;
  const commit = () => {
    "worklet";
    scheduleOnRN(onChange, {
      x: cx.value / width,
      y: cy.value / height,
      scale: scale.value,
    });
  };

  const pan = Gesture.Pan()
    .onBegin(() => {
      start.value = { x: cx.value, y: cy.value, scale: scale.value };
    })
    .onUpdate((e) => {
      cx.value = Math.min(width, Math.max(0, start.value.x + e.translationX));
      cy.value = Math.min(height, Math.max(0, start.value.y + e.translationY));
    })
    .onEnd(commit);
  const pinch = Gesture.Pinch()
    .onBegin(() => {
      start.value = { x: cx.value, y: cy.value, scale: scale.value };
    })
    .onUpdate((e) => {
      scale.value = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, start.value.scale * e.scale),
      );
    })
    .onEnd(commit);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: cx.value - base / 2 },
      { translateY: cy.value - base / 2 },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>
      <Animated.View
        accessibilityLabel="Sticker, drag to move, pinch to resize"
        style={[{ position: "absolute", left: 0, top: 0, width: base, height: base }, style]}
      >
        <Image
          source={placement.source}
          contentFit="contain"
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  dim: { position: "absolute", backgroundColor: DIM },
  guide: {
    position: "absolute",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: GUIDE,
  },
  clip: { position: "absolute", overflow: "hidden" },
  hintRow: { position: "absolute", alignItems: "center" },
  hint: {
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  hintText: { fontFamily: "DMSans_500Medium", fontSize: 12, color: colors.text },
  debug: {
    position: "absolute",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.accent,
  },
  debugText: {
    position: "absolute",
    left: 4,
    bottom: 2,
    fontFamily: "DMSans_500Medium",
    fontSize: 10,
    color: colors.accent,
  },
});
