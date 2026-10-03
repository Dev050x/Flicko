import {
  PaintStyle,
  Skia,
  StrokeCap,
  StrokeJoin,
  type SkCanvas,
  type SkFont,
} from "@shopify/react-native-skia";

import { drawBrackets, drawPlacement } from "@/features/filters/apply-filter";
import { filterById } from "@/features/filters/catalog";
import { layoutFor, type Eyes, type Point, type Rect } from "@/features/filters/placement";

import { photoPaint } from "./adjust";
import { stickerById, type SceneAssets } from "./assets";
import type { Caption, Crop, Edits, Layer, Photo, Stroke, TextLayer } from "./store";

/*
 * One renderer for every view of the meme: the editor canvas, the Preview, the caption
 * card and the full-size export all call `renderScene` with only the target size
 * changing, so what you see is what gets posted.
 *
 * Order: photo (oriented, cropped, filter + adjustments), the catalog filter's overlays,
 * drawing, text and stickers, then the caption.
 */
export interface Scene {
  photo: Photo;
  edits: Edits;
  /** eye pairs in photo pixels, for face filters picked in the editor */
  faces: Eyes[];
  caption?: Caption;
  /** the crop tool shows the whole photo, without layers */
  uncropped?: boolean;
}

export const FULL_RECT = { x: 0, y: 0, width: 1, height: 1 };
const TEXT_SIZE = 0.08;
const STICKER_SIZE = 0.3;
const LINE_HEIGHT = 1.2;
const LABEL_BG = "rgba(14,11,20,0.85)";
const CAPTION_MAX = 0.085;
const CAPTION_WIDTH = 0.9;
const CAPTION_MARGIN = 0.05;

/* ---------- geometry ---------- */

export const orientedSize = (photo: Photo, turns: number) =>
  turns % 2
    ? { width: photo.height, height: photo.width }
    : { width: photo.width, height: photo.height };

export const cropPixels = (photo: Photo, crop: Crop, uncropped = false): Rect => {
  const size = orientedSize(photo, crop.turns);
  const rect = uncropped ? FULL_RECT : crop.rect;
  return {
    x: rect.x * size.width,
    y: rect.y * size.height,
    width: rect.width * size.width,
    height: rect.height * size.height,
  };
};

/** Width / height of the finished image. */
export const sceneAspect = (scene: Scene) => {
  const c = cropPixels(scene.photo, scene.edits.crop, scene.uncropped);
  return c.width / c.height;
};

/** Photo pixel → oriented pixel (quarter turns clockwise, then the flip). */
export const orientPoint = (p: Point, photo: Photo, crop: Crop): Point => {
  let { x, y } = p;
  let height = photo.height;
  let width = photo.width;
  for (let i = 0; i < crop.turns; i++) {
    [x, y] = [height - y, x];
    [width, height] = [height, width];
  }
  return crop.flip ? { x: width - x, y } : { x, y };
};

/** Oriented pixel → photo pixel. */
const unorientPoint = (p: Point, photo: Photo, crop: Crop): Point => {
  const size = orientedSize(photo, crop.turns);
  let x = crop.flip ? size.width - p.x : p.x;
  let y = p.y;
  let width = size.width;
  let height = size.height;
  for (let i = 0; i < crop.turns; i++) {
    [x, y] = [y, width - x];
    [width, height] = [height, width];
  }
  return { x, y };
};

/* Same transform as orientPoint, as canvas operations. */
const applyOrientation = (canvas: SkCanvas, photo: Photo, crop: Crop) => {
  const size = orientedSize(photo, crop.turns);
  if (crop.flip) {
    canvas.translate(size.width, 0);
    canvas.scale(-1, 1);
  }
  if (crop.turns === 1) {
    canvas.translate(photo.height, 0);
    canvas.rotate(90, 0, 0);
  } else if (crop.turns === 2) {
    canvas.translate(photo.width, photo.height);
    canvas.rotate(180, 0, 0);
  } else if (crop.turns === 3) {
    canvas.translate(0, photo.width);
    canvas.rotate(270, 0, 0);
  }
};

/* ---------- text ---------- */

export interface TextMetrics {
  font: SkFont;
  lines: string[];
  widths: number[];
  lineHeight: number;
  baseline: number;
  padX: number;
  padY: number;
  width: number;
  height: number;
}

