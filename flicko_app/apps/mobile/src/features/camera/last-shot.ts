import { create } from "zustand";

/*
 * The last raw camera shot (upright, before filters), for dev tools like the face
 * detection test screen. Kept in memory only.
 */
export const useLastShot = create<{
  uri: string | null;
  set: (uri: string) => void;
}>((set) => ({ uri: null, set: (uri) => set({ uri }) }));
