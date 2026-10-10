import { Canvas, Picture, Skia, type SkPicture } from "@shopify/react-native-skia";
import { useEffect, useMemo, useState } from "react";
import type { ViewStyle } from "react-native";

import { loadSceneAssets, type SceneAssets } from "@/features/create/assets";
import { renderScene, sceneArt, type Scene } from "@/features/create/scene";
import { type CreateState, useCreateStore } from "@/features/create/store";

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
 * The editor's assets, from the create store. Only the photo and the list of stickers and
 * overlays matter, so dragging or sliding never reloads them.
 */
export const useEditAssets = () => {
  const photoUri = useCreateStore((s) => s.photo?.uri ?? null);
  const artKey = useCreateStore((s) =>
    sceneArt(s.edits)
      .map((a) => String(a.key))
      .join(","),
  );
  const [assets, setAssets] = useState<SceneAssets | null>(null);

  useEffect(() => {
    if (!photoUri) return;
    let live = true;
    loadSceneAssets(photoUri, sceneArt(useCreateStore.getState().edits))
      .then((loaded) => live && setAssets(loaded))
      .catch((err) => console.warn("[create] assets failed to load", err));
    return () => {
      live = false;
    };
  }, [photoUri, artKey]);

  return assets;
};

const record = (
  scene: Scene,
  assets: SceneAssets,
  width: number,
  height: number,
) => {
  const recorder = Skia.PictureRecorder();
  const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, width, height));
  renderScene(canvas, assets, scene, width, height);
  return recorder.finishRecordingAsPicture();
};

/*
 * The editor's live scene. It follows the create store directly instead of re-rendering
 * with it, and redraws at most once per frame, so sliders, drags and drawing stay smooth.
 * `uncropped` (the crop tool) ignores the crop box, which is drawn over it.
 */
export function LiveSceneCanvas({
  assets,
  width,
  height,
  uncropped = false,
}: {
  assets: SceneAssets | null;
  width: number;
  height: number;
  uncropped?: boolean;
}) {
  const [picture, setPicture] = useState<SkPicture | null>(null);

  useEffect(() => {
    if (!assets || width <= 0 || height <= 0) return;
    const inputs = (s: CreateState) =>
      uncropped
        ? [s.photo, s.edits.adjust, s.edits.filterId, s.edits.crop.turns, s.edits.crop.flip]
        : [s.photo, s.edits, s.faces];
    let frame: number | null = null;
    const draw = () => {
      frame = null;
      const { photo, edits, faces } = useCreateStore.getState();
      if (!photo) return;
      setPicture(
        record({ photo, edits, faces: faces ?? [], uncropped }, assets, width, height),
      );
    };
    draw();
    const unsubscribe = useCreateStore.subscribe((s, prev) => {
      const now = inputs(s);
      const before = inputs(prev);
      if (now.every((v, i) => v === before[i])) return;
      frame ??= requestAnimationFrame(draw);
    });
    return () => {
      unsubscribe();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [assets, width, height, uncropped]);

  return (
    <Canvas style={{ width, height }}>
      {picture && <Picture picture={picture} />}
    </Canvas>
  );
}

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
  const picture = useMemo(
    () =>
      assets && width > 0 && height > 0 ? record(scene, assets, width, height) : null,
    [assets, scene, width, height],
  );

  return (
    <Canvas style={[{ width, height }, style]}>
      {picture && <Picture picture={picture} />}
    </Canvas>
  );
}
