import { Canvas, Picture, Skia } from "@shopify/react-native-skia";
import { useEffect, useMemo, useState } from "react";
import type { ViewStyle } from "react-native";

import { loadSceneAssets, type SceneAssets } from "@/features/create/assets";
import { renderScene, sceneArt, type Scene } from "@/features/create/scene";

/*
 * Loads what a scene draws (photo, overlays, stickers, fonts). Keeps the last loaded set
 * while a new sticker loads, so the canvas never flashes empty.
 */
export const useSceneAssets = (scene: Scene | null) => {
  const [assets, setAssets] = useState<SceneAssets | null>(null);
  const art = scene ? sceneArt(scene.edits) : [];
  const key = scene ? `${scene.photo.uri}|${art.map((a) => String(a.key)).join(",")}` : "";

  useEffect(() => {
    if (!scene) return;
    let live = true;
    loadSceneAssets(scene.photo.uri, art)
      .then((loaded) => live && setAssets(loaded))
      .catch((err) => console.warn("[create] assets failed to load", err));
    return () => {
      live = false;
    };
    // `key` covers the photo and the art list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return assets;
};

/*
 * The scene drawn at `width` x `height` (same renderer as the export).
 */
export function SceneCanvas({
  scene,
  assets,
  width,
  height,
  style,
}: {
  scene: Scene;
  assets: SceneAssets | null;
  width: number;
  height: number;
  style?: ViewStyle;
}) {
  const picture = useMemo(() => {
    if (!assets || width <= 0 || height <= 0) return null;
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, width, height));
    renderScene(canvas, assets, scene, width, height);
    return recorder.finishRecordingAsPicture();
  }, [assets, scene, width, height]);

  return (
    <Canvas style={[{ width, height }, style]}>
      {picture && <Picture picture={picture} />}
    </Canvas>
  );
}
