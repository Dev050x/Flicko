import { Skia } from "@shopify/react-native-skia";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type Ref,
} from "react";
import { StyleSheet, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import {
  Camera,
  usePhotoOutput,
  type FlashMode,
} from "react-native-vision-camera";
import {
  createFaceDetector,
  createFaceDetectorOutput,
  createImageFaceDetector,
} from "react-native-vision-camera-face-detector";
import { SkiaCamera } from "react-native-vision-camera-skia";
import { scheduleOnRN } from "react-native-worklets";

import { matrixTint } from "@/features/filters/catalog";
import type { Eyes } from "@/features/filters/placement";
import type { Facing } from "@/features/camera/settings";
import { mlkitResult, type FaceTrackingResult } from "@/features/face";

export { composePhoto } from "@/features/filters/apply-filter";

/** VisionCamera builds find the eyes in the captured photo. */
export const detectsFaces = true;
/** ...and track them live on the preview (with live filters on). */
export const tracksFaces = true;
export { useCameraPermission } from "react-native-vision-camera";

/*
 * The live camera (VisionCamera 5). With live filters on, frames go through Skia and are
 * drawn with the selected colour matrix; if that takes over 16ms a frame for 2s straight
 * we report `onSlow` and the screen switches to the plain native preview with a static
 * tint (the matrix is still applied to the captured photo). This module needs the
 * native camera stack, so the camera screen only loads it after checking for it.
 */
export interface Shot {
  /** upright file URI, mirrored like the preview on the front camera */
  uri: string;
  width: number;
  height: number;
}

export interface CameraLayerRef {
  capture: (flash: FlashMode) => Promise<Shot>;
}

/** JPEG quality for the captured photo, 0-100 (NitroImage scale). */
const PHOTO_JPEG_QUALITY = 95;
const SLOW_FRAME_MS = 16;
/** Look for faces on every Nth frame (about 10 a second at 30 fps). */
const FACE_EVERY = 3;
const SLOW_FOR_MS = 2000;

export function CameraLayer({
  ref,
  facing,
  active,
  matrix,
  live,
  onSlow,
  trackFaces = false,
  onFaces,
}: {
  ref?: Ref<CameraLayerRef>;
  facing: Facing;
  active: boolean;
  matrix: number[] | undefined;
  live: boolean;
  onSlow: () => void;
  /** look for faces on the preview (a face filter is selected) */
  trackFaces?: boolean;
  /** live eye positions; called about 10 times a second while tracking */
  onFaces?: (result: FaceTrackingResult) => void;
  /** read by the expo-camera fallback; VisionCamera takes the flash per capture */
  flash?: import("@/features/camera/settings").FlashSetting;
}) {
  const photoOutput = usePhotoOutput({ quality: 0.95 });

  useImperativeHandle(
    ref,
    () => ({
      capture: async (flashMode) => {
        const photo = await photoOutput.capturePhoto(
          { flashMode, enableShutterSound: false },
          {},
        );
        try {
          const image = await photo.toImageAsync();
          // NitroImage takes quality as 0-100 (0.95 would round down to 0).
          const path = await image.saveToTemporaryFileAsync("jpg", PHOTO_JPEG_QUALITY);
          return {
            uri: path.startsWith("file://") ? path : `file://${path}`,
            width: image.width,
            height: image.height,
          };
        } finally {
          photo.dispose();
        }
      },
    }),
    [photoOutput],
  );

  const matrixValue = useSharedValue<number[] | null>(matrix ?? null);
  useEffect(() => {
    matrixValue.value = matrix ?? null;
  }, [matrix, matrixValue]);

  // Live face tracking runs in the frame processor; results go to JS.
  const faceDetector = useMemo(
    () =>
      createFaceDetector({
        performanceMode: "fast",
        runLandmarks: true,
        cameraFacing: facing,
      }),
    [facing],
  );
  const tracking = useSharedValue(trackFaces);
  const mirrored = useSharedValue(facing === "front");
  const frameCount = useSharedValue(0);
  const hadFaces = useSharedValue(false);
  useEffect(() => {
    tracking.value = trackFaces;
    mirrored.value = facing === "front";
  }, [trackFaces, facing, tracking, mirrored]);
  const onFacesRef = useRef(onFaces);
  onFacesRef.current = onFaces;
  const reportFaces = useCallback(
    (result: FaceTrackingResult) => onFacesRef.current?.(result),
    [],
  );

  // Plain preview: a face detector output next to the photo output. Its points are in
  // the upright frame (like the Skia path), mapped onto the preview the same way.
  const hadPlainFaces = useRef(false);
  const mirrorMode = facing === "front" ? "on" : "auto";
  const faceOutput = useMemo(
    () =>
      createFaceDetectorOutput({
        performanceMode: "fast",
        runLandmarks: true,
        cameraFacing: facing,
        mirrorMode,
        onFacesDetected(found) {
          const result = mlkitResult(found, facing === "front");
          // Report changes, and one empty result when the faces leave.
          if (result.faces.length === 0 && !hadPlainFaces.current) return;
          hadPlainFaces.current = result.faces.length > 0;
          onFacesRef.current?.(result);
        },
        onError(err) {
          console.warn("[camera] live face detection failed", err);
        },
      }),
    [facing, mirrorMode],
  );

  const slowSince = useSharedValue(0);
  // 0 = not checked yet, 1 = frames can be read, -1 = they can't (stop trying)
  const bufferCheck = useSharedValue(0);
  const onSlowRef = useRef(onSlow);
  onSlowRef.current = onSlow;
  const reportSlow = useCallback(() => onSlowRef.current(), []);

  const onFrame = useCallback(
    (
      frame: Parameters<
        React.ComponentProps<typeof SkiaCamera>["onFrame"]
      >[0],
      render: Parameters<
        React.ComponentProps<typeof SkiaCamera>["onFrame"]
      >[1],
    ) => {
      "worklet";
      if (bufferCheck.value === -1) {
        frame.dispose();
        return;
      }
      if (bufferCheck.value === 0) {
        // The Skia plugin catches render errors and only logs them, once per frame.
        // Read one buffer ourselves first: if that throws (e.g. a build below minSdk 26
        // has no HardwareBuffer support), switch to the plain preview once instead.
        try {
          frame.getNativeBuffer().release();
          bufferCheck.value = 1;
        } catch (err) {
          bufferCheck.value = -1;
          frame.dispose();
          console.warn(`[camera] can't read camera frames (${String(err)}); using plain preview`);
          scheduleOnRN(reportSlow);
          return;
        }
      }
      const start = Date.now();
      render(({ canvas, frameTexture }) => {
        const m = matrixValue.value;
        if (m) {
          const paint = Skia.Paint();
          paint.setColorFilter(Skia.ColorFilter.MakeMatrix(m));
          canvas.drawImage(frameTexture, 0, 0, paint);
        } else {
          canvas.drawImage(frameTexture, 0, 0);
        }
      });
      const renderMs = Date.now() - start;

      // Every few frames, find the eyes (not counted as render time).
      if (tracking.value && ++frameCount.value % FACE_EVERY === 0) {
        try {
          const found = faceDetector.detectFaces(frame);
          const result = mlkitResult(found, mirrored.value);
          // Report changes, and one empty result when the faces leave.
          if (result.faces.length > 0 || hadFaces.value) {
            hadFaces.value = result.faces.length > 0;
            scheduleOnRN(reportFaces, result);
          }
        } catch {
          // A frame the detector can't read: skip it.
        }
      }
      frame.dispose();

      if (renderMs <= SLOW_FRAME_MS) {
        slowSince.value = 0;
      } else if (slowSince.value === 0) {
        slowSince.value = start;
      } else if (start - slowSince.value > SLOW_FOR_MS) {
        slowSince.value = 0;
        scheduleOnRN(reportSlow);
      }
    },
    [
      matrixValue,
      slowSince,
      bufferCheck,
      reportSlow,
      tracking,
      frameCount,
      faceDetector,
      mirrored,
      hadFaces,
      reportFaces,
    ],
  );

  if (live) {
    return (
      <SkiaCamera
        style={StyleSheet.absoluteFill}
        device={facing}
        isActive={active}
        outputs={[photoOutput]}
        onFrame={onFrame}
        // "native" means Android's GPU-only PRIVATE format, which some phones can't
        // stream for frame analysis (CameraX rejects 1280x720 PRIVATE ImageAnalysis);
        // YUV works everywhere and Skia draws it directly.
        pixelFormat="yuv"
        warnIfRenderSkipped={false}
        onError={(err) => {
          // If the Skia pipeline still can't start, use the plain preview + tint.
          console.warn("[camera] live filters unavailable, using plain preview", err);
          reportSlow();
        }}
      />
    );
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={facing}
        isActive={active}
        outputs={trackFaces ? [photoOutput, faceOutput] : [photoOutput]}
        mirrorMode={mirrorMode}
        resizeMode="cover"
      />
      {matrix && (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: matrixTint(matrix) },
          ]}
        />
      )}
    </View>
  );
}

/*
 * Eye centres of every face in a photo (pixel coordinates); empty if none were found.
 */
let detector: ReturnType<typeof createImageFaceDetector> | undefined;

export const detectFaces = (uri: string): Eyes[] => {
  try {
    detector ??= createImageFaceDetector({
      performanceMode: "accurate",
      runLandmarks: true,
    });
    return detector.detectFaces(uri).flatMap((face) => {
      const a = face.landmarks?.LEFT_EYE;
      const b = face.landmarks?.RIGHT_EYE;
      if (!a || !b) return [];
      return [a.x <= b.x ? { left: a, right: b } : { left: b, right: a }];
    });
  } catch (err) {
    console.warn("[camera] face detection failed", err);
    return [];
  }
};
