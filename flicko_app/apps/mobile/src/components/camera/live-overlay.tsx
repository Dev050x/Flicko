import { Image } from "expo-image";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";

import { hudPlacement, hudRender, useLiveEyes } from "@/features/face";
import type { Filter } from "@/features/filters/catalog";
import {
  bracketPaths,
  layoutFor,
  STICKER_SIZE,
  type Eyes,
  type Placement,
  type Rect,
  type StickerPose,
} from "@/features/filters/placement";
import { colors } from "@/theme";

/*
 * Filter content on the live preview, laid out in the safe zone exactly as it will be
 * baked into the photo: viewfinder brackets + frame text, or the sticker (drag to move,
 * pinch to scale, kept inside the zone). Face filters follow the eyes the camera is
 * tracking live (`faces`, in view coordinates).
 */
const MIN_SCALE = 0.4;
const MAX_SCALE = 2.5;

export function LiveOverlay({
  filter,
  zone,
  centerX,
  sticker,
  onStickerChange,
  faces: facesProp,
}: {
  filter: Filter;
  zone: Rect;
  centerX: number;
  sticker: StickerPose;
  onStickerChange: (pose: StickerPose) => void;
  faces?: Eyes[];
}) {
  // Live eyes come straight from the tracker so only this overlay re-renders per detection.
  const trackedFaces = useLiveEyes((s) => s.eyes);
  const shownAt = useLiveEyes((s) => s.at);
  useEffect(() => {
    if (shownAt > 0) hudRender(Date.now() - shownAt);
  }, [shownAt]);
  const faces = facesProp ?? trackedFaces;
  const layout = layoutFor(filter, zone, 1, { sticker, centerX, faces });
  if (__DEV__ && filter.type === "face" && layout.images[0] && faces[0]) {
    const p = layout.images[0];
    const mid = {
      x: (faces[0].left.x + faces[0].right.x) / 2,
      y: (faces[0].left.y + faces[0].right.y) / 2,
    };
    hudPlacement(
      `art x${p.x.toFixed(0)} y${p.y.toFixed(0)} w${p.width.toFixed(0)} h${p.height.toFixed(0)} rot${JSON.stringify(p.steps)} | eyes mid x${mid.x.toFixed(0)} y${mid.y.toFixed(0)}`,
    );
  }

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {layout.brackets && (
        <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
          {bracketPaths(layout.brackets).map((d) => (
            <Path
              key={d}
              d={d}
              fill="none"
              stroke={colors.text}
              strokeWidth={layout.brackets!.stroke}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </Svg>
      )}
      {filter.type === "sticker" && layout.images[0] ? (
        <DraggableSticker
          placement={layout.images[0]}
          zone={zone}
          pose={sticker}
          onChange={onStickerChange}
        />
      ) : (
        layout.images.map((p, i) => (
          <Image
            key={i}
            source={p.source}
            contentFit="fill"
            pointerEvents="none"
            style={artStyle(p)}
          />
        ))
      )}
    </View>
  );
}

const artStyle = (p: Placement) => ({
  position: "absolute" as const,
  left: p.x - p.anchorX * p.width,
  top: p.y - p.anchorY * p.height,
  width: p.width,
  height: p.height,
  transformOrigin: `${p.anchorX * 100}% ${p.anchorY * 100}% 0`,
  transform: p.steps.map((s) =>
    "mirror" in s ? { scaleX: -1 } : { rotate: `${s.rotate}deg` },
  ),
});

/*
 * Drag to move, pinch to scale, always fully inside the safe zone. The pose is reported
 * as zone fractions when a gesture ends, so the photo uses the same spot and size.
 */
function DraggableSticker({
  placement,
  zone,
  pose,
  onChange,
}: {
  placement: Placement;
  zone: Rect;
  pose: StickerPose;
  onChange: (pose: StickerPose) => void;
}) {
  const base = zone.width * STICKER_SIZE;
  // Centre in screen coordinates.
  const cx = useSharedValue(placement.x);
  const cy = useSharedValue(placement.y);
  const scale = useSharedValue(pose.scale);
  const start = useSharedValue({ x: 0, y: 0, scale: 1 });

  // Follow resets from outside (new filter, layout change).
  useEffect(() => {
    cx.value = placement.x;
    cy.value = placement.y;
    scale.value = pose.scale;
  }, [placement.x, placement.y, pose.scale, cx, cy, scale]);

  const { x: zx, y: zy, width: zw, height: zh } = zone;
  const clampCentre = (x: number, y: number, s: number) => {
    "worklet";
    const half = Math.min((base * s) / 2, zw / 2, zh / 2);
    return {
      x: Math.min(zx + zw - half, Math.max(zx + half, x)),
      y: Math.min(zy + zh - half, Math.max(zy + half, y)),
    };
  };
  const commit = () => {
    "worklet";
    scheduleOnRN(onChange, {
      x: (cx.value - zx) / zw,
      y: (cy.value - zy) / zh,
      scale: scale.value,
    });
  };

  const pan = Gesture.Pan()
    .onBegin(() => {
      start.value = { x: cx.value, y: cy.value, scale: scale.value };
    })
    .onUpdate((e) => {
      const c = clampCentre(
        start.value.x + e.translationX,
        start.value.y + e.translationY,
        scale.value,
      );
      cx.value = c.x;
      cy.value = c.y;
    })
    .onEnd(commit);
  const pinch = Gesture.Pinch()
    .onBegin(() => {
      start.value = { x: cx.value, y: cy.value, scale: scale.value };
    })
    .onUpdate((e) => {
      const maxFit = Math.min(zw, zh) / base;
      scale.value = Math.min(
        MAX_SCALE,
        maxFit,
        Math.max(MIN_SCALE, start.value.scale * e.scale),
      );
      const c = clampCentre(cx.value, cy.value, scale.value);
      cx.value = c.x;
      cy.value = c.y;
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
        style={[
          { position: "absolute", left: 0, top: 0, width: base, height: base },
          style,
        ]}
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
