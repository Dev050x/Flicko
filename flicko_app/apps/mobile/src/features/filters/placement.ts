import type { ImageSourcePropType } from "react-native";

import type { Filter } from "./catalog";

/*
 * Where a filter's overlay art goes. The live preview (React Native images) and the
 * captured photo (Skia) both draw these placements, so what you see is what you post.
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
 * is 1024x256 with the glasses centred at (480, 128).
 */
const LASER = { anchorX: 28 / 1024, anchorY: 0.5, aspect: 4, angle: -25 };
const GLASSES = { anchorX: 480 / 1024, anchorY: 0.5, aspect: 4, scale: 1.6 };
const STICKER = { size: 0.36, right: 0.04, bottom: 0.2 };

/*
 * Rough eye position for the live view and for photos without a detected face: centred,
 * 42% from the top of the preview.
 */
export const approxEyes = (view: Rect): Eyes => {
  const spread = view.width * 0.12;
  const y = view.y + view.height * 0.42;
  const x = view.x + view.width / 2;
  return { left: { x: x - spread, y }, right: { x: x + spread, y } };
};

const degrees = (radians: number) => (radians * 180) / Math.PI;

export const placementsFor = (
  filter: Filter,
  crop: Rect,
  eyes: Eyes,
): Placement[] => {
  const source = filter.overlay;
  if (!source) return [];

  if (filter.type === "frame") {
    return [
      {
        source,
        x: crop.x,
        y: crop.y,
        width: crop.width,
        height: crop.height,
        anchorX: 0,
        anchorY: 0,
        steps: [],
      },
    ];
  }

  if (filter.type === "sticker") {
    const size = crop.width * STICKER.size;
    return [
      {
        source,
        x: crop.x + crop.width * (1 - STICKER.right) - size,
        y: crop.y + crop.height * (1 - STICKER.bottom) - size,
        width: size,
        height: size,
        anchorX: 0,
        anchorY: 0,
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

/*
 * The part of the preview kept for an aspect ratio (width / height): full width,
 * centred vertically, unless that would be taller than the preview.
 */
export const cropRect = (view: Rect, ratio: number): Rect => {
  let width = view.width;
  let height = width / ratio;
  if (height > view.height) {
    height = view.height;
    width = height * ratio;
  }
  return {
    x: view.x + (view.width - width) / 2,
    y: view.y + (view.height - height) / 2,
    width,
    height,
  };
};
