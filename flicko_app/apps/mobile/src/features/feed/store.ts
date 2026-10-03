import { create } from "zustand";

import { MOCK_MEMES } from "./mock";
import type { FeedTab, Meme } from "./types";

/*
 * Feed state: memes by id (pages subscribe to their own meme, so a like re-renders one
 * page), the tab, and that tab's order. Likes and follows are optimistic; the order is
 * taken when a tab is picked, so following someone doesn't reshuffle the list under you.
 */
interface FeedState {
  memes: Record<string, Meme>;
  tab: FeedTab;
  ids: string[];
  setTab: (tab: FeedTab) => void;
  toggleLike: (id: string) => void;
  toggleFollow: (handle: string) => void;
}

const byId = (memes: Meme[]) => Object.fromEntries(memes.map((m) => [m.id, m]));

const idsFor = (tab: FeedTab, memes: Record<string, Meme>) =>
  Object.values(memes)
    .filter((m) =>
      tab === "following"
        ? m.creator.isFollowing
        : tab === "launching"
          ? m.status === "launching"
          : true,
    )
    .map((m) => m.id);

export const useFeedStore = create<FeedState>((set) => ({
  memes: byId(MOCK_MEMES),
  tab: "forYou",
  ids: MOCK_MEMES.map((m) => m.id),
  setTab: (tab) => set((s) => ({ tab, ids: idsFor(tab, s.memes) })),
  toggleLike: (id) =>
    set((s) => {
      const m = s.memes[id];
      if (!m) return s;
      // TODO(milestone 3): POST the like; roll back on failure.
      return {
        memes: {
          ...s.memes,
          [id]: {
            ...m,
            likedByMe: !m.likedByMe,
            likeCount: m.likeCount + (m.likedByMe ? -1 : 1),
          },
        },
      };
    }),
  toggleFollow: (handle) =>
    set((s) => {
      // TODO(milestone 3): POST the follow; roll back on failure.
      const memes = { ...s.memes };
      for (const m of Object.values(memes)) {
        if (m.creator.handle === handle) {
          memes[m.id] = {
            ...m,
            creator: { ...m.creator, isFollowing: !m.creator.isFollowing },
          };
        }
      }
      return { memes };
    }),
}));
