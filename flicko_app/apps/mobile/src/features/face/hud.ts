import { useEffect, useState } from "react";
import { create } from "zustand";

import type { FaceTrackingResult } from "./live";

/*
 * Dev-only camera HUD data: which detector is live, preview and tracking fps, inference
 * time and the frame it ran on. Results are recorded from useFaceTracking; the preview
 * fps comes from the camera view. Nothing here runs unless the HUD is switched on.
 */
export const useFaceHudSwitch = create<{ on: boolean; toggle: () => void }>(
  (set) => ({
    on: false,
    toggle: () => set((s) => ({ on: !s.on })),
  }),
);

const WINDOW_MS = 1000;
const SAMPLES = 120;

let enabled = false;
let arrivals: number[] = [];
let inference: number[] = [];
let last: FaceTrackingResult | null = null;
let previewFps = 0;

export const hudRecord = (result: FaceTrackingResult) => {
  if (!enabled) return;
  const now = Date.now();
  arrivals.push(now);
  last = result;
  if (result.inferenceMs !== undefined) {
    inference.push(result.inferenceMs);
    if (inference.length > SAMPLES) inference.shift();
  }
};

export const hudPreviewFps = (fps: number) => {
  previewFps = fps;
};

const percentile = (values: number[], p: number) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
};

export interface HudSnapshot {
  source: string;
  previewFps: number;
  trackingFps: number;
  medianMs: number | null;
  p95Ms: number | null;
  frame: string;
  faces: number;
}

export const useFaceHud = (): HudSnapshot | null => {
  const on = useFaceHudSwitch((s) => s.on);
  const [snap, setSnap] = useState<HudSnapshot | null>(null);
  useEffect(() => {
    enabled = on;
    if (!on) {
      arrivals = [];
      inference = [];
      last = null;
      setSnap(null);
      return;
    }
    const timer = setInterval(() => {
      const now = Date.now();
      arrivals = arrivals.filter((t) => now - t <= WINDOW_MS);
      setSnap({
        source: last?.source ?? "none",
        previewFps,
        trackingFps: arrivals.length,
        medianMs: percentile(inference, 0.5),
        p95Ms: percentile(inference, 0.95),
        frame: last
          ? `${last.frame.width}x${last.frame.height} rot ${last.frame.rotation} ${last.frame.mirrored ? "mirrored" : "not mirrored"}`
          : "–",
        faces: last?.faces.length ?? 0,
      });
    }, 500);
    return () => clearInterval(timer);
  }, [on]);
  return snap;
};
