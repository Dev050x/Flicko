import { useCallback, useEffect, useState } from "react";
import { useSharedValue, type SharedValue } from "react-native-reanimated";
import type { Face as MlKitFace } from "react-native-vision-camera-face-detector";

import type { Eyes, Rect } from "@/features/filters/placement";

/*
 * Live face tracking on the camera preview. Every detector reports the same
 * FaceTrackingResult (eye centres as fractions of the upright frame, already mirrored like
 * the preview on the front camera); this maps them onto the preview (which "covers" the
 * screen) and smooths the jitter between detections. Overlays read only the result.
 */
export interface FaceTrackingResult {
  /** ms, when the frame was captured */
  timestamp: number;
  source: "mediapipe" | "mlkit";
  frame: {
    width: number;
    height: number;
    mirrored: boolean;
    rotation: 0 | 90 | 180 | 270;
  };
  faces: {
    /** normalised 0..1 in preview space; ML Kit fills only the points it has */
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
    const x = (px: number) => (mirrored ? 1 - px / width : px / width);
    const bo = face.bounds ?? { x: 0, y: 0, width: 0, height: 0 };
    const left = x(bo.x + bo.width);
    faces.push({
      landmarks: [],
      leftEye: { x: x(a.x), y: a.y / height },
      rightEye: { x: x(b.x), y: b.y / height },
      box: {
        x: mirrored ? left : bo.x / width,
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
    frame: { width, height, mirrored, rotation: 0 },
    faces,
  };
};

/** How much of the previous position to keep (0 = no smoothing). */
const SMOOTHING = 0.45;

const eyesInView = (live: FaceTrackingResult, view: Rect): Eyes[] => {
  // The frame covers the view: scale to fill, centre, crop the overflow.
  const aspect = live.frame.width / live.frame.height;
  const frameH = Math.max(view.height, view.width / aspect);
  const frameW = frameH * aspect;
  const offsetX = view.x + (view.width - frameW) / 2;
  const offsetY = view.y + (view.height - frameH) / 2;
  return live.faces.map((f) => {
    const a = {
      x: offsetX + f.leftEye.x * frameW,
      y: offsetY + f.leftEye.y * frameH,
    };
    const b = {
      x: offsetX + f.rightEye.x * frameW,
      y: offsetY + f.rightEye.y * frameH,
    };
    return a.x <= b.x ? { left: a, right: b } : { left: b, right: a };
  });
};

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

/**
 * The tracking state for the camera screen. `result` holds the latest detector output;
 * `eyes` is that mapped onto `view` and smoothed (empty while `enabled` is false);
 * detectors call `push` with each result.
 */
export const useFaceTracking = (
  view: Rect | null,
  enabled: boolean,
): {
  result: SharedValue<FaceTrackingResult | null>;
  eyes: Eyes[];
  push: (result: FaceTrackingResult) => void;
} => {
  const result = useSharedValue<FaceTrackingResult | null>(null);
  const [eyes, setEyes] = useState<Eyes[]>([]);
  useEffect(() => {
    if (!enabled) {
      setEyes([]);
      result.value = null;
    }
  }, [enabled, result]);
  const push = useCallback(
    (next: FaceTrackingResult) => {
      if (!view) return;
      result.value = next;
      const mapped = eyesInView(next, view);
      setEyes((prev) => smoothEyes(prev, mapped));
    },
    [view, result],
  );
  return { result, eyes, push };
};
