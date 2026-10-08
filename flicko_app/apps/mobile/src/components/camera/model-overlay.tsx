import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
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
import { create } from "zustand";

import { useLiveEyes } from "@/features/face";
import type {
  Filter,
  ModelPart,
  ScreenSticker,
} from "@/features/filters/catalog";
import { OneEuro } from "@/features/model3d/smooth";

/*
 * A 3D filter over the live preview: GLB parts on the face drawn by Filament in real 3D,
 * plus 2D stickers placed on the screen. World units are view pixels: the camera looks
 * down -Z from a distance that makes the view exactly fill the frustum at z = 0, so a
 * pixel position from the face tracker maps straight to a world position and a model's
 * scale is a size in pixels.
 *
 * Tracking arrives 7-10 times a second, rendering runs at the display rate. Each detection
 * is smoothed with a One Euro filter per channel; every frame the pose eases toward that
 * target, extrapolated a little along its velocity, so the motion is continuous. Each
 * part gets one matrix set from JS per frame (no React render). Not through worklets-core
 * shared values: then Filament runs a worklet on its render thread, which Reanimated's
 * Babel plugin compiles for the wrong runtime and crashes. Not through the Model's
 * translate/rotate/scale props either: those multiply onto the current transform.
 */
const FOCAL_MM = 28;
/** Filament's lens projection: vertical field of view from a 24 mm sensor */
const HALF_SENSOR_MM = 12;
const PREDICT_MAX_S = 0.1;
const FOLLOW_TAU_S = 0.035;
const FADE_TAU_S = 0.08;

type Float3 = [number, number, number];
/** x/y: between the eyes; mx/my: the screen-right mouth corner (view pixels) */
const CHANNELS = [
  "x",
  "y",
  "mx",
  "my",
  "size",
  "roll",
  "yaw",
  "pitch",
] as const;
type Pose = Record<(typeof CHANNELS)[number], number>;

/*
 * Fit settings, tunable live from the dev panel (__DEV__ only) so they can be read off
 * a screenshot and copied back as defaults. Per part: width/offset/rotation (defaults
 * from filters.json); shared: rotation signs, field of view, head occluder.
 */
interface PartTune {
  width: number;
  dx: number;
  dy: number;
  dz: number;
  rx: number;
  ry: number;
  rz: number;
}
interface Tuning {
  /** flip a rotation if the model turns the wrong way against the head */
  yawSign: number;
  pitchSign: number;
  rollSign: number;
  /** field of view scale; >1 widens */
  fov: number;
  /** head occluder: half-width in eye distances, its front relative to the eyes, on/off */
  headWidth: number;
  headFront: number;
  occluder: number;
  parts: PartTune[];
  /** the part the panel edits */
  selected: number;
}
// From fits on device with the neon goggles (2026-10-08): yaw and pitch from MediaPipe
// are mirrored against the model.
const SHARED_DEFAULTS = {
  yawSign: -1,
  pitchSign: -1,
  rollSign: 1,
  fov: 1.3,
  headWidth: 1,
  headFront: 0.35,
  occluder: 1,
};
const partDefaults = (parts: ModelPart[]): PartTune[] =>
  parts.map((p) => ({
    width: p.width,
    dx: p.offset[0],
    dy: p.offset[1],
    dz: p.offset[2],
    rx: p.rotate[0],
    ry: p.rotate[1],
    rz: p.rotate[2],
  }));
const useTuning = create<Tuning>(() => ({
  ...SHARED_DEFAULTS,
  parts: [],
  selected: 0,
}));
const resetTuning = (parts: ModelPart[]) =>
  useTuning.setState({
    ...SHARED_DEFAULTS,
    parts: partDefaults(parts),
    selected: 0,
  });

interface Debug {
  eyes: { lx: number; ly: number; rx: number; ry: number } | null;
  raw: { yaw: number; pitch: number; roll: number } | null;
  shown: Pose | null;
  fps: number;
  detectHz: number;
}

/*
 * Occluder materials are never released. If their JS wrappers were collected while the
 * head still used them, Filament would abort ("destroying MaterialInstance which is
 * still in use"), and putting the head's own material back on unmount can run after the
 * head itself is gone. One small material per mounted scene is cheap to keep.
 */
