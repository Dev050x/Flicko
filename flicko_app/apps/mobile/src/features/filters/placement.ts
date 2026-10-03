import type { ImageSourcePropType } from "react-native";

import type { Filter } from "./catalog";

/*
 * Where a filter's overlay art goes, always inside the capture rect (the part of the
 * preview that is saved). The live preview (React Native images) and the captured
 * photo (Skia) both draw these placements, so what you see is what you post.
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
 * A sticker's centre as a fraction of the capture rect, and its scale (1 = 28% of the
 * rect's width). Fractions keep it in the same place on the preview and the photo.
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

/*
 * laser-beam.png is 1024x256 with the beam's source dot at (28, 128); deal-with-it.png
 * is 1024x256 with the glasses centred at (480, 128). Frames are 1080x1350 (4:5) and
 * are fitted inside the rect, never stretched; stickers are square.
 */
const LASER = { anchorX: 28 / 1024, anchorY: 0.5, aspect: 4, angle: -25 };
const GLASSES = { anchorX: 480 / 1024, anchorY: 0.5, aspect: 4, scale: 1.6 };
const FRAME_ASPECT = 1080 / 1350;
export const STICKER_SIZE = 0.28;
const STICKER_INSET = 0.04;
const FACE_LINE = 0.38;

/*
 * Rough eye position until a face is detected (the live view, and photos without one):
 * centred, 38% down the capture rect.
 */
export const approxEyes = (rect: Rect): Eyes => {
  const spread = rect.width * 0.12;
  const y = rect.y + rect.height * FACE_LINE;
  const x = rect.x + rect.width / 2;
  return { left: { x: x - spread, y }, right: { x: x + spread, y } };
};

/*
 * Top-right of the rect. `clearBelow` (screen y) keeps the sticker under controls that
 * overlap the rect's top, like the right rail.
 */
export const defaultStickerPose = (rect: Rect, clearBelow = rect.y): StickerPose => {
  const size = rect.width * STICKER_SIZE;
  const inset = rect.width * STICKER_INSET;
  const top = Math.max(rect.y + inset, clearBelow);
  return {
    x: (rect.width - inset - size / 2) / rect.width,
    y: Math.min(1, (top - rect.y + size / 2) / rect.height),
    scale: 1,
  };
};

/*
 * The largest rect of `aspect` (width / height) that fits inside `box`, centred.
 */
export const containRect = (box: Rect, aspect: number): Rect => {
  let width = box.width;
  let height = width / aspect;
  if (height > box.height) {
    height = box.height;
    width = height * aspect;
  }
  return {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  };
};

const degrees = (radians: number) => (radians * 180) / Math.PI;

export const placementsFor = (
  filter: Filter,
  crop: Rect,
  eyes: Eyes,
  sticker?: StickerPose,
): Placement[] => {
  const source = filter.overlay;
  if (!source) return [];

  if (filter.type === "frame") {
    const fit = containRect(crop, FRAME_ASPECT);
    return [
      {
        source,
        x: fit.x,
        y: fit.y,
        width: fit.width,
        height: fit.height,
        anchorX: 0,
        anchorY: 0,
        steps: [],
      },
    ];
  }

  if (filter.type === "sticker") {
    const pose = sticker ?? defaultStickerPose(crop);
    const size = crop.width * STICKER_SIZE * pose.scale;
    return [
      {
        source,
        x: crop.x + crop.width * pose.x,
        y: crop.y + crop.height * pose.y,
        width: size,
        height: size,
        anchorX: 0.5,
        anchorY: 0.5,
        steps: [],
      },
    ];
  }

  if (filter.type !== "face") return [];

  const dx = eyes.right.x - eyes.left.x;
  const dy = eyes.right.y - eyes.left.y;
  const distance = Math.hypot(dx, dy);
  const roll = degrees(Math.atan2(dy, dx));

  if (filter.id === "laser-eyes") {
    // Beam from each eye centre, 25° up and outward; the left one is mirrored.
    const width = crop.width * 0.9;
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
  const width = distance * GLASSES.scale;
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
