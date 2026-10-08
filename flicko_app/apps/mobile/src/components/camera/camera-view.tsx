import {
  AlphaType,
  BlendMode,
  ColorType,
  FilterMode,
  MipmapMode,
  Skia,
  useImage,
  type SkCanvas,
  type SkImage,
} from "@shopify/react-native-skia";
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
import { createLiveFaceTracker, type LiveFaceSnapshot } from "flicko-face-live";
import { SkiaCamera } from "react-native-vision-camera-skia";
import { scheduleOnRN } from "react-native-worklets";

import { matrixTint } from "@/features/filters/catalog";
import type { Eyes } from "@/features/filters/placement";
import type { Facing } from "@/features/camera/settings";
import {
  hudEnabled,
  hudNativeStats,
  hudPreviewFps,
  mediapipeResult,
  mlkitResult,
  useFaceFlags,
  useFaceHudSwitch,
  type FaceTrackingResult,
} from "@/features/face";

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

/*
 * Background replacement for filters that have one: in the upright output space (the
 * plugin's orientation transform popped), draw the background, then the camera frame
 * in a layer masked by the person mask (DstIn), so only the person shows over it. The
 * mask comes from the live tracker: upright and unmirrored, so it is mirrored here for
 * a mirrored (front) frame. The newest mask is cached on the worklet runtime's global.
 */
type FrameLike = {
  width: number;
  height: number;
  orientation: "up" | "down" | "left" | "right";
  isMirrored: boolean;
};
const ORIENTATION_DEGREES = { up: 0, right: 90, down: 180, left: 270 };

const applyFrameTransform = (canvas: SkCanvas, frame: FrameLike) => {
  "worklet";
  // Same steps as react-native-vision-camera-skia's renderToTexture.
  const landscape =
    frame.orientation === "left" || frame.orientation === "right";
  const outW = landscape ? frame.height : frame.width;
  const outH = landscape ? frame.width : frame.height;
  canvas.translate(outW / 2, outH / 2);
  if (frame.isMirrored) canvas.scale(-1, 1);
  canvas.rotate((360 - ORIENTATION_DEGREES[frame.orientation]) % 360, 0, 0);
  if (landscape) canvas.translate(-outH / 2, -outW / 2);
  else canvas.translate(-outW / 2, -outH / 2);
};

const drawCover = (canvas: SkCanvas, image: SkImage, w: number, h: number) => {
  "worklet";
  const scale = Math.max(w / image.width(), h / image.height());
  const sw = w / scale;
  const sh = h / scale;
  canvas.drawImageRect(
    image,
    Skia.XYWHRect((image.width() - sw) / 2, (image.height() - sh) / 2, sw, sh),
    Skia.XYWHRect(0, 0, w, h),
    Skia.Paint(),
  );
};

/* The newest person mask as an alpha image on the worklet runtime's global. */
const updateMask = (tracker: {
  latestMask: () => {
    seq: number;
    width: number;
    height: number;
    data: ArrayBuffer;
  };
}) => {
  "worklet";
  const g = globalThis as unknown as {
    __flickoMask?: { seq: number; image: SkImage };
  };
  try {
    const latest = tracker.latestMask();
    if (latest.seq <= 0 || latest.seq === g.__flickoMask?.seq) return;
    const image = Skia.Image.MakeImage(
      {
        width: latest.width,
        height: latest.height,
        colorType: ColorType.Alpha_8,
        alphaType: AlphaType.Premul,
      },
      Skia.Data.fromBytes(new Uint8Array(latest.data)),
      latest.width,
    );
    if (!image) return;
    if (!g.__flickoMask) console.log("[camera] first person mask");
    g.__flickoMask?.image.dispose();
    g.__flickoMask = { seq: latest.seq, image };
  } catch (err) {
    console.warn(`[camera] person mask failed: ${String(err)}`);
  }
};

const drawWithBackground = (
  canvas: SkCanvas,
  frame: FrameLike,
  frameTexture: SkImage,
  framePaint: ReturnType<typeof Skia.Paint>,
  background: SkImage,
  mask: SkImage,
) => {
  "worklet";
  const landscape =
    frame.orientation === "left" || frame.orientation === "right";
  const outW = landscape ? frame.height : frame.width;
  const outH = landscape ? frame.width : frame.height;
  canvas.restore(); // the plugin's orientation transform
  drawCover(canvas, background, outW, outH);
  canvas.saveLayer();
  canvas.save();
  applyFrameTransform(canvas, frame);
  canvas.drawImage(frameTexture, 0, 0, framePaint);
  canvas.restore();
  const maskPaint = Skia.Paint();
  maskPaint.setBlendMode(BlendMode.DstIn);
  canvas.save();
  if (frame.isMirrored) {
    canvas.translate(outW, 0);
    canvas.scale(-1, 1);
  }
  canvas.drawImageRectOptions(
    mask,
    Skia.XYWHRect(0, 0, mask.width(), mask.height()),
    Skia.XYWHRect(0, 0, outW, outH),
    FilterMode.Linear,
    MipmapMode.None,
    maskPaint,
  );
  canvas.restore();
  canvas.restore(); // layer
  canvas.save(); // balances the plugin's restore()
};

