import { useCallback, useEffect } from "react";
import { create } from "zustand";
import { useSharedValue, type SharedValue } from "react-native-reanimated";
import type { Face as MlKitFace } from "react-native-vision-camera-face-detector";

import type { Eyes, Rect } from "@/features/filters/placement";

import { activeSource, useFaceFlags } from "./flags";
import { hudQueue, hudRecord } from "./hud";
import { frameToView } from "./mapping";

/*
 * Live face tracking on the camera preview. Every detector reports the same
 * FaceTrackingResult (points as fractions of the frame the detector saw, unmirrored;
 * mapping.ts rotates, mirrors once and maps them onto the preview, which "covers" the
 * screen) and smooths the jitter between detections. Overlays read only the result.
 */
export interface FaceTrackingResult {
  /** ms, when the frame was captured */
  timestamp: number;
  source: "mediapipe" | "mlkit";
  /**
   * Points are normalised in the frame as the detector saw it, NOT mirrored; `mirrored`
   * says the preview is (front camera) and mapping applies it once. `rotation` is the
   * clockwise degrees that turn the frame upright (0 when the detector already did).
   */
  frame: {
    width: number;
    height: number;
    mirrored: boolean;
    rotation: 0 | 90 | 180 | 270;
    /** sensor rotation the detector applied itself, for the HUD */
    sensorRotation?: number;
  };
  /** detector time for this frame, ms (dev HUD) */
  inferenceMs?: number;
  /** frame-to-bitmap time, ms (dev HUD, MediaPipe only) */
  prepMs?: number;
  faces: {
    /** normalised 0..1 in the frame; ML Kit fills only the points it has */
    landmarks: { x: number; y: number; z: number }[];
    leftEye: { x: number; y: number };
    rightEye: { x: number; y: number };
    box: { x: number; y: number; width: number; height: number };
    /** degrees */
    roll: number;
    yaw: number;
    pitch: number;
    /** 4x4 column-major, MediaPipe only */
    headPose?: number[];
    /** MediaPipe only */
    blendshapes?: Record<string, number>;
  }[];
}

/**
 * ML Kit faces (pixel coordinates in the upright frame) as a FaceTrackingResult. Runs in
 * the camera's frame processor, so it is a worklet.
 */
export const mlkitResult = (
  found: readonly MlKitFace[],
  mirrored: boolean,
  inferenceMs?: number,
): FaceTrackingResult => {
  "worklet";
  const faces: FaceTrackingResult["faces"] = [];
  let width = 0;
  let height = 0;
  for (const face of found) {
    const a = face.landmarks?.LEFT_EYE;
    const b = face.landmarks?.RIGHT_EYE;
    if (!a || !b || !face.frameWidth || !face.frameHeight) continue;
    width = face.frameWidth;
    height = face.frameHeight;
    const x = (px: number) => px / width;
    const bo = face.bounds ?? { x: 0, y: 0, width: 0, height: 0 };
    faces.push({
      landmarks: [],
      leftEye: { x: x(a.x), y: a.y / height },
      rightEye: { x: x(b.x), y: b.y / height },
      box: {
        x: bo.x / width,
        y: bo.y / height,
        width: bo.width / width,
        height: bo.height / height,
      },
      roll: face.rollAngle ?? 0,
      yaw: face.yawAngle ?? 0,
      pitch: face.pitchAngle ?? 0,
    });
  }
  return {
    timestamp: Date.now(),
    source: "mlkit",
    inferenceMs,
    frame: { width, height, mirrored, rotation: 0 },
    faces,
  };
};

