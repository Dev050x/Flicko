import type { Eyes } from "@/features/filters/placement";

import type { Face } from "./index";

/*
 * Face mesh indices (MediaPipe Face Landmarker, 478 points). The iris centres are the
 * most stable eye centres; the eye corners stand in when a model has no iris points.
 * "Left"/"right" are the subject's, so in the picture the subject's right eye is on
 * the left.
 */
const IRIS_RIGHT = 468;
const IRIS_LEFT = 473;
const RIGHT_EYE_CORNERS = [33, 133] as const;
const LEFT_EYE_CORNERS = [362, 263] as const;

const centre = (face: Face, index: number, corners: readonly [number, number]) => {
  const iris = face.landmarks[index];
  if (iris) return iris;
  const [a, b] = corners.map((i) => face.landmarks[i]);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
};

/** Eye centres in pixels of a `width` x `height` photo, left = smaller x. */
export const eyeCenters = (face: Face, width: number, height: number): Eyes => {
  const a = centre(face, IRIS_RIGHT, RIGHT_EYE_CORNERS);
  const b = centre(face, IRIS_LEFT, LEFT_EYE_CORNERS);
  const p = { x: a.x * width, y: a.y * height };
  const q = { x: b.x * width, y: b.y * height };
  return p.x <= q.x ? { left: p, right: q } : { left: q, right: p };
};