const KEEP_ALIVE: unknown[] = [];

const deg2rad = (d: number) => (d * Math.PI) / 180;

export function ModelOverlay({ filter }: { filter: Filter }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [debug, setDebug] = useState<Debug | null>(null);
  const parts = filter.parts ?? [];
  useEffect(() => resetTuning(filter.parts ?? []), [filter]);
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
      {size && filter.stickers && (
        <Stickers stickers={filter.stickers} width={size.w} height={size.h} />
      )}
      {size && parts.length > 0 && (
        // The native 3D view would otherwise take every touch (in dev it sits above the
        // camera controls for the debug panel), blocking the filter strip.
        <View
          pointerEvents="none"
          collapsable={false}
          style={StyleSheet.absoluteFill}
        >
          <FilamentScene>
            <Scene
              parts={parts}
              width={size.w}
              height={size.h}
              onDebug={__DEV__ ? setDebug : undefined}
            />
          </FilamentScene>
        </View>
      )}
      {__DEV__ && size && parts.length > 0 && (
        <DebugLayer
          debug={debug}
          parts={parts}
          width={size.w}
          height={size.h}
        />
      )}
    </View>
  );
}

type Loaded = Extract<ReturnType<typeof useModel>, { state: "loaded" }>;

/** Loads one part and reports it to the scene's frame loop. */
function Part({
  part,
  index,
  onLoaded,
}: {
  part: ModelPart;
  index: number;
  onLoaded: (index: number, model: Loaded | null) => void;
}) {
  const model = useModel(part.model);
  const loaded = model.state === "loaded" ? model : null;
  useEffect(() => {
    onLoaded(index, loaded);
    return () => onLoaded(index, null);
  }, [index, loaded, onLoaded]);
  return <ModelRenderer model={model} />;
}