export const textMetrics = (
  layer: Pick<TextLayer, "text" | "style" | "scale">,
  assets: SceneAssets,
  width: number,
): TextMetrics => {
  const size = layer.scale * width * TEXT_SIZE;
  const font = Skia.Font(assets.fonts[layer.style], size);
  const lines = (layer.text || " ").split("\n");
  const widths = lines.map((line) => font.measureText(line).width);
  const { ascent, descent } = font.getMetrics();
  const lineHeight = size * LINE_HEIGHT;
  const padX = layer.style === "label" ? size * 0.45 : size * 0.1;
  const padY = layer.style === "label" ? size * 0.25 : size * 0.05;
  return {
    font,
    lines,
    widths,
    lineHeight,
    baseline: (lineHeight - (descent - ascent)) / 2 - ascent,
    padX,
    padY,
    width: Math.max(...widths) + padX * 2,
    height: lines.length * lineHeight + padY * 2,
  };
};

/** The unrotated size of a layer on a `width`-wide image. */
export const layerSize = (layer: Layer, assets: SceneAssets, width: number) => {
  if (layer.kind === "text") {
    const m = textMetrics(layer, assets, width);
    return { width: m.width, height: m.height };
  }
  const art = assets.art.get(layer.sticker);
  const w = layer.scale * width * STICKER_SIZE;
  return { width: w, height: art ? (w * art.height()) / art.width() : w };
};

const strokePaint = (color: string, width: number) => {
  const paint = Skia.Paint();
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(width);
  paint.setStrokeJoin(StrokeJoin.Round);
  paint.setStrokeCap(StrokeCap.Round);
  paint.setColor(Skia.Color(color));
  paint.setAntiAlias(true);
  return paint;
};

const fillPaint = (color: string) => {
  const paint = Skia.Paint();
  paint.setColor(Skia.Color(color));
  paint.setAntiAlias(true);
  return paint;
};

const drawText = (
  canvas: SkCanvas,
  layer: TextLayer,
  assets: SceneAssets,
  width: number,
) => {
  const m = textMetrics(layer, assets, width);
  const left = -m.width / 2;
  const top = -m.height / 2;
  if (layer.style === "label") {
    canvas.drawRRect(
      Skia.RRectXY(
        Skia.XYWHRect(left, top, m.width, m.height),
        Math.min(m.height / 2, m.lineHeight / 2 + m.padY),
        Math.min(m.height / 2, m.lineHeight / 2 + m.padY),
      ),
      fillPaint(LABEL_BG),
    );
  }
  const fill = fillPaint(layer.color);
  const outline =
    layer.style === "meme"
      ? strokePaint(
          layer.color.toUpperCase() === "#000000" ? "#FFFFFF" : "#000000",
          m.font.getSize() * 0.14,
        )
      : null;
  m.lines.forEach((line, i) => {
    const x = -m.widths[i] / 2;
    const y = top + m.padY + i * m.lineHeight + m.baseline;
    if (outline) canvas.drawText(line, x, y, outline, m.font);
    canvas.drawText(line, x, y, fill, m.font);
  });
};

/* Classic meme caption: auto-shrunk to fit, centred at the top and bottom. */
const drawCaption = (
  canvas: SkCanvas,
  caption: Caption,
  assets: SceneAssets,
  width: number,
  height: number,
) => {
  const fill = fillPaint("#FFFFFF");
  const lines = [
    { text: caption.top.trim(), top: true },
    { text: caption.bottom.trim(), top: false },
  ];
  for (const { text, top } of lines) {
    if (!text) continue;
    const probe = Skia.Font(assets.fonts.caption, 100);
    const fit = (width * CAPTION_WIDTH * 100) / Math.max(1, probe.measureText(text).width);
    const font = Skia.Font(assets.fonts.caption, Math.min(width * CAPTION_MAX, fit));
    const { ascent, descent } = font.getMetrics();
    const x = (width - font.measureText(text).width) / 2;
    const margin = height * CAPTION_MARGIN;
    const y = top ? margin - ascent : height - margin - descent;
    canvas.drawText(text, x, y, strokePaint("#000000", font.getSize() * 0.16), font);
    canvas.drawText(text, x, y, fill, font);
  }
};

/* ---------- strokes ---------- */

