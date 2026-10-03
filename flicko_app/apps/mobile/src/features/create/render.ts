import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { ImageFormat, Skia } from "@shopify/react-native-skia";
import { File, Paths } from "expo-file-system";

import { loadSceneAssets } from "./assets";
import { cropPixels, renderScene, sceneArt, type Scene } from "./scene";

/*
 * Flattens a scene into a JPEG at full resolution (never upscaled, at most `maxEdge` on
 * the long side) with the same renderer the screens use. Returns the file, its bytes and
 * their SHA-256 (the on-chain image hash).
 */
export const LAUNCH_EDGE = 1440;
export const PREVIEW_EDGE = 768;
const JPEG_QUALITY = 90;

export interface Flattened {
  uri: string;
  width: number;
  height: number;
  bytes: Uint8Array;
  hash: string;
}

export const flatten = async (
  scene: Scene,
  maxEdge = LAUNCH_EDGE,
): Promise<Flattened> => {
  const assets = await loadSceneAssets(scene.photo.uri, sceneArt(scene.edits));
  const c = cropPixels(scene.photo, scene.edits.crop);
  const fit = Math.min(1, maxEdge / Math.max(c.width, c.height));
  const width = Math.max(1, Math.round(c.width * fit));
  const height = Math.max(1, Math.round(c.height * fit));

  const surface =
    Skia.Surface.MakeOffscreen(width, height) ?? Skia.Surface.Make(width, height);
  if (!surface) throw new Error("no drawing surface");
  renderScene(surface.getCanvas(), assets, scene, width, height);
  surface.flush();
  const snapshot = surface.makeImageSnapshot();
  const image = snapshot.makeNonTextureImage() ?? snapshot;
  const bytes = image.encodeToBytes(ImageFormat.JPEG, JPEG_QUALITY);

  const file = new File(Paths.cache, `flicko-meme-${Date.now()}.jpg`);
  file.write(bytes);
  return {
    uri: file.uri,
    width,
    height,
    bytes,
    hash: bytesToHex(sha256(bytes)),
  };
};
