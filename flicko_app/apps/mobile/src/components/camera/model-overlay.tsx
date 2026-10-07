import { useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import {
  Camera,
  DefaultLight,
  FilamentScene,
  FilamentView,
  ModelRenderer,
  useBuffer,
  useFilamentContext,
  useModel,
} from "react-native-filament";

import { useLiveEyes } from "@/features/face";
import type { Filter } from "@/features/filters/catalog";
import { OneEuro } from "@/features/model3d/smooth";
import { create } from "zustand";

/*
 * A GLB filter drawn by Filament over the live preview, in real 3D. World units are view
 * pixels: the camera looks down -Z from a distance that makes the view exactly fill the
 * frustum at z = 0, so a pixel position from the face tracker maps straight to a world
 * position and the model's scale is a size in pixels.
 *
 * Tracking arrives 7-10 times a second, rendering runs at the display rate. Each detection
 * is smoothed with a One Euro filter per channel; every frame the model eases toward that
 * target, extrapolated a little along its velocity, so the motion is continuous. The
 * pose goes to Filament as one matrix set from JS each frame (no React render). Not
 * through worklets-core shared values: then Filament runs a worklet on its render thread,
 * which Reanimated's Babel plugin compiles for the wrong runtime and crashes. Not through
 * the Model's translate/rotate/scale props either: those multiply onto the current
 * transform instead of replacing it.
 */
const FOCAL_MM = 28;
/** Filament's lens projection: vertical field of view from a 24 mm sensor */
const HALF_SENSOR_MM = 12;

/*
 * Fit settings, tunable live from the dev panel (__DEV__ only) so they can be read off
 * a screenshot and copied back here as defaults.
 */
interface Tuning {
  /** model width as a multiple of the distance between the eyes */
  width: number;
  /** shifts in eye distances: +x right, +y down; z toward the viewer */
  dx: number;
  dy: number;
  dz: number;
  /** flip a rotation if the model turns the wrong way against the head */
  yawSign: number;
  pitchSign: number;
  rollSign: number;
  /** field of view scale; >1 widens, which shrinks things off-centre less */
  fov: number;
  /** head occluder: half-width in eye distances, its front relative to the frame front, on/off */
  headWidth: number;
  headFront: number;
  occluder: number;
}
// From fits on device (2026-10-08): yaw and pitch from MediaPipe are mirrored against
// the model, the lenses sit 0.2 eye distances below the frame's pivot, fov 1.1.
const DEFAULT_TUNING: Tuning = {
  width: 2.2,
  dx: 0,
  dy: 0.2,
  dz: 0,
  yawSign: -1,
  pitchSign: -1,
  rollSign: 1,
  fov: 1.1,
  headWidth: 0.95,
  headFront: -0.15,
  occluder: 1,
};
const useTuning = create<Tuning>(() => DEFAULT_TUNING);

interface Debug {
  eyes: { lx: number; ly: number; rx: number; ry: number } | null;
  raw: { yaw: number; pitch: number; roll: number } | null;
  shown: Pose | null;
  box: { c: Float3; h: Float3 } | null;
  scale: number;
  fps: number;
  detectHz: number;
}
const PREDICT_MAX_S = 0.1;
const FOLLOW_TAU_S = 0.035;
const FADE_TAU_S = 0.08;

type Float3 = [number, number, number];

/*
 * Occluder materials are never released. If their JS wrappers were collected while the
 * head still used them, Filament would abort ("destroying MaterialInstance which is
 * still in use"), and putting the head's own material back on unmount can run after the
 * head itself is gone. One small material per mounted scene is cheap to keep.
 */
const KEEP_ALIVE: unknown[] = [];
const CHANNELS = ["x", "y", "size", "roll", "yaw", "pitch"] as const;
type Pose = Record<(typeof CHANNELS)[number], number>;

export function ModelOverlay({ filter }: { filter: Filter }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [debug, setDebug] = useState<Debug | null>(null);
  const onLayout = (e: LayoutChangeEvent) =>
    setSize({
      w: e.nativeEvent.layout.width,
      h: e.nativeEvent.layout.height,
    });

  return (
    <View
      pointerEvents="box-none"
      style={StyleSheet.absoluteFill}
      onLayout={onLayout}
    >
      {size && filter.model !== undefined && (
        <FilamentScene>
          <Scene
            model={filter.model}
            width={size.w}
            height={size.h}
            onDebug={__DEV__ ? setDebug : undefined}
          />
        </FilamentScene>
      )}
      {__DEV__ && size && (
        <DebugLayer debug={debug} width={size.w} height={size.h} />
      )}
    </View>
  );
}

function Scene({
  model,
  width,
  height,
  onDebug,
}: {
  model: number;
  width: number;
  height: number;
  onDebug?: (d: Debug) => void;
}) {
  const asset = useModel(model);
  const { engine, transformManager, renderableManager } = useFilamentContext();
  const loaded = asset.state === "loaded" ? asset : null;

  // An invisible head (ellipsoid) that writes depth only, so parts of the model behind
  // the head, like the far temple of glasses, are hidden.
  const head = useModel(
    require("../../../assets/filters/models/head-occluder.glb"),
  );
  const headLoaded = head.state === "loaded" ? head : null;
  const occluderMaterial = useBuffer({
    source: require("../../../assets/filters/materials/occluder.filamat"),
  });
  useEffect(() => {
    if (!headLoaded || !occluderMaterial) return;
    const material = engine.createMaterial(occluderMaterial);
    const instance = material.createInstance();
    for (const entity of headLoaded.asset.getRenderableEntities())
      renderableManager.setMaterialInstanceAt(entity, 0, instance);
    KEEP_ALIVE.push(material, instance);
  }, [headLoaded, occluderMaterial, engine, renderableManager]);

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
    let detectHz = 0;
    let fps = 0;
    let rawEyes: Debug["eyes"] = null;
    let rawAngles: Debug["raw"] = null;
    let lastDebug = 0;

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
      // Turning the head shortens the eye line on screen; undo that so the glasses keep
      // their size. The eye line's angle is skewed by yaw, so the tracker's roll wins.
      const yawRad = ((a?.yaw ?? 0) * Math.PI) / 180;
      const raw: Pose = {
        x: (e.left.x + e.right.x) / 2,
        y: (e.left.y + e.right.y) / 2,
        size: Math.hypot(dx, dy) / Math.max(0.5, Math.cos(yawRad)),
        roll: a ? (a.roll * Math.PI) / 180 : Math.atan2(dy, dx),
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
      if (targetAt)
        detectHz = detectHz * 0.8 + (0.2 * 1) / Math.max(1e-3, t - targetAt);
      targetAt = t;
      rawEyes = { lx: e.left.x, ly: e.left.y, rx: e.right.x, ry: e.right.y };
      rawAngles = a ?? null;
    };
    const unsubscribe = useLiveEyes.subscribe(onDetection);
    onDetection();

    let frame = 0;
    let last = Date.now() / 1000;
    const tick = () => {
      const now = Date.now() / 1000;
      const dt = Math.min(0.1, now - last);
      if (dt > 0) fps = fps * 0.9 + (0.1 * 1) / Math.max(1e-3, now - last);
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
      if (shown && loaded) {
        // Pivot on the front of the frame (the bridge sits between the eyes; turning
        // around the box centre swung the frame round the temples' midpoint), fit its
        // width to the face, then size, turn and place it. Each call pre-multiplies, so
        // the steps read in the order they apply.
        const tune = useTuning.getState();
        const box = loaded.boundingBox;
        const eyeDistance = shown.size;
        const s =
          (eyeDistance * tune.width * visible) / (2 * box.halfExtent[0]) + 1e-6;
        // the offsets turn with the head's roll
        const cos = Math.cos(shown.roll);
        const sin = Math.sin(shown.roll);
        const ox = (tune.dx * cos - tune.dy * sin) * eyeDistance;
        const oy = (tune.dx * sin + tune.dy * cos) * eyeDistance;
        const matrix = transformManager
          .createIdentityMatrix()
          .translate([
            -box.center[0],
            -box.center[1],
            -(box.center[2] + box.halfExtent[2]),
          ])
          .scaling([s, s, s])
          .rotate(tune.pitchSign * shown.pitch, [1, 0, 0])
          .rotate(tune.yawSign * shown.yaw, [0, 1, 0])
          .rotate(-tune.rollSign * shown.roll, [0, 0, 1])
          .translate([
            shown.x + ox - width / 2,
            height / 2 - (shown.y + oy),
            tune.dz * eyeDistance,
          ]);
        transformManager.setTransform(loaded.rootEntity, matrix);
        if (headLoaded) {
          // Head proportions from the half-width: taller and deeper than wide; centre a
          // little above the eyes, front just behind the frame.
          const rx =
            tune.headWidth *
              eyeDistance *
              visible *
              Math.max(0, tune.occluder) +
            1e-6;
          const ry = rx * 1.35;
          const rz = rx * 1.25;
          const headMatrix = transformManager
            .createIdentityMatrix()
            .scaling([rx, ry, rz])
            .translate([
              0,
              0.3 * eyeDistance,
              tune.headFront * eyeDistance - rz,
            ])
            .rotate(tune.pitchSign * shown.pitch, [1, 0, 0])
            .rotate(tune.yawSign * shown.yaw, [0, 1, 0])
            .rotate(-tune.rollSign * shown.roll, [0, 0, 1])
            .translate([
              shown.x - width / 2,
              height / 2 - shown.y,
              tune.dz * eyeDistance,
            ]);
          transformManager.setTransform(headLoaded.rootEntity, headMatrix);
        }
        if (onDebug && now - lastDebug > 0.2) {
          lastDebug = now;
          onDebug({
            eyes: rawEyes,
            raw: rawAngles,
            shown: { ...shown },
            box: { c: box.center, h: box.halfExtent },
            scale: s,
            fps,
            detectHz,
          });
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
    };
  }, [width, height, loaded, headLoaded, transformManager, onDebug]);

  const fov = useTuning((t) => t.fov);
  const focal = FOCAL_MM / fov;
  const distance = (height / 2) * (focal / HALF_SENSOR_MM);
  return (
    <FilamentView style={StyleSheet.absoluteFill}>
      <Camera
        focalLengthInMillimeters={focal}
        cameraPosition={[0, 0, distance]}
        cameraTarget={[0, 0, 0]}
        cameraUp={[0, 1, 0]}
        near={distance * 0.1}
        far={distance * 4}
      />
      <DefaultLight />
      <ModelRenderer model={head} />
      <ModelRenderer model={asset} />
    </FilamentView>
  );
}

/*
 * Dev only: markers on the tracked eyes and the model's target, the numbers behind the
 * fit, and buttons to tune it live. Take a screenshot to report a fit.
 */
const deg = (r: number) => ((r * 180) / Math.PI).toFixed(1);
const n = (v: number, d = 0) => v.toFixed(d);

const STEPS: { key: keyof Tuning; label: string; step: number }[] = [
  { key: "width", label: "width", step: 0.1 },
  { key: "dx", label: "x", step: 0.05 },
  { key: "dy", label: "y", step: 0.05 },
  { key: "dz", label: "z", step: 0.25 },
  { key: "fov", label: "fov", step: 0.1 },
  { key: "headWidth", label: "headW", step: 0.05 },
  { key: "headFront", label: "headZ", step: 0.05 },
];
const FLIPS: { key: keyof Tuning; label: string }[] = [
  { key: "yawSign", label: "yaw" },
  { key: "pitchSign", label: "pitch" },
  { key: "rollSign", label: "roll" },
  { key: "occluder", label: "occ" },
];

function DebugLayer({
  debug,
  width,
  height,
}: {
  debug: Debug | null;
  width: number;
  height: number;
}) {
  const tune = useTuning();
  const e = debug?.eyes;
  const p = debug?.shown;
  const set = (patch: Partial<Tuning>) => useTuning.setState(patch);
  const eyeDistance = p ? p.size : 0;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {e && (
        <>
          <Dot x={e.lx} y={e.ly} color="#00e5ff" />
          <Dot x={e.rx} y={e.ry} color="#00e5ff" />
        </>
      )}
      {p && (
        <>
          <Dot x={p.x} y={p.y} color="#ff2d95" />
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: p.x - (eyeDistance * tune.width) / 2,
              top: p.y - 2,
              width: eyeDistance * tune.width,
              height: 4,
              borderColor: "#ffb21a",
              borderWidth: 1,
            }}
          />
        </>
      )}
      <View pointerEvents="none" style={dbg.panel}>
        <Text style={dbg.text}>
          {`view ${n(width)}x${n(height)}  fps ${n(debug?.fps ?? 0)}  det ${n(debug?.detectHz ?? 0, 1)}Hz\n`}
          {e
            ? `eyes L ${n(e.lx)},${n(e.ly)} R ${n(e.rx)},${n(e.ry)}\n`
            : "eyes none\n"}
          {debug?.raw
            ? `raw yaw ${n(debug.raw.yaw, 1)} pitch ${n(debug.raw.pitch, 1)} roll ${n(debug.raw.roll, 1)}\n`
            : "raw -\n"}
          {p
            ? `pose x ${n(p.x)} y ${n(p.y)} eyeDist ${n(p.size)} roll ${deg(p.roll)} yaw ${deg(p.yaw)} pitch ${deg(p.pitch)}\n`
            : "pose -\n"}
          {debug?.box
            ? `box c ${debug.box.c.map((v) => n(v, 2)).join(",")} h ${debug.box.h.map((v) => n(v, 2)).join(",")} s ${n(debug.scale, 2)}\n`
            : "box -\n"}
          {`tune w ${n(tune.width, 2)} x ${n(tune.dx, 2)} y ${n(tune.dy, 2)} z ${n(tune.dz, 2)} fov ${n(tune.fov, 2)} signs ${tune.yawSign},${tune.pitchSign},${tune.rollSign} head ${n(tune.headWidth, 2)},${n(tune.headFront, 2)} occ ${tune.occluder}`}
        </Text>
      </View>
      <View style={dbg.buttons}>
        {STEPS.map(({ key, label, step }) => (
          <View key={key} style={dbg.row}>
            <Btn
              label="-"
              onPress={() => set({ [key]: (tune[key] as number) - step })}
            />
            <Text style={dbg.label}>{label}</Text>
            <Btn
              label="+"
              onPress={() => set({ [key]: (tune[key] as number) + step })}
            />
          </View>
        ))}
        <View style={dbg.row}>
          {FLIPS.map(({ key, label }) => (
            <Btn
              key={key}
              label={`${label}${(tune[key] as number) > 0 ? "+" : "-"}`}
              onPress={() => set({ [key]: -(tune[key] as number) })}
            />
          ))}
        </View>
        <Btn label="reset" onPress={() => useTuning.setState(DEFAULT_TUNING)} />
      </View>
    </View>
  );
}

function Dot({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: x - 4,
        top: y - 4,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: color,
      }}
    />
  );
}

function Btn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={dbg.btn}>
      <Text style={dbg.btnText}>{label}</Text>
    </Pressable>
  );
}

const dbg = StyleSheet.create({
  panel: {
    position: "absolute",
    left: 8,
    right: 8,
    top: 28,
    padding: 6,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  text: { color: "#fff", fontSize: 12, fontFamily: "monospace" },
  // bottom left, above the shutter and filter carousel
  buttons: {
    position: "absolute",
    left: 8,
    bottom: 240,
    padding: 4,
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  label: { color: "#fff", fontSize: 11, width: 36, textAlign: "center" },
  btn: {
    minWidth: 34,
    paddingHorizontal: 6,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
  },
  btnText: { color: "#fff", fontSize: 12 },
});