export const strokePath = (stroke: Stroke, width: number, height: number) => {
  const path = Skia.Path.Make();
  const pts = stroke.points;
  const at = (i: number) => ({ x: pts[i * 2] * width, y: pts[i * 2 + 1] * height });
  const count = pts.length / 2;
  if (count === 0) return path;
  const first = at(0);
  path.moveTo(first.x, first.y);
  if (count === 1) {
    path.lineTo(first.x + 0.01, first.y);
    return path;
  }
  for (let i = 1; i < count - 1; i++) {
    const p = at(i);
    const next = at(i + 1);
    path.quadTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2);
  }
  const last = at(count - 1);
  path.lineTo(last.x, last.y);
  return path;
};

/* ---------- the scene ---------- */

/** Overlays and stickers the scene draws, for loadSceneAssets. */
export const sceneArt = (edits: Edits) => {
  const art: { key: unknown; source: import("react-native").ImageSourcePropType }[] = [];
  const overlay = filterById(edits.filterId).overlay;
  if (overlay) art.push({ key: overlay, source: overlay });
  for (const layer of edits.layers) {
    const sticker = layer.kind === "sticker" ? stickerById(layer.sticker) : null;
    if (sticker) art.push({ key: sticker.id, source: sticker.source });
  }
  return art;
};

/*
 * Draws the scene into a `width` x `height` box (the scene's aspect).
 */
export const renderScene = (
  canvas: SkCanvas,
  assets: SceneAssets,
  scene: Scene,
  width: number,
  height: number,
) => {
  const { photo, edits } = scene;
  const crop = edits.crop;
  const c = cropPixels(photo, crop, scene.uncropped);
  const filter = filterById(edits.filterId);

  // The visible area in photo pixels (for the vignette).
  const corners = [
    { x: c.x, y: c.y },
    { x: c.x + c.width, y: c.y + c.height },
  ].map((p) => unorientPoint(p, photo, crop));
  const frame = {
    x: Math.min(corners[0].x, corners[1].x),
    y: Math.min(corners[0].y, corners[1].y),
    width: Math.abs(corners[1].x - corners[0].x),
    height: Math.abs(corners[1].y - corners[0].y),
  };

  canvas.save();
  canvas.scale(width / c.width, height / c.height);
  canvas.translate(-c.x, -c.y);
  applyOrientation(canvas, photo, crop);
  canvas.drawRect(
    Skia.XYWHRect(0, 0, photo.width, photo.height),
    photoPaint(assets.photo, edits.adjust, filter.matrix, frame, c.width / width),
  );
  canvas.restore();
  if (scene.uncropped) return;

  // The editor's catalog filter, laid out on the finished image.
  if (filter.overlay) {
    const toOut = (p: Point): Point => {
      const o = orientPoint(p, photo, crop);
      return {
        x: ((o.x - c.x) * width) / c.width,
        y: ((o.y - c.y) * height) / c.height,
      };
    };
    const faces = scene.faces.map((eyes) => {
      const a = toOut(eyes.left);
      const b = toOut(eyes.right);
      return a.x <= b.x ? { left: a, right: b } : { left: b, right: a };
    });
    const zone = {
      x: width * 0.06,
      y: height * 0.08,
      width: width * 0.88,
      height: height * 0.84,
    };
    const layout = layoutFor(filter, zone, width / 412, { faces });
    if (layout.brackets) drawBrackets(canvas, layout.brackets);
    const art = assets.art.get(filter.overlay);
    if (art) layout.images.forEach((p) => drawPlacement(canvas, art, p));
  }

  for (const stroke of edits.strokes) {
    canvas.drawPath(
      strokePath(stroke, width, height),
      strokePaint(stroke.color, stroke.size * width),
    );
  }

  for (const layer of edits.layers) {
    canvas.save();
    canvas.translate(layer.x * width, layer.y * height);
    canvas.rotate((layer.rotation * 180) / Math.PI, 0, 0);
    if (layer.kind === "text") {
      drawText(canvas, layer, assets, width);
    } else {
      const art = assets.art.get(layer.sticker);
      if (art) {
        const size = layerSize(layer, assets, width);
        canvas.drawImageRect(
          art,
          Skia.XYWHRect(0, 0, art.width(), art.height()),
          Skia.XYWHRect(-size.width / 2, -size.height / 2, size.width, size.height),
          fillPaint("#FFFFFF"),
        );
      }
    }
    canvas.restore();
  }

  if (scene.caption) drawCaption(canvas, scene.caption, assets, width, height);
};
