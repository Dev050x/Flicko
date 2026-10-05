import { useEffect, useState } from "react";
import { create } from "zustand";

import { activeSource } from "./flags";
import { useFaceFlags } from "./flags";
import type { FaceTrackingResult } from "./live";

/*
 * Dev-only camera HUD data: which detector drives the overlays, preview and tracking fps,
 * inference time, dropped frames and the frame the detector saw. Both detectors' last
 * results are kept so the debug overlay can draw them side by side. Nothing is recorded
 * unless the HUD is on.
 */
export const useFaceHudSwitch = create<{
  /** numbers only: cheap enough to measure real performance */
  on: boolean;
  /** debug overlay: 478 points, ML Kit next to MediaPipe, landmarks to JS (slows tracking) */
  debug: boolean;
  toggle: () => void;
  toggleDebug: () => void;
}>((set) => ({
  on: false,
  debug: false,
  toggle: () => set((s) => ({ on: !s.on })),
  toggleDebug: () => set((s) => ({ debug: !s.debug })),
}));

const WINDOW_MS = 1000;
const SAMPLES = 120;

let enabled = false;
const arrivals: Record<string, number[]> = { mediapipe: [], mlkit: [] };
const inference: Record<string, number[]> = { mediapipe: [], mlkit: [] };
const lastBySource: Record<string, FaceTrackingResult | null> = {
  mediapipe: null,
  mlkit: null,
};
let previewFps = 0;
let statsPrev: { offered: number; dropped: number } | null = null;
let droppedPct: number | null = null;
let delegate = "";
let stalls = 0;
const queue: number[] = [];
const render: number[] = [];
const prep: Record<string, number[]> = { mediapipe: [], mlkit: [] };

export const hudRecord = (result: FaceTrackingResult, _view?: unknown) => {
  if (!enabled) return;
  const source = result.source;
  arrivals[source].push(Date.now());
  lastBySource[source] = result;
  if (result.prepMs !== undefined) {
    prep[source].push(result.prepMs);
    if (prep[source].length > SAMPLES) prep[source].shift();
  }
  if (result.inferenceMs !== undefined) {
    inference[source].push(result.inferenceMs);
    if (inference[source].length > SAMPLES) inference[source].shift();
  }
};

/** ms a MediaPipe result waited between the camera thread and the JS thread. */
export const hudQueue = (ms: number) => {
  if (!enabled) return;
  queue.push(ms);
  if (queue.length > SAMPLES) queue.shift();
};

/** ms from a result reaching JS to the overlay re-rendering with it. */
export const hudRender = (ms: number) => {
  if (!enabled) return;
  render.push(ms);
  if (render.length > SAMPLES) render.shift();
};

/** The first face overlay's placement, for the debug text (what the overlay was asked to draw). */
export let hudPlacementText = "";
export const hudPlacement = (text: string) => {
  if (enabled) hudPlacementText = text;
};

export const hudPreviewFps = (fps: number) => {
  previewFps = fps;
};

/** Native counters (cumulative); dropped % is over the last interval. */
export const hudNativeStats = (stats: {
  offered: number;
  dropped: number;
  stalls: number;
  delegate: string;
}) => {
  delegate = stats.delegate;
  stalls = stats.stalls;
  if (statsPrev) {
    const offered = stats.offered - statsPrev.offered;
    droppedPct =
      offered > 0
        ? ((stats.dropped - statsPrev.dropped) / offered) * 100
        : null;
  }
  statsPrev = { offered: stats.offered, dropped: stats.dropped };
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
  prepMs: number | null;
  queueMs: number | null;
  renderMs: number | null;
  droppedPct: number | null;
  delegate: string;
  stalls: number;
  frame: string;
  faces: number;
}

export const useFaceHud = (): HudSnapshot | null => {
  const on = useFaceHudSwitch((s) => s.on || s.debug);
  const [snap, setSnap] = useState<HudSnapshot | null>(null);
  useEffect(() => {
    enabled = on;
    if (!on) {
      for (const k of Object.keys(arrivals)) {
        arrivals[k] = [];
        inference[k] = [];
        prep[k] = [];
        lastBySource[k] = null;
      }
      queue.length = 0;
      render.length = 0;
      statsPrev = null;
      droppedPct = null;
      delegate = "";
      setSnap(null);
      return;
    }
    const timer = setInterval(() => {
      const now = Date.now();
      const source = activeSource(useFaceFlags.getState());
      arrivals[source] = arrivals[source].filter((t) => now - t <= WINDOW_MS);
      const last = lastBySource[source];
      setSnap({
        source,
        previewFps,
        trackingFps: arrivals[source].length,
        medianMs: percentile(inference[source], 0.5),
        p95Ms: percentile(inference[source], 0.95),
        prepMs: percentile(prep[source], 0.5),
        queueMs: percentile(queue, 0.95),
        renderMs: percentile(render, 0.95),
        droppedPct: source === "mediapipe" ? droppedPct : null,
        delegate: source === "mediapipe" ? delegate : "",
        stalls: source === "mediapipe" ? stalls : 0,
        frame: last
          ? `${last.frame.width}x${last.frame.height} rot ${last.frame.rotation}${last.frame.sensorRotation !== undefined ? ` (sensor ${last.frame.sensorRotation})` : ""} ${last.frame.mirrored ? "mirrored" : "not mirrored"}`
          : "–",
        faces: last?.faces.length ?? 0,
      });
    }, 500);
    return () => clearInterval(timer);
  }, [on]);
  return snap;
};

/* Latest result of each detector, for the debug overlay (read ~10x a second). */
export const hudLast = (source: "mediapipe" | "mlkit") => lastBySource[source];
export const hudEnabled = () => enabled;
