import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import {
  Camera,
  DefaultLight,
  FilamentScene,
  FilamentView,
  Model,
} from "react-native-filament";
import { Worklets } from "react-native-worklets-core";

import { useLiveEyes } from "@/features/face";
import type { Filter } from "@/features/filters/catalog";
import { OneEuro } from "@/features/model3d/smooth";

/*
 * A GLB filter drawn by Filament over the live preview, in real 3D. World units are view
 * pixels: the camera looks down -Z from a distance that makes the view exactly fill the
 * frustum at z = 0, so a pixel position from the face tracker maps straight to a world
 * position and the model's scale is a size in pixels.
 *
 * Tracking arrives 7-10 times a second, rendering runs at the display rate. Each detection
 * is smoothed with a One Euro filter per channel; every frame the model eases toward that
 * target, extrapolated a little along its velocity, so the motion is continuous. The
 * pose goes to Filament through shared values, no React render per frame.
 */
const FOCAL_MM = 28;
/** Filament's lens projection: vertical field of view from a 24 mm sensor */
const HALF_SENSOR_MM = 12;
/** Glasses' width as a multiple of the distance between the eyes */
const WIDTH_PER_EYE_DISTANCE = 2.2;
/** flip if the model turns the wrong way against the head */
const YAW_SIGN = 1;
const PITCH_SIGN = 1;
const PREDICT_MAX_S = 0.1;
const FOLLOW_TAU_S = 0.035;
const FADE_TAU_S = 0.08;

type Float3 = [number, number, number];
const CHANNELS = ["x", "y", "size", "roll", "yaw", "pitch"] as const;
type Pose = Record<(typeof CHANNELS)[number], number>;

export function ModelOverlay({ filter }: { filter: Filter }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) =>
    setSize({
      w: e.nativeEvent.layout.width,
      h: e.nativeEvent.layout.height,
    });

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={onLayout}
    >
      {size && filter.model !== undefined && (
        <Scene model={filter.model} width={size.w} height={size.h} />
      )}
    </View>
  );
}

function Scene({
  model,
  width,
  height,
}: {
  model: number;
  width: number;
  height: number;
}) {
  const shared = useMemo(
    () => ({
      translate: Worklets.createSharedValue<Float3>([0, 0, 0]),
      scale: Worklets.createSharedValue<Float3>([1e-4, 1e-4, 1e-4]),
      rotate: Worklets.createSharedValue<Float3>([0, 0, 0]),
    }),
    [],
  );

  useEffect(() => {
    const filters = Object.fromEntries(
      CHANNELS.map((c) => [c, new OneEuro()]),
    ) as Record<keyof Pose, OneEuro>;
    let target: Pose | null = null; // filtered, at the last detection
    let velocity: Pose = { x: 0, y: 0, size: 0, roll: 0, yaw: 0, pitch: 0 };
    let targetAt = 0;
    let shown: Pose | null = null;
    let visible = 0; // 0..1
    let present = false;

    const onDetection = () => {
      const { eyes, angles } = useLiveEyes.getState();
      const e = eyes[0];
      present = !!e;
      if (!e) {
        CHANNELS.forEach((c) => filters[c].reset());
        target = null;
        return;
      }
      const t = Date.now() / 1000;
      const dx = e.right.x - e.left.x;
      const dy = e.right.y - e.left.y;
      const a = angles[0];
      const raw: Pose = {
        x: (e.left.x + e.right.x) / 2,
        y: (e.left.y + e.right.y) / 2,
        size: Math.hypot(dx, dy) * WIDTH_PER_EYE_DISTANCE,
        roll: Math.atan2(dy, dx),
        yaw: ((a?.yaw ?? 0) * Math.PI) / 180,
        pitch: ((a?.pitch ?? 0) * Math.PI) / 180,
      };
      const next = { ...raw };
      for (const c of CHANNELS) next[c] = filters[c].filter(raw[c], t);
      if (target && t > targetAt) {
        const dt = t - targetAt;
        for (const c of CHANNELS) velocity[c] = (next[c] - target[c]) / dt;
      }
      target = next;
      targetAt = t;
    };
    const unsubscribe = useLiveEyes.subscribe(onDetection);
    onDetection();

    let frame = 0;
    let last = Date.now() / 1000;
    const tick = () => {
      const now = Date.now() / 1000;
      const dt = Math.min(0.1, now - last);
      last = now;
      visible +=
        ((present ? 1 : 0) - visible) * (1 - Math.exp(-dt / FADE_TAU_S));
      if (target) {
        const ahead = Math.min(PREDICT_MAX_S, now - targetAt);
        const goal = { ...target };
        for (const c of CHANNELS) goal[c] = target[c] + velocity[c] * ahead;
        if (!shown) shown = { ...goal };
        const k = 1 - Math.exp(-dt / FOLLOW_TAU_S);
        for (const c of CHANNELS) shown[c] += (goal[c] - shown[c]) * k;
      }
      if (shown) {
        const s = shown.size * visible + 1e-4;
        shared.translate.value = [shown.x - width / 2, height / 2 - shown.y, 0];
        shared.scale.value = [s, s, s];
        shared.rotate.value = [
          PITCH_SIGN * shown.pitch,
          YAW_SIGN * shown.yaw,
          -shown.roll,
        ];
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
    };
  }, [shared, width, height]);

  const distance = (height / 2) * (FOCAL_MM / HALF_SENSOR_MM);
  return (
    <FilamentScene>
      <FilamentView style={StyleSheet.absoluteFill}>
        <Camera
          focalLengthInMillimeters={FOCAL_MM}
          cameraPosition={[0, 0, distance]}
          cameraTarget={[0, 0, 0]}
          cameraUp={[0, 1, 0]}
          near={distance * 0.1}
          far={distance * 4}
        />
        <DefaultLight />
        <Model
          source={model}
          transformToUnitCube
          translate={shared.translate}
          scale={shared.scale}
          rotate={shared.rotate}
        />
      </FilamentView>
    </FilamentScene>
  );
}
