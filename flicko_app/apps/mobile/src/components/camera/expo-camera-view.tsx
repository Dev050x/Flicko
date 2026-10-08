import { CameraView, useCameraPermissions } from "expo-camera";
import { useImperativeHandle, useRef, type Ref } from "react";
import { StyleSheet, View } from "react-native";

import { matrixTint } from "@/features/filters/catalog";
import type { Eyes } from "@/features/filters/placement";
import type { Facing, FlashSetting } from "@/features/camera/settings";

import type { CameraLayerRef } from "./camera-view";

export { composePhoto } from "@/features/filters/apply-filter";

/** No face detection in this fallback. */
export const detectsFaces = false;

/*
 * Fallback camera for builds without VisionCamera (Expo Go): expo-camera preview with
 * the filter shown as a static tint. The captured photo still gets the full matrix and
 * overlays through Skia, which Expo Go includes. No face detection here, so face
 * overlays use the approximate eye position.
 */
export const useCameraPermission = () => {
  const [permission, request] = useCameraPermissions();
  return {
    hasPermission: !!permission?.granted,
    canRequestPermission: permission?.canAskAgain ?? true,
    requestPermission: async () => (await request()).granted,
  };
};

export const detectFaces = (_uri: string): Eyes[] => [];

export function CameraLayer({
  ref,
  facing,
  active,
  matrix,
  flash = "off",
}: {
  ref?: Ref<CameraLayerRef>;
  facing: Facing;
  active: boolean;
  matrix: number[] | undefined;
  live: boolean;
  onSlow: () => void;
  flash?: FlashSetting;
}) {
  const camera = useRef<CameraView>(null);

  useImperativeHandle(ref, () => ({
    capture: async () => {
      const photo = await camera.current?.takePictureAsync({
        quality: 0.92,
        shutterSound: true,
      });
      if (!photo) throw new Error("no photo");
      return { uri: photo.uri, width: photo.width, height: photo.height };
    },
  }));

  return (
    <View style={StyleSheet.absoluteFill}>
      <CameraView
        ref={camera}
        style={StyleSheet.absoluteFill}
        facing={facing}
        active={active}
        flash={facing === "back" ? flash : "off"}
        mirror={facing === "front"}
        animateShutter={false}
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

/** No frame access here, so face filters are placed only after the snap. */
export const tracksFaces = false;
