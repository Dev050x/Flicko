import {
  ImageFormat,
  Skia,
  type SkCanvas,
  type SkImage,
  type SkPaint,
} from "@shopify/react-native-skia";
import { Asset } from "expo-asset";
import { File, Paths } from "expo-file-system";

import type { Filter } from "./catalog";
import { type Placement, type Rect } from "./placement";

/*
 * Bakes the selected filter into a captured photo: crop to the chosen aspect, apply the
 * colour matrix, then draw the overlay art at the same placements the live view used
 * (face overlays use the detected eyes when there are any). Needs Skia, so it is only
 * loaded with the camera.
 */
const OUTPUT_WIDTH = 1080;
const JPEG_QUALITY = 92;

const overlayCache = new Map<unknown, SkImage>();

const loadOverlay = async (source: Placement["source"]) => {
  const cached = overlayCache.get(source);
  if (cached) return cached;
  const asset = Asset.fromModule(source as number);
  await asset.downloadAsync();
  const data = await Skia.Data.fromURI(asset.localUri ?? asset.uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) throw new Error("overlay could not be decoded");
  overlayCache.set(source, image);
  return image;
};

export const colorPaint = (matrix: number[] | undefined): SkPaint => {
  const paint = Skia.Paint();
  if (matrix) paint.setColorFilter(Skia.ColorFilter.MakeMatrix(matrix));
  return paint;
};

export const drawPlacement = (
  canvas: SkCanvas,
  image: SkImage,
  p: Placement,
) => {
  canvas.save();
  canvas.translate(p.x, p.y);
  for (const step of p.steps) {
    if ("mirror" in step) canvas.scale(-1, 1);
    else canvas.rotate(step.rotate, 0, 0);
  }
  canvas.drawImageRect(
    image,
    Skia.XYWHRect(0, 0, image.width(), image.height()),
    Skia.XYWHRect(
      -p.anchorX * p.width,
      -p.anchorY * p.height,
      p.width,
      p.height,
    ),
    Skia.Paint(),
  );
  canvas.restore();
};

export interface Composed {
  uri: string;
  width: number;
  height: number;
}

/*
 * `crop` and `placements` are in the photo's pixel coordinates.
 */
export const composePhoto = async ({
  photoUri,
  filter,
  crop,
  placements,
}: {
  photoUri: string;
  filter: Filter;
  crop: Rect;
  placements: Placement[];
}): Promise<Composed> => {
  const photo = Skia.Image.MakeImageFromEncoded(
    await Skia.Data.fromURI(photoUri),
  );
  if (!photo) throw new Error("photo could not be decoded");
  const overlays = await Promise.all(
    placements.map((p) => loadOverlay(p.source)),
  );

  const width = OUTPUT_WIDTH;
  const height = Math.round((OUTPUT_WIDTH * crop.height) / crop.width);
  const surface =
    Skia.Surface.MakeOffscreen(width, height) ?? Skia.Surface.Make(width, height);
  if (!surface) throw new Error("no drawing surface");

  const canvas = surface.getCanvas();
  canvas.save();
  canvas.scale(width / crop.width, height / crop.height);
  canvas.translate(-crop.x, -crop.y);
  canvas.drawImage(photo, 0, 0, colorPaint(filter.matrix));
  placements.forEach((p, i) => drawPlacement(canvas, overlays[i], p));
  canvas.restore();
  surface.flush();

  const snapshot = surface.makeImageSnapshot();
  const image = snapshot.makeNonTextureImage() ?? snapshot;
  const bytes = image.encodeToBytes(ImageFormat.JPEG, JPEG_QUALITY);
  const file = new File(Paths.cache, `flicko-${Date.now()}.jpg`);
  file.write(bytes);
  return { uri: file.uri, width, height };
};
