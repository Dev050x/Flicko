import type { Eyes, Rect } from "@/features/filters/placement";

/*
 * Live face tracking on the camera preview. The camera's frame processor finds faces on
 * every few frames and reports their eye centres as fractions of the upright frame,
 * already mirrored like the preview on the front camera; this maps them onto the
 * preview (which "covers" the screen) and smooths the jitter between detections.
 */
export interface LiveFaces {
  kind: "frame";
  /** eye pairs, 0..1 of the upright frame, as the preview shows it */
  faces: { lx: number; ly: number; rx: number; ry: number }[];
  /** upright frame width / height */
  aspect: number;
}

/** How much of the previous position to keep (0 = no smoothing). */
const SMOOTHING = 0.45;

export const liveEyesInView = (live: LiveFaces, view: Rect): Eyes[] => {
  // The frame covers the view: scale to fill, centre, crop the overflow.
  const frameH = Math.max(view.height, view.width / live.aspect);
  const frameW = frameH * live.aspect;
  const offsetX = view.x + (view.width - frameW) / 2;
  const offsetY = view.y + (view.height - frameH) / 2;
  return live.faces.map((f) => {
    const a = { x: offsetX + f.lx * frameW, y: offsetY + f.ly * frameH };
    const b = { x: offsetX + f.rx * frameW, y: offsetY + f.ry * frameH };
    return a.x <= b.x ? { left: a, right: b } : { left: b, right: a };
  });
};

/** Ease toward the new positions when the same number of faces is still in view. */
export const smoothEyes = (previous: Eyes[], next: Eyes[]): Eyes[] => {
  if (previous.length !== next.length) return next;
  const mix = (p: number, n: number) => p * SMOOTHING + n * (1 - SMOOTHING);
  return next.map((eyes, i) => {
    const prev = previous[i];
    return {
      left: { x: mix(prev.left.x, eyes.left.x), y: mix(prev.left.y, eyes.left.y) },
      right: { x: mix(prev.right.x, eyes.right.x), y: mix(prev.right.y, eyes.right.y) },
    };
  });
};