function Scene({
  parts,
  width,
  height,
  onDebug,
}: {
  parts: ModelPart[];
  width: number;
  height: number;
  onDebug?: (d: Debug) => void;
}) {
  const { engine, transformManager, renderableManager } = useFilamentContext();
  const loadedParts = useRef<(Loaded | null)[]>([]);
  const [onLoaded] = useState(() => (index: number, model: Loaded | null) => {
    loadedParts.current[index] = model;
  });

  // An invisible head (ellipsoid) that writes depth only, so parts of a model behind
  // the head (the far arm of glasses, the back of a crown) are hidden.
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
    const velocity: Pose = {
      x: 0,
      y: 0,
      mx: 0,
      my: 0,
      size: 0,
      roll: 0,
      yaw: 0,
      pitch: 0,
    };
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
      const { eyes, angles, mouths } = useLiveEyes.getState();
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
      // Turning the head shortens the eye line on screen; undo that so the parts keep
      // their size. The eye line's angle is skewed by yaw, so the tracker's roll wins.
      const yawRad = deg2rad(a?.yaw ?? 0);
      const x = (e.left.x + e.right.x) / 2;
      const y = (e.left.y + e.right.y) / 2;
      // The mouth corner from the face mesh; without one (ML Kit), where it usually is:
      // 0.4 eye distances right of and 1.2 below the eyes, turned with the head.
      const mouth = mouths[0];
      const eyeLine = Math.hypot(dx, dy);
      const c = Math.cos(Math.atan2(dy, dx));
      const sn = Math.sin(Math.atan2(dy, dx));
      const raw: Pose = {
        x,
        y,
        mx: mouth ? mouth.right.x : x + (0.4 * c - 1.2 * sn) * eyeLine,
        my: mouth ? mouth.right.y : y + (0.4 * sn + 1.2 * c) * eyeLine,
        size: Math.hypot(dx, dy) / Math.max(0.5, Math.cos(yawRad)),
        roll: a ? deg2rad(a.roll) : Math.atan2(dy, dx),
        yaw: yawRad,
        pitch: deg2rad(a?.pitch ?? 0),
      };
      const next = { ...raw };
      for (const c of CHANNELS) next[c] = filters[c].filter(raw[c], t);
      if (target && t > targetAt) {
        const dt = t - targetAt;
        for (const c of CHANNELS) velocity[c] = (next[c] - target[c]) / dt;
      }
      target = next;
      if (targetAt)
        detectHz = detectHz * 0.8 + 0.2 / Math.max(1e-3, t - targetAt);
      targetAt = t;
      rawEyes = { lx: e.left.x, ly: e.left.y, rx: e.right.x, ry: e.right.y };
      rawAngles = a ?? null;
    };
    const unsubscribe = useLiveEyes.subscribe(onDetection);
    onDetection();

    let frame = 0;
    let last = Date.now() / 1000;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      try {
        step();
      } catch (error) {
        // An asset was released under this loop (the model reloaded or the scene is
        // unmounting); stop, the effect starts again with the new one.
        if (String(error).includes("already been manually released")) {
          stopped = true;
          return;
        }
        throw error;
      }
      frame = requestAnimationFrame(tick);
    };

    // The head's rotation then its place on screen; pre-multiplied after a part's own
    // matrix, so offsets given in the head frame turn with the head.
    const placeOnHead = (
      m: ReturnType<typeof transformManager.createIdentityMatrix>,
      tune: Tuning,
      pose: Pose,
      anchor: ModelPart["anchor"] = "eyes",
    ) => {
      const [ax, ay] =
        anchor === "mouth-right" ? [pose.mx, pose.my] : [pose.x, pose.y];
      return m
        .rotate(tune.pitchSign * pose.pitch, [1, 0, 0])
        .rotate(tune.yawSign * pose.yaw, [0, 1, 0])
        .rotate(-tune.rollSign * pose.roll, [0, 0, 1])
        .translate([ax - width / 2, height / 2 - ay, 0]);
    };

    const step = () => {
      const now = Date.now() / 1000;
      const dt = Math.min(0.1, now - last);
      if (dt > 0) fps = fps * 0.9 + 0.1 / Math.max(1e-3, now - last);
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
      if (!shown) return;
      const tune = useTuning.getState();
      const eyeDistance = shown.size;

      parts.forEach((part, i) => {
        const loaded = loadedParts.current[i];
        const t = tune.parts[i];
        if (!loaded || !t) return;
        // Move the pivot point to the origin, turn the model into place, size its
        // largest dimension, then shift it in the head frame (+y is down on screen).
        const box = loaded.boundingBox;
        const h = box.halfExtent;
        const s =
          (eyeDistance * t.width * visible) / (2 * Math.max(h[0], h[1], h[2])) +
          1e-6;
        const matrix = transformManager
          .createIdentityMatrix()
          .translate([
            -(box.center[0] + part.pivot[0] * h[0]),
            -(box.center[1] + part.pivot[1] * h[1]),
            -(box.center[2] + part.pivot[2] * h[2]),
          ])
          .rotate(deg2rad(t.rx), [1, 0, 0])
          .rotate(deg2rad(t.ry), [0, 1, 0])
          .rotate(deg2rad(t.rz), [0, 0, 1])
          .scaling([s, s, s])
          .translate([
            t.dx * eyeDistance,
            -t.dy * eyeDistance,
            t.dz * eyeDistance,
          ]);
        transformManager.setTransform(
          loaded.rootEntity,
          placeOnHead(matrix, tune, shown!, part.anchor),
        );
      });

      if (headLoaded) {
        // Head proportions from the half-width: taller and deeper than wide; centre a
        // little above the eyes, front just behind the eyes' plane plus headFront.
        const rx =
          tune.headWidth * eyeDistance * visible * Math.max(0, tune.occluder) +
          1e-6;
        const ry = rx * 1.35;
        const rz = rx * 1.25;
        const headMatrix = transformManager
          .createIdentityMatrix()
          .scaling([rx, ry, rz])
          .translate([0, 0.3 * eyeDistance, tune.headFront * eyeDistance - rz]);
        transformManager.setTransform(
          headLoaded.rootEntity,
          placeOnHead(headMatrix, tune, shown),
        );
      }

      if (onDebug && now - lastDebug > 0.2) {
        lastDebug = now;
        onDebug({
          eyes: rawEyes,
          raw: rawAngles,
          shown: { ...shown },
          fps,
          detectHz,
        });
      }
    };
    frame = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      unsubscribe();
    };
  }, [parts, width, height, headLoaded, transformManager, onDebug]);

  const fov = useTuning((t) => t.fov);
  const focal = FOCAL_MM / fov;
  const distance = (height / 2) * (focal / HALF_SENSOR_MM);
  return (
    <FilamentView pointerEvents="none" style={StyleSheet.absoluteFill}>
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
      {parts.map((part, i) => (
        <Part key={i} part={part} index={i} onLoaded={onLoaded} />
      ))}
    </FilamentView>
  );
}