/** A MediaPipe live snapshot (upright, unmirrored) as a FaceTrackingResult. */
export const mediapipeResult = (
  snap: {
    timestampMs: number;
    inferenceMs: number;
    prepMs: number;
    width: number;
    height: number;
    sensorRotation: number;
    faces: {
      box: number[];
      leftEye: number[];
      rightEye: number[];
      roll: number;
      yaw: number;
      pitch: number;
      headPose: number[];
      eyeBlinkLeft: number;
      eyeBlinkRight: number;
      landmarks: number[];
    }[];
  },
  mirrored: boolean,
): FaceTrackingResult => ({
  timestamp: snap.timestampMs,
  source: "mediapipe",
  inferenceMs: snap.inferenceMs,
  prepMs: snap.prepMs,
  frame: {
    width: snap.width,
    height: snap.height,
    mirrored,
    rotation: 0,
    sensorRotation: snap.sensorRotation,
  },
  faces: snap.faces.map((f) => ({
    landmarks: Array.from(
      { length: Math.floor(f.landmarks.length / 3) },
      (_, i) => ({
        x: f.landmarks[i * 3],
        y: f.landmarks[i * 3 + 1],
        z: f.landmarks[i * 3 + 2],
      }),
    ),
    leftEye: { x: f.leftEye[0], y: f.leftEye[1] },
    rightEye: { x: f.rightEye[0], y: f.rightEye[1] },
    box: { x: f.box[0], y: f.box[1], width: f.box[2], height: f.box[3] },
    roll: f.roll,
    yaw: f.yaw,
    pitch: f.pitch,
    headPose: f.headPose.length ? f.headPose : undefined,
    blendshapes: {
      eyeBlinkLeft: f.eyeBlinkLeft,
      eyeBlinkRight: f.eyeBlinkRight,
    },
  })),
});

/** How much of the previous position to keep (0 = no smoothing). */
const SMOOTHING = 0.45;

export const eyesInView = (live: FaceTrackingResult, view: Rect): Eyes[] =>
  live.faces.map((f) => {
    const a = frameToView(f.leftEye, live.frame, view);
    const b = frameToView(f.rightEye, live.frame, view);
    return a.x <= b.x ? { left: a, right: b } : { left: b, right: a };
  });

/** Ease toward the new positions when the same number of faces is still in view. */
const smoothEyes = (previous: Eyes[], next: Eyes[]): Eyes[] => {
  if (previous.length !== next.length) return next;
  const mix = (p: number, n: number) => p * SMOOTHING + n * (1 - SMOOTHING);
  return next.map((eyes, i) => {
    const prev = previous[i];
    return {
      left: {
        x: mix(prev.left.x, eyes.left.x),
        y: mix(prev.left.y, eyes.left.y),
      },
      right: {
        x: mix(prev.right.x, eyes.right.x),
        y: mix(prev.right.y, eyes.right.y),
      },
    };
  });
};

/*
 * The live eyes on the preview (view space, smoothed). They live in a store, not in the
 * camera screen's state, so each detection re-renders only the overlay that draws them
 * instead of the whole screen (at MediaPipe's rate the screen re-render lagged the
 * overlay behind the face).
 */
export const useLiveEyes = create<{ eyes: Eyes[]; at: number }>(() => ({
  eyes: [],
  at: 0,
}));

/**
 * The tracking entry point for the camera screen. `result` holds the latest detector
 * output; detectors call `push` with each result, and only the active detector moves the
 * overlay (via `useLiveEyes`). The eyes are empty while `enabled` is false.
 */
export const useFaceTracking = (
  view: Rect | null,
  enabled: boolean,
): {
  result: SharedValue<FaceTrackingResult | null>;
  push: (result: FaceTrackingResult, scheduledAt?: number) => void;
} => {
  const result = useSharedValue<FaceTrackingResult | null>(null);
  useEffect(() => {
    if (!enabled) {
      useLiveEyes.setState({ eyes: [], at: 0 });
      result.value = null;
    }
  }, [enabled, result]);
  const push = useCallback(
    (next: FaceTrackingResult, scheduledAt?: number) => {
      if (scheduledAt !== undefined) hudQueue(Date.now() - scheduledAt);
      // The HUD sees every detector's results; only the active one moves the overlays.
      hudRecord(next, view);
      if (!view || next.source !== activeSource(useFaceFlags.getState()))
        return;
      result.value = next;
      const mapped = eyesInView(next, view);
      useLiveEyes.setState((s) => ({
        eyes: smoothEyes(s.eyes, mapped),
        at: Date.now(),
      }));
    },
    [view, result],
  );
  return { result, push };
};