export function CameraLayer({
  ref,
  facing,
  active,
  matrix,
  live,
  onSlow,
  trackFaces = false,
  onFaces,
  background,
  wantMesh = false,
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
  onFaces?: (result: FaceTrackingResult, scheduledAt?: number) => void;
  /** image that replaces the background behind the person (live Skia preview only) */
  background?: number;
  /** keep the face mesh in live results (3D filters anchored to the mouth) */
  wantMesh?: boolean;
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
          const path = await image.saveToTemporaryFileAsync(
            "jpg",
            PHOTO_JPEG_QUALITY,
          );
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
  const previewFrames = useSharedValue(0);

  // Live MediaPipe tracking (Skia path only): off unless the flag is on, and ML Kit takes
  // over for the session if it can't start or keeps failing.
  const mediapipeWanted = useFaceFlags(
    (f) => (f.mediapipeLive || f.mediapipeRequired) && !f.mediapipeFailed,
  );
  const hudOn = useFaceHudSwitch((h) => h.debug);
  const liveTracker = useMemo(
    () => (live && mediapipeWanted ? createLiveFaceTracker(30) : null),
    [live, mediapipeWanted],
  );
  useEffect(() => {
    if (live && mediapipeWanted && !liveTracker)
      useFaceFlags.getState().markMediapipeFailed();
  }, [live, mediapipeWanted, liveTracker]);
  useEffect(() => {
    liveTracker?.setWantLandmarks(hudOn || wantMesh);
  }, [liveTracker, hudOn, wantMesh]);
  useEffect(() => {
    liveTracker?.setWantSegmentation(background !== undefined);
  }, [liveTracker, background]);
  const backgroundImage = useImage(background ?? null);
  const backgroundValue = useSharedValue<SkImage | null>(null);
  useEffect(() => {
    backgroundValue.value = background !== undefined ? backgroundImage : null;
  }, [background, backgroundImage, backgroundValue]);
  // HUD on: run ML Kit next to MediaPipe so both can be compared on screen.
  const bothDetectors = useSharedValue(false);
  useEffect(() => {
    bothDetectors.value = hudOn && !!liveTracker;
  }, [bothDetectors, hudOn, liveTracker]);
  const lastSeq = useSharedValue(0);

  // Once a second (JS): preview fps for the HUD, and the native tracker's health.
  useEffect(() => {
    let prev = previewFrames.value;
    const timer = setInterval(() => {
      const now = previewFrames.value;
      if (__DEV__) hudPreviewFps(now - prev);
      prev = now;
      if (liveTracker) {
        const stats = liveTracker.stats();
        if (!stats.ready) {
          console.warn("[camera] MediaPipe live tracking failed; using ML Kit");
          useFaceFlags.getState().markMediapipeFailed();
        }
        if (hudEnabled()) hudNativeStats(stats);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [previewFrames, liveTracker]);
  const hadFaces = useSharedValue(false);
  useEffect(() => {
    tracking.value = trackFaces;
    mirrored.value = facing === "front";
  }, [trackFaces, facing, tracking, mirrored]);
  const onFacesRef = useRef(onFaces);
  onFacesRef.current = onFaces;
  const reportLive = useCallback(
    (snapshot: LiveFaceSnapshot, mirroredFrame: boolean, scheduledAt: number) =>
      onFacesRef.current?.(
        mediapipeResult(snapshot, mirroredFrame),
        scheduledAt,
      ),
    [],
  );
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
      frame: Parameters<React.ComponentProps<typeof SkiaCamera>["onFrame"]>[0],
      render: Parameters<React.ComponentProps<typeof SkiaCamera>["onFrame"]>[1],
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
          console.warn(
            `[camera] can't read camera frames (${String(err)}); using plain preview`,
          );
          scheduleOnRN(reportSlow);
          return;
        }
      }
      previewFrames.value += 1;
      const start = Date.now();
      const bg = backgroundValue.value;
      const g = globalThis as unknown as {
        __flickoMask?: { seq: number; image: SkImage };
        __flickoBgFailed?: boolean;
      };
      const mask =
        bg && !g.__flickoBgFailed ? g.__flickoMask?.image : undefined;
      render(({ canvas, frameTexture }) => {
        const m = matrixValue.value;
        if (bg && mask) {
          const paint = Skia.Paint();
          if (m) paint.setColorFilter(Skia.ColorFilter.MakeMatrix(m));
          try {
            drawWithBackground(canvas, frame, frameTexture, paint, bg, mask);
            return;
          } catch (err) {
            g.__flickoBgFailed = true;
            console.warn(
              `[camera] background compositing failed: ${String(err)}`,
            );
          }
        }
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
      if (liveTracker && tracking.value) {
        try {
          // The tracker drops frames itself (one in flight, 30 fps cap); only a new result
          // crosses to JS.
          const seq = liveTracker.process(frame);
          if (seq !== lastSeq.value) {
            lastSeq.value = seq;
            if (backgroundValue.value) updateMask(liveTracker);
            scheduleOnRN(
              reportLive,
              liveTracker.latest(),
              mirrored.value,
              Date.now(),
            );
          }
        } catch {
          // A frame the tracker can't read: skip it (it retires itself after repeated errors).
        }
      }
      if (
        (!liveTracker || bothDetectors.value) &&
        tracking.value &&
        ++frameCount.value % FACE_EVERY === 0
      ) {
        try {
          const t0 = Date.now();
          const found = faceDetector.detectFaces(frame);
          const result = mlkitResult(found, mirrored.value, Date.now() - t0);
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
      backgroundValue,
      slowSince,
      bufferCheck,
      reportSlow,
      tracking,
      frameCount,
      previewFrames,
      faceDetector,
      mirrored,
      hadFaces,
      reportFaces,
      liveTracker,
      lastSeq,
      reportLive,
      bothDetectors,
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
          console.warn(
            "[camera] live filters unavailable, using plain preview",
            err,
          );
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