/*
 * Screen art around the face, placed by fractions of the preview and drawn in list
 * order (background screens first); some float gently
 * (native-driver loops, each with its own period so they don't move in step).
 */
function Stickers({
  stickers,
  width,
  height,
}: {
  stickers: ScreenSticker[];
  width: number;
  height: number;
}) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {stickers.map((s, i) => (
        <StickerArt
          key={i}
          sticker={s}
          index={i}
          width={width}
          height={height}
        />
      ))}
    </View>
  );
}

function StickerArt({
  sticker,
  index,
  width,
  height,
}: {
  sticker: ScreenSticker;
  index: number;
  width: number;
  height: number;
}) {
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!sticker.bob) return;
    const half = 1300 + (index % 4) * 270;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: 1,
          duration: half,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: half,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob, index, sticker.bob]);

  const source = Image.resolveAssetSource(sticker.image);
  const w = width * sticker.width;
  const h = source?.width ? (w * source.height) / source.width : w;
  return (
    <Animated.Image
      source={sticker.image}
      resizeMode="contain"
      style={{
        position: "absolute",
        left: width * sticker.x - w / 2,
        top: height * sticker.y - h / 2,
        width: w,
        height: h,
        opacity: sticker.opacity,
        transform: [
          {
            translateY: bob.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -10],
            }),
          },
          { rotate: `${sticker.rotate}deg` },
        ],
      }}
    />
  );
}

/*
 * Dev only: markers on the tracked eyes and the head pose, the numbers behind the fit,
 * and buttons to tune the selected part live. Take a screenshot to report a fit.
 */
const deg = (r: number) => ((r * 180) / Math.PI).toFixed(1);
const n = (v: number, d = 0) => v.toFixed(d);

const PART_STEPS: { key: keyof PartTune; label: string; step: number }[] = [
  { key: "width", label: "width", step: 0.1 },
  { key: "dx", label: "x", step: 0.05 },
  { key: "dy", label: "y", step: 0.05 },
  { key: "dz", label: "z", step: 0.1 },
  { key: "rx", label: "rotX", step: 5 },
  { key: "ry", label: "rotY", step: 5 },
  { key: "rz", label: "rotZ", step: 5 },
];
type SharedKey = "fov" | "headWidth" | "headFront";
const SHARED_STEPS: { key: SharedKey; label: string; step: number }[] = [
  { key: "fov", label: "fov", step: 0.1 },
  { key: "headWidth", label: "headW", step: 0.05 },
  { key: "headFront", label: "headZ", step: 0.05 },
];
type FlipKey = "yawSign" | "pitchSign" | "rollSign" | "occluder";
const FLIPS: { key: FlipKey; label: string }[] = [
  { key: "yawSign", label: "yaw" },
  { key: "pitchSign", label: "pitch" },
  { key: "rollSign", label: "roll" },
  { key: "occluder", label: "occ" },
];

/** Hides the panel and markers, leaving one "debug" button to bring them back. */
const useDebugHidden = create<{ hidden: boolean }>(() => ({ hidden: false }));

