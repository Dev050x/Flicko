import { create } from "zustand";

/*
 * Live face tracking on MediaPipe instead of ML Kit. Off by default until it has passed on
 * device (fps and fallback checks); with it off the camera behaves as before.
 */
export const FEATURE_MEDIAPIPE_LIVE = false;

interface FaceFlags {
  mediapipeLive: boolean;
  /** the selected filter needs MediaPipe (3D: face mesh, person mask), flag or not */
  mediapipeRequired: boolean;
  /** MediaPipe could not start or kept failing: ML Kit for the rest of the session */
  mediapipeFailed: boolean;
  markMediapipeFailed: () => void;
}

export const useFaceFlags = create<FaceFlags>((set) => ({
  mediapipeLive: FEATURE_MEDIAPIPE_LIVE,
  mediapipeRequired: false,
  mediapipeFailed: false,
  markMediapipeFailed: () => set({ mediapipeFailed: true }),
}));

/** Which detector drives the overlays right now. */
export const activeSource = (
  flags: Pick<
    FaceFlags,
    "mediapipeLive" | "mediapipeRequired" | "mediapipeFailed"
  >,
) =>
  (flags.mediapipeLive || flags.mediapipeRequired) && !flags.mediapipeFailed
    ? ("mediapipe" as const)
    : ("mlkit" as const);
