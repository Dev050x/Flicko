import { memePrice, type MemeState } from "@flicko/sdk";
import { create } from "zustand";

import { config } from "@/config";
import { api } from "@/lib/api";
import { useSession } from "@/store/session";

import type { FeedTab, Meme } from "./types";

/*
 * Feed state: memes by id (pages subscribe to their own meme, so a like re-renders one
 * page), the tab, and the ids shown. Server pages are merged in with `ingest`; likes
 * are optimistic and kept here (the server has no likes yet) and follows are sent to the
 * server right away, so a refetch doesn't undo them.
 */
interface Local {
  liked: Record<string, boolean>;
  following: Record<string, boolean>;
}

interface FeedState extends Local {
  memes: Record<string, Meme>;
  tab: FeedTab;
  ids: string[];
  setTab: (tab: FeedTab) => void;
  /**
   * Merge the tab's loaded memes (server order). Memes already shown keep their place
   * so the page under your finger doesn't move; `replace` (pull to refresh) re-sorts.
   */
  ingest: (memes: Meme[], replace?: boolean) => void;
  /** update a meme's progress and price from its on-chain state after a trade */
  patchFromChain: (id: string, state: MemeState) => void;
  toggleLike: (id: string) => void;
  toggleFollow: (wallet: string) => void;
}

const withLocal = (m: Meme, local: Local): Meme => {
  const liked = local.liked[m.id] ?? m.likedByMe;
  return {
    ...m,
    likedByMe: liked,
    likeCount: m.likeCount + (liked && !m.likedByMe ? 1 : !liked && m.likedByMe ? -1 : 0),
    creator: {
      ...m.creator,
      isFollowing: local.following[m.creator.wallet] ?? m.creator.isFollowing,
    },
  };
};

export const useFeedStore = create<FeedState>((set) => ({
  memes: {},
  tab: "forYou",
  ids: [],
  liked: {},
  following: {},
  setTab: (tab) => set({ tab, ids: [] }),
  ingest: (list, replace = false) =>
    set((s) => {
      const memes = { ...s.memes };
      for (const m of list) memes[m.id] = withLocal(m, s);
      const shown =
        s.tab === "following"
          ? list.filter((m) => memes[m.id].creator.isFollowing)
          : s.tab === "launching"
            ? list.filter((m) => m.status === "launching")
            : list;
      // Keep memes already on screen (e.g. one you just unfollowed) where they are.
      const kept = replace ? [] : s.ids.filter((id) => memes[id]);
      const ids = [...new Set([...kept, ...shown.map((m) => m.id)])];
      return { memes, ids };
    }),
  patchFromChain: (id, state) =>
    set((s) => {
      const m = s.memes[id];
      if (!m) return s;
      const trading = state.phase === "graduated";
      const whole = (units: bigint) => Number(units / 1_000_000n);
      const price = Number(memePrice(state)) / 10 ** config.skrDecimals;
      return {
        memes: {
          ...s.memes,
          [id]: {
            ...m,
            status: trading ? "trading" : "launching",
            supplySold: trading ? m.supplyTotal : whole(state.tokensSold),
            price,
            changeSinceLaunchPct:
              trading && m.launchPrice > 0
                ? ((price - m.launchPrice) / m.launchPrice) * 100
                : m.changeSinceLaunchPct,
          },
        },
      };
    }),
  toggleLike: (id) =>
    set((s) => {
      const m = s.memes[id];
      if (!m) return s;
      // TODO: POST the like once the server has likes; roll back on failure.
      const liked = !m.likedByMe;
      return {
        liked: { ...s.liked, [id]: liked },
        memes: {
          ...s.memes,
          [id]: { ...m, likedByMe: liked, likeCount: Math.max(0, m.likeCount + (liked ? 1 : -1)) },
        },
      };
    }),
  toggleFollow: (wallet) => {
    const token = useSession.getState().session?.token;
    if (!token) return;
    const apply = (next: boolean) =>
      set((s) => {
        const memes = { ...s.memes };
        for (const m of Object.values(memes)) {
          if (m.creator.wallet === wallet) {
            memes[m.id] = { ...m, creator: { ...m.creator, isFollowing: next } };
          }
        }
        return { memes, following: { ...s.following, [wallet]: next } };
      });
    const current = Object.values(useFeedStore.getState().memes).find(
      (m) => m.creator.wallet === wallet,
    );
    const next = !(current?.creator.isFollowing ?? false);
    apply(next);
    // Optimistic; put the button back if the server says no.
    api(`/users/${wallet}/follow`, { method: next ? "PUT" : "DELETE", token }).catch((err) => {
      console.warn("[feed] follow failed", err);
      apply(!next);
    });
  },
}));
