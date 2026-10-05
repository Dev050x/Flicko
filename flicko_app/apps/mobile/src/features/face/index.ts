import FlickoFace, { type NativeDetection } from "../../../modules/flicko-face";

/*
 * Face API for the app (and later the live tracker and 3D filters). Everything face
 * related goes through here; nothing imports the native module directly.
 */
export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export interface Face {
  /** 478 MediaPipe face mesh points, normalised 0..1 in the displayed photo */
  landmarks: Landmark[];
  /** 4x4 facial transformation matrix, column-major */
  matrix: number[];
  /** 52 blendshape scores, e.g. eyeBlinkLeft, jawOpen, mouthSmileLeft */
  blendshapes: Record<string, number>;
  /** normalised, from the landmark extents */
  box: { x: number; y: number; width: number; height: number };
}

export interface Detection {
  faces: Face[];
  width: number;
  height: number;
  decodeMs: number;
  totalMs: number;
  delegate: NativeDetection["delegate"];
}

export const faceDetectionAvailable = FlickoFace !== null;

/* Set once MediaPipe fails to start; stills then fall back for the rest of the session. */
let failed = false;

const toLandmarks = (flat: number[]): Landmark[] => {
  const points: Landmark[] = new Array(flat.length / 3);
  for (let i = 0; i < points.length; i++) {
    points[i] = { x: flat[i * 3], y: flat[i * 3 + 1], z: flat[i * 3 + 2] };
  }
  return points;
};

/*
 * Detection with timing and the image size the coordinates refer to.
 */
export const detectFacesDetailed = async (
  imageUri: string,
): Promise<Detection | null> => {
  if (!FlickoFace || failed) return null;
  let raw: NativeDetection;
  try {
    raw = await FlickoFace.detectFaces(imageUri);
  } catch (err) {
    // Model or delegate failed (GPU and CPU both): stop trying this session and let
    // callers use the approximate eye position.
    failed = true;
    console.warn("[face] MediaPipe unavailable for this session", err);
    return null;
  }
  return {
    ...raw,
    faces: raw.faces.map((f) => ({
      ...f,
      landmarks: toLandmarks(f.landmarks),
    })),
  };
};

/*
 * Faces in a still photo; empty when none are found or face detection isn't in this
 * build.
 */
export const detectFaces = async (imageUri: string): Promise<Face[]> =>
  (await detectFacesDetailed(imageUri))?.faces ?? [];
export { eyeCenters } from "./geometry";
export { activeSource, FEATURE_MEDIAPIPE_LIVE, useFaceFlags } from "./flags";
export {
  eyesInView,
  mediapipeResult,
  mlkitResult,
  useFaceTracking,
  useLiveEyes,
  type FaceTrackingResult,
} from "./live";
export {
  hudEnabled,
  hudPlacement,
  hudPlacementText,
  hudRender,
  hudLast,
  hudNativeStats,
  hudPreviewFps,
  useFaceHud,
  useFaceHudSwitch,
} from "./hud";
