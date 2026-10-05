/*
 * Live face tracking on MediaPipe instead of ML Kit. Off until it has passed on device
 * (frame processor, fps and fallback checks); with it off the camera behaves as before.
 */
export const FEATURE_MEDIAPIPE_LIVE = false;
