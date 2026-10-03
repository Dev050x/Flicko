import { create } from "zustand";

import { secureStore } from "@/lib/native";

/*
 * Camera controls. The facing is remembered between launches (front by default, memes
 * are mostly selfies); flash and timer reset each launch. The photo is always the full
 * preview, so there is no aspect setting.
 */
export type Facing = "front" | "back";
export type FlashSetting = "off" | "on" | "auto";
export type TimerSetting = 0 | 3 | 10;

const FLASH_NEXT: Record<FlashSetting, FlashSetting> = {
  off: "on",
  on: "auto",
  auto: "off",
};
const TIMER_NEXT: Record<TimerSetting, TimerSetting> = { 0: 3, 3: 10, 10: 0 };

const FACING_KEY = "flicko.camera.facing";

interface CameraSettings {
  facing: Facing;
  flash: FlashSetting;
  timer: TimerSetting;
  filterId: string;
  restore: () => Promise<void>;
  flip: () => void;
  cycleFlash: () => void;
  cycleTimer: () => void;
  setFilter: (id: string) => void;
}

export const useCameraSettings = create<CameraSettings>((set, get) => ({
  facing: "front",
  flash: "off",
  timer: 0,
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
  setFilter: (filterId) => set({ filterId }),
}));
