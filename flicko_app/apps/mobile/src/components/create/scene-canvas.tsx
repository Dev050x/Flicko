import { Skia, SkiaPictureView, type SkPicture } from "@shopify/react-native-skia";
import { useEffect, useMemo, useRef, useState } from "react";
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

const FRAME_MS = 16;

/*
 * A Skia view showing `picture`. A <Canvas> kept a stale frame when only its picture
 * changed (its repaint waits for an animation frame, which Android delays during
 * touches), so this view is told to redraw whenever the picture changes.
 */
function PictureView({
  picture,
  style,
}: {
  picture: SkPicture | null;
  style: ViewStyle | ViewStyle[];
}) {
  const view = useRef<SkiaPictureView>(null);
  useEffect(() => {
    view.current?.redraw();
  }, [picture]);
  return <SkiaPictureView ref={view} picture={picture ?? undefined} style={style} />;
}

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
 * with it, and redraws at most every 16ms (plus once more for the last change), so
 * sliders, drags and drawing stay smooth. requestAnimationFrame is not used: on Android it
 * did not fire until the finger lifted, which froze the photo mid-drag.
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
    let last = 0;
    let trailing: ReturnType<typeof setTimeout> | null = null;
    const draw = () => {
      last = Date.now();
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
      const wait = FRAME_MS - (Date.now() - last);
      if (wait <= 0) {
        if (trailing) clearTimeout(trailing);
        trailing = null;
        draw();
      } else {
        trailing ??= setTimeout(() => {
          trailing = null;
          draw();
        }, wait);
      }
    });
    return () => {
      unsubscribe();
      if (trailing) clearTimeout(trailing);
    };
  }, [assets, width, height, uncropped]);

  return <PictureView picture={picture} style={{ width, height }} />;
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

  return <PictureView picture={picture} style={style ? [{ width, height }, style] : { width, height }} />;
}