function DebugLayer({
  debug,
  parts,
  width,
  height,
}: {
  debug: Debug | null;
  parts: ModelPart[];
  width: number;
  height: number;
}) {
  const tune = useTuning();
  const hidden = useDebugHidden((h) => h.hidden);
  const e = debug?.eyes;
  const p = debug?.shown;
  const selected = Math.min(tune.selected, parts.length - 1);
  const part = tune.parts[selected];
  const setPart = (patch: Partial<PartTune>) =>
    useTuning.setState((s) => ({
      parts: s.parts.map((t, i) => (i === selected ? { ...t, ...patch } : t)),
    }));

  if (hidden)
    return (
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <View style={dbg.show}>
          <Btn
            label="debug"
            onPress={() => useDebugHidden.setState({ hidden: false })}
          />
        </View>
      </View>
    );

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {e && (
        <>
          <Dot x={e.lx} y={e.ly} color="#00e5ff" />
          <Dot x={e.rx} y={e.ry} color="#00e5ff" />
        </>
      )}
      {p && <Dot x={p.x} y={p.y} color="#ff2d95" />}
      <View pointerEvents="none" style={dbg.panel}>
        <Text style={dbg.text}>
          {`view ${n(width)}x${n(height)}  fps ${n(debug?.fps ?? 0)}  det ${n(debug?.detectHz ?? 0, 1)}Hz\n`}
          {debug?.raw
            ? `raw yaw ${n(debug.raw.yaw, 1)} pitch ${n(debug.raw.pitch, 1)} roll ${n(debug.raw.roll, 1)}\n`
            : "raw -\n"}
          {p
            ? `pose x ${n(p.x)} y ${n(p.y)} eyeDist ${n(p.size)} roll ${deg(p.roll)} yaw ${deg(p.yaw)} pitch ${deg(p.pitch)}\n`
            : "pose -\n"}
          {`shared fov ${n(tune.fov, 2)} signs ${tune.yawSign},${tune.pitchSign},${tune.rollSign} head ${n(tune.headWidth, 2)},${n(tune.headFront, 2)} occ ${tune.occluder}\n`}
          {tune.parts
            .map(
              (t, i) =>
                `${i === selected ? ">" : " "}${parts[i]?.name ?? i} w ${n(t.width, 2)} x ${n(t.dx, 2)} y ${n(t.dy, 2)} z ${n(t.dz, 2)} r ${t.rx},${t.ry},${t.rz}`,
            )
            .join("\n")}
        </Text>
      </View>
      <View style={dbg.buttons}>
        {parts.length > 1 && (
          <Btn
            label={`part: ${parts[selected]?.name}`}
            onPress={() =>
              useTuning.setState({ selected: (selected + 1) % parts.length })
            }
          />
        )}
        {part &&
          PART_STEPS.map(({ key, label, step }) => (
            <Stepper
              key={key}
              label={label}
              onMinus={() => setPart({ [key]: part[key] - step })}
              onPlus={() => setPart({ [key]: part[key] + step })}
            />
          ))}
        {SHARED_STEPS.map(({ key, label, step }) => (
          <Stepper
            key={key}
            label={label}
            onMinus={() => useTuning.setState({ [key]: tune[key] - step })}
            onPlus={() => useTuning.setState({ [key]: tune[key] + step })}
          />
        ))}
        <View style={dbg.row}>
          {FLIPS.map(({ key, label }) => (
            <Btn
              key={key}
              label={`${label}${tune[key] > 0 ? "+" : "-"}`}
              onPress={() => useTuning.setState({ [key]: -tune[key] })}
            />
          ))}
        </View>
        <View style={dbg.row}>
          <Btn label="reset" onPress={() => resetTuning(parts)} />
          <Btn
            label="hide"
            onPress={() => useDebugHidden.setState({ hidden: true })}
          />
        </View>
      </View>
    </View>
  );
}

function Stepper({
  label,
  onMinus,
  onPlus,
}: {
  label: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <View style={dbg.row}>
      <Btn label="-" onPress={onMinus} />
      <Text style={dbg.label}>{label}</Text>
      <Btn label="+" onPress={onPlus} />
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
    top: 110,
    padding: 6,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  text: { color: "#fff", fontSize: 12, fontFamily: "monospace" },
  // bottom left, above the shutter and filter carousel
  buttons: {
    position: "absolute",
    left: 8,
    bottom: 90,
    padding: 4,
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  show: { position: "absolute", left: 8, bottom: 90 },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    maxWidth: 280,
    alignItems: "center",
    gap: 4,
  },
  label: { color: "#fff", fontSize: 11, width: 40, textAlign: "center" },
  btn: {
    minWidth: 34,
    paddingHorizontal: 6,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
  },
  btnText: { color: "#fff", fontSize: 12 },
});
