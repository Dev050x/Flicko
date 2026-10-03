import { requireOptionalNativeModule } from "expo";

/*
 * Raw native face module (Android, MediaPipe Face Landmarker). App code goes through
 * src/features/face instead of importing this directly. Null where the module isn't in
 * the build (Expo Go, or a development build made before it was added).
 */
export interface NativeFace {
  /** [x, y, z, x, y, z, ...], 478 points, normalised to the displayed photo */
  landmarks: number[];
  /** 4x4 facial transformation matrix, column-major (empty if unavailable) */
  matrix: number[];
  blendshapes: Record<string, number>;
  box: { x: number; y: number; width: number; height: number };
}

export interface NativeDetection {
  faces: NativeFace[];
  /** size of the upright, possibly downscaled image the landmarks refer to */
  width: number;
  height: number;
  decodeMs: number;
  totalMs: number;
  delegate: "GPU" | "CPU" | "NPU";
}

interface FlickoFaceModule {
  detectFaces(uri: string): Promise<NativeDetection>;
}

export default requireOptionalNativeModule<FlickoFaceModule>("FlickoFace");
