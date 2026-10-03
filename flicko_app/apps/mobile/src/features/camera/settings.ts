import { create } from "zustand";

import { secureStore } from "@/lib/native";

/*
 * Camera controls. The facing is remembered between launches (front by default, memes
 * are mostly selfies); flash, timer and aspect reset each launch.
 */
export type Facing = "front" | "back";
export type FlashSetting = "off" | "on" | "auto";
export type TimerSetting = 0 | 3 | 10;
export type Aspect = "4:5" | "1:1" | "9:16";

export const ASPECT_RATIO: Record<Aspect, number> = {
  "4:5": 4 / 5,
  "1:1": 1,
  "9:16": 9 / 16,
};

const FLASH_NEXT: Record<FlashSetting, FlashSetting> = {
  off: "on",
  on: "auto",
  auto: "off",
};
const TIMER_NEXT: Record<TimerSetting, TimerSetting> = { 0: 3, 3: 10, 10: 0 };
const ASPECT_NEXT: Record<Aspect, Aspect> = {
  "4:5": "1:1",
  "1:1": "9:16",
  "9:16": "4:5",
};

const FACING_KEY = "flicko.camera.facing";

interface CameraSettings {
  facing: Facing;
  flash: FlashSetting;
  timer: TimerSetting;
  aspect: Aspect;
  filterId: string;
  restore: () => Promise<void>;
  flip: () => void;
  cycleFlash: () => void;
  cycleTimer: () => void;
  cycleAspect: () => void;
  setFilter: (id: string) => void;
}

export const useCameraSettings = create<CameraSettings>((set, get) => ({
  facing: "front",
  flash: "off",
  timer: 0,
  aspect: "4:5",
  filterId: "none",

  restore: async () => {
    try {
      const saved = await secureStore()?.getItemAsync(FACING_KEY);
      if (saved === "front" || saved === "back") set({ facing: saved });
    } catch {
      // keep the default
    }
  },

  flip: () => {
    const facing = get().facing === "front" ? "back" : "front";
    set({ facing });
    secureStore()
      ?.setItemAsync(FACING_KEY, facing)
      .catch(() => {});
  },

  cycleFlash: () => set((s) => ({ flash: FLASH_NEXT[s.flash] })),
  cycleTimer: () => set((s) => ({ timer: TIMER_NEXT[s.timer] })),
  cycleAspect: () => set((s) => ({ aspect: ASPECT_NEXT[s.aspect] })),
  setFilter: (filterId) => set({ filterId }),
}));
