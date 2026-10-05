import { NitroModules } from "react-native-nitro-modules";
import type {
  LiveFaceTracker,
  LiveFaceTrackerFactory,
} from "./specs/LiveFaceTracker.nitro";

export * from "./specs/LiveFaceTracker.nitro";

/**
 * A live MediaPipe tracker, or null where the native module isn't in this build or the
 * model can't start (the app then keeps ML Kit).
 */
export const createLiveFaceTracker = (maxFps = 30): LiveFaceTracker | null => {
  try {
    return NitroModules.createHybridObject<LiveFaceTrackerFactory>(
      "LiveFaceTrackerFactory",
    ).create(maxFps);
  } catch (err) {
    console.warn("[face-live] MediaPipe live tracker unavailable", err);
    return null;
  }
};
