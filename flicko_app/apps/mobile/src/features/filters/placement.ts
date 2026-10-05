import type { ImageSourcePropType } from "react-native";

import type { Filter } from "./catalog";

/*
 * Where a filter's content goes. The photo is the whole preview; filter content stays
 * inside the safe zone (clear of the top bar, right rail, label and carousel). The live
 * preview (React Native) and the captured photo (Skia) draw the same placements, with
 * `dp` = pixels per dp (1 on screen, the preview-to-photo scale on the photo), so the
 * result matches the preview.
 */
export interface Point {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Eyes {
  left: Point; // smaller x in the picture
  right: Point;
}

/*
 * A sticker's centre as a fraction of the safe zone, and its scale (1 = 28% of the
 * zone's width). Fractions keep it in the same place on the preview and the photo.
 */
export interface StickerPose {
  x: number;
  y: number;
  scale: number;
}

/*
 * Applied left to right, around the anchor (same order for RN transforms and Skia).
 */
export type Step = { rotate: number } | { mirror: true };

export interface Placement {
  source: ImageSourcePropType;
  /** where the anchor lands */
  x: number;
  y: number;
  width: number;
  height: number;
  /** anchor inside the art, 0..1 */
  anchorX: number;
  anchorY: number;
  steps: Step[];
}

/** Flicko viewfinder corners at the safe zone's corners. */
export interface Brackets {
  rect: Rect;
  stroke: number;
  arm: number;
}

export interface Layout {
  images: Placement[];
  brackets: Brackets | null;
}

/*
 * laser-beam.png is 1024x256 with the beam's source dot at (28, 128); deal-with-it.png
 * is 1024x256 with the glasses centred at (480, 128). Frame text images were cut from
 * 1080-wide frames whose inner width is 960, which sets their width relative to the zone.
 */
const LASER = { anchorX: 28 / 1024, anchorY: 0.5, aspect: 4, angle: -25 };
const GLASSES = { anchorX: 480 / 1024, anchorY: 0.5, aspect: 4, scale: 1.6 };
const FRAME_TEXT: Record<string, { width: number; height: number }> = {
  wagmi: { width: 599, height: 122 },
  "to-the-moon": { width: 848, height: 100 },
  seeker: { width: 764, height: 163 },
};
const FRAME_INNER_WIDTH = 960;
const BRACKET = { stroke: 6, arm: 40 };
const FRAME_TEXT_GAP = 12;
export const STICKER_SIZE = 0.28;
const FACE_LINE = 0.38;

/*
 * Where face overlays go when no face is found: centred, 38% down the safe zone.
 */
export const approxEyes = (zone: Rect): Eyes => {
  const spread = zone.width * 0.12;
  const y = zone.y + zone.height * FACE_LINE;
  const x = zone.x + zone.width / 2;
  return { left: { x: x - spread, y }, right: { x: x + spread, y } };
};

/*
 * A sticker's centre is kept far enough in that the whole sticker stays in the zone.
 */
export const clampSticker = (pose: StickerPose, zone: Rect): StickerPose => {
  const half = (zone.width * STICKER_SIZE * pose.scale) / 2;
  const fx = Math.min(0.5, half / zone.width);
  const fy = Math.min(0.5, half / zone.height);
  return {
    scale: pose.scale,
    x: Math.min(1 - fx, Math.max(fx, pose.x)),
    y: Math.min(1 - fy, Math.max(fy, pose.y)),
  };
};

/** Top-right of the safe zone. */
export const defaultStickerPose = (zone: Rect): StickerPose =>
  clampSticker({ x: 1, y: 0, scale: 1 }, zone);

const degrees = (radians: number) => (radians * 180) / Math.PI;

const faceImages = (
  filter: Filter,
  zone: Rect,
  eyes: Eyes,
  rollOverride?: number,
): Placement[] => {
  const source = filter.overlay!;
  const dx = eyes.right.x - eyes.left.x;
  const dy = eyes.right.y - eyes.left.y;
  const roll = rollOverride ?? degrees(Math.atan2(dy, dx));

  if (filter.id === "laser-eyes") {
    // Beam from each eye centre, 25° up and outward; the left one is mirrored.
    const width = zone.width * 0.9;
    const beam = {
      source,
      width,
      height: width / LASER.aspect,
      anchorX: LASER.anchorX,
      anchorY: LASER.anchorY,
    };
    return [
      {
        ...beam,
        ...eyes.right,
        steps: [{ rotate: roll }, { rotate: LASER.angle }],
      },
      {
        ...beam,
        ...eyes.left,
        steps: [{ rotate: roll }, { mirror: true }, { rotate: LASER.angle }],
      },
    ];
  }

  // Glasses: 1.6 x the eye distance, centred between the eyes, rotated with the head.
  const width = Math.hypot(dx, dy) * GLASSES.scale;
  return [
    {
      source,
      x: eyes.left.x + dx / 2,
      y: eyes.left.y + dy / 2,
      width,
      height: width / GLASSES.aspect,
      anchorX: GLASSES.anchorX,
      anchorY: GLASSES.anchorY,
      steps: [{ rotate: roll }],
    },
  ];
};

/*
 * What a face detector knows about one face. Only the eyes are needed today; `box`, `roll`
 * (degrees, overrides the eye line) and `yaw` are carried for filters that use them. The
 * live preview (view space) and the captured photo (pixel space) both call this with the
 * same fit, so what you see live is what gets saved.
 */
export interface FaceFit {
  eyes: Eyes;
  box?: Rect;
  roll?: number;
  yaw?: number;
}

/*
 * Face overlays for one face in `space` (the safe zone in view or photo pixels).
 */
export const computeFilterPlacement = (
  filter: Filter,
  space: Rect,
  fit: FaceFit,
): Placement[] => faceImages(filter, space, fit.eyes, fit.roll);

/*
 * `faces`: eye pairs to dress (one entry per face). The live preview passes none, so
 * face filters draw nothing until a photo is taken. `centerX`: where frame text is
 * centred (the screen/photo centre; the zone itself is off-centre to clear the rail).
 */
export const layoutFor = (
  filter: Filter,
  zone: Rect,
  dp: number,
  {
    sticker,
    faces = [],
    centerX = zone.x + zone.width / 2,
  }: { sticker?: StickerPose; faces?: Eyes[]; centerX?: number } = {},
): Layout => {
  const source = filter.overlay;
  if (!source) return { images: [], brackets: null };

  if (filter.type === "frame") {
    const art = FRAME_TEXT[filter.id];
    const images: Placement[] = [];
    if (art) {
      // Centred on centerX, never wider than the zone allows on either side of it.
      const room =
        2 * Math.min(centerX - zone.x, zone.x + zone.width - centerX);
      const width = Math.min(
        room,
        (zone.width * art.width) / FRAME_INNER_WIDTH,
      );
      const height = (width * art.height) / art.width;
      images.push({
        source,
        x: centerX,
        y: zone.y + zone.height - FRAME_TEXT_GAP * dp,
        width,
        height,
        anchorX: 0.5,
        anchorY: 1,
        steps: [],
      });
    }
    return {
      images,
      brackets: {
        rect: zone,
        stroke: BRACKET.stroke * dp,
        arm: BRACKET.arm * dp,
      },
    };
  }

  if (filter.type === "sticker") {
    const pose = clampSticker(sticker ?? defaultStickerPose(zone), zone);
    const size = zone.width * STICKER_SIZE * pose.scale;
    return {
      images: [
        {
          source,
          x: zone.x + zone.width * pose.x,
          y: zone.y + zone.height * pose.y,
          width: size,
          height: size,
          anchorX: 0.5,
          anchorY: 0.5,
          steps: [],
        },
      ],
      brackets: null,
    };
  }

  if (filter.type === "face") {
    return {
      images: faces.flatMap((eyes) =>
        computeFilterPlacement(filter, zone, { eyes }),
      ),
      brackets: null,
    };
  }

  return { images: [], brackets: null };
};

/*
 * The four corner paths of the brackets, inset by half the stroke so the whole stroke
 * stays inside the rect. SVG path syntax, shared by react-native-svg and Skia.
 */
export const bracketPaths = ({ rect, stroke, arm }: Brackets) => {
  const h = stroke / 2;
  const l = rect.x + h;
  const t = rect.y + h;
  const r = rect.x + rect.width - h;
  const b = rect.y + rect.height - h;
  return [
    `M ${l} ${t + arm} L ${l} ${t} L ${l + arm} ${t}`,
    `M ${r - arm} ${t} L ${r} ${t} L ${r} ${t + arm}`,
    `M ${l} ${b - arm} L ${l} ${b} L ${l + arm} ${b}`,
    `M ${r - arm} ${b} L ${r} ${b} L ${r} ${b - arm}`,
  ];
};
