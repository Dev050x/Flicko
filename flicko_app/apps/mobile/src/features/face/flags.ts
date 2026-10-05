import { create } from "zustand";

/*
 * Live face tracking on MediaPipe instead of ML Kit. Off by default until it has passed on
 * device (fps and fallback checks); with it off the camera behaves as before. The dev menu
 * (/dev/screens) can switch it on for a session without a rebuild.
 */
export const FEATURE_MEDIAPIPE_LIVE = false;

interface FaceFlags {
  mediapipeLive: boolean;
  /** MediaPipe could not start or kept failing: ML Kit for the rest of the session */
  mediapipeFailed: boolean;
  toggleMediapipe: () => void;
  markMediapipeFailed: () => void;
}

export const useFaceFlags = create<FaceFlags>((set) => ({
  mediapipeLive: FEATURE_MEDIAPIPE_LIVE,
  mediapipeFailed: false,
  toggleMediapipe: () =>
    set((s) => ({ mediapipeLive: !s.mediapipeLive, mediapipeFailed: false })),
  markMediapipeFailed: () => set({ mediapipeFailed: true }),
}));

/** Which detector drives the overlays right now. */
export const activeSource = (
  flags: Pick<FaceFlags, "mediapipeLive" | "mediapipeFailed">,
) =>
  flags.mediapipeLive && !flags.mediapipeFailed
    ? ("mediapipe" as const)
    : ("mlkit" as const);
