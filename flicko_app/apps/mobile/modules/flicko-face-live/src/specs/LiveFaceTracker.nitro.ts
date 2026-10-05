import type { HybridObject } from "react-native-nitro-modules";
import type { Frame } from "react-native-vision-camera";

/*
 * One face from the live MediaPipe Face Landmarker. Everything is normalised 0..1 in the
 * UPRIGHT frame (the sensor rotation is already applied) and is NOT mirrored; the app
 * mirrors once when it maps to the preview.
 */
export interface LiveFace {
  /** [x, y, width, height] from the landmark extents */
  box: number[];
  /** [x, y] iris centres */
  leftEye: number[];
  rightEye: number[];
  /** degrees; roll from the iris line, yaw/pitch from the facial transformation matrix */
  roll: number;
  yaw: number;
  pitch: number;
  /** 4x4 facial transformation matrix, column-major (empty if unavailable) */
  headPose: number[];
  eyeBlinkLeft: number;
  eyeBlinkRight: number;
  /** [x, y, z, ...] 478 points; only filled while landmarks are switched on (debug) */
  landmarks: number[];
}

export interface LiveFaceSnapshot {
  /** increases by one for every new result, 0 before the first */
  seq: number;
  /** ms since boot when the frame was submitted */
  timestampMs: number;
  /** detector time for this result, ms (submit to result) */
  inferenceMs: number;
  /** time to turn the camera frame into the rotated, scaled bitmap, ms */
  prepMs: number;
  /** size of the image the detector saw (upright, downscaled) */
  width: number;
  height: number;
  /** degrees the sensor image was rotated to be upright */
  sensorRotation: number;
  faces: LiveFace[];
}

export interface LiveStats {
  /** frames handed to process() */
  offered: number;
  /** frames sent to the detector */
  processed: number;
  /** frames skipped because one was in flight or faster than the fps cap */
  dropped: number;
  errors: number;
  /** times a frame never produced a result and the tracker unblocked itself */
  stalls: number;
  /** "GPU" | "CPU" | "none" */
  delegate: string;
  /** false once the landmarker could not start or failed repeatedly */
  ready: boolean;
}

export interface LiveFaceTracker extends HybridObject<{ android: "kotlin" }> {
  /**
   * Call for every camera frame. The tracker keeps one frame in flight, drops the rest,
   * caps the rate and returns the sequence number of the latest result.
   */
  process(frame: Frame): number;
  latest(): LiveFaceSnapshot;
  stats(): LiveStats;
  /** include the 478 points in results (debug overlay only) */
  setWantLandmarks(want: boolean): void;
}

export interface LiveFaceTrackerFactory extends HybridObject<{
  android: "kotlin";
}> {
  /** Throws if the model or both delegates fail. */
  create(maxFps: number): LiveFaceTracker;
}
