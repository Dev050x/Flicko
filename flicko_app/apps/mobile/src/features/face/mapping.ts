import type { Rect } from "@/features/filters/placement";

/*
 * Detector points to preview pixels, in one place for every live detector:
 *   1. rotate the source frame to upright (`rotation` = clockwise degrees to display it
 *      upright; 90/270 swap the axes),
 *   2. mirror once for the front camera,
 *   3. scale to fill the view ("cover") and centre, cropping the overflow.
 * Points are normalised 0..1 in the source frame; `width`/`height` are that frame's size.
 */
export interface FrameInfo {
  width: number;
  height: number;
  mirrored: boolean;
  rotation: 0 | 90 | 180 | 270;
}

export interface Pt {
  x: number;
  y: number;
}

export const frameToView = (p: Pt, frame: FrameInfo, view: Rect): Pt => {
  let x = p.x;
  let y = p.y;
  switch (frame.rotation) {
    case 90:
      [x, y] = [1 - y, x];
      break;
    case 180:
      [x, y] = [1 - x, 1 - y];
      break;
    case 270:
      [x, y] = [y, 1 - x];
      break;
  }
  if (frame.mirrored) x = 1 - x;
  const swapped = frame.rotation === 90 || frame.rotation === 270;
  const aspect = swapped
    ? frame.height / frame.width
    : frame.width / frame.height;
  const frameH = Math.max(view.height, view.width / aspect);
  const frameW = frameH * aspect;
  return {
    x: view.x + (view.width - frameW) / 2 + x * frameW,
    y: view.y + (view.height - frameH) / 2 + y * frameH,
  };
};
