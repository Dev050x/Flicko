import { PublicKey } from "@solana/web3.js";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";

import { config } from "@/config";
import { api } from "@/lib/api";
import { connection } from "@/lib/solana";
import { useSession } from "@/store/session";

/*
 * Profile data from the server. Amounts arrive as base-unit strings; `skrOf` turns them
 * into whole SKR for display.
 */
export const skrOf = (baseUnits: string) =>
  Number(baseUnits) / 10 ** config.skrDecimals;

export interface Profile {
  wallet: string;
  username: string | null;
  displayName: string | null;
  bio: string | null;
  avatarId: string | null;
  avatarUrl: string | null;
  counts: { memes: number; followers: number; following: number };
  isFollowing?: boolean;
  creatorStats: {
    totalVolume: string;
    bestMeme: { symbol: string; changeBps: number } | null;
    graduated: number;
    launched: number;
  };
}

export interface ProfileMeme {
  mint: string;
  symbol: string;
  imageUrl: string | null;
  priceChange24hBps: number;
  phase: "launch" | "graduated";
}

export interface Holding {
  mint: string;
  symbol: string;
  imageUrl: string | null;
  balance: string;
  price: string;
  priceChange24hBps: number;
  value: string;
  costBasis: string;
  unrealizedPnlBps: number;
}

export interface PublicHolding {
  mint: string;
  symbol: string;
  imageUrl: string | null;
  pnlBps: number;
  priceChange24hBps: number;
}

export interface ActivityItem {
  type: "buy" | "sell" | "launch" | "claim";
  mint: string;
  symbol: string;
  skr: string;
  at: string;
}

interface Earnings {
  totals: { earned: string; claimed: string; claimable: string };
  items: { feesClaimable: string }[];
}

const token = () => useSession.getState().session?.token;
const PAGE = 30;

/* A profile by wallet or username; the Bearer adds `isFollowing`. */
export const useProfile = (id: string | undefined) => {
  const jwt = useSession((s) => s.session?.token);
  return useQuery({
    queryKey: ["profile", id, !!jwt],
    enabled: !!id,
    staleTime: 30_000,
    queryFn: () => api<Profile>(`/users/${id}`, { token: jwt }),
  });
};

export const useUserMemes = (id: string | undefined) =>
  useInfiniteQuery({
    queryKey: ["profile-memes", id],
    enabled: !!id,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api<{ items: ProfileMeme[]; nextOffset: number | null }>(
        `/users/${id}/memes?limit=${PAGE}&offset=${pageParam}`,
      ),
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    staleTime: 30_000,
  });

export const usePublicHoldings = (id: string | undefined) =>
  useQuery({
    queryKey: ["profile-holdings", id],
    enabled: !!id,
    staleTime: 30_000,
    queryFn: () => api<{ items: PublicHolding[] }>(`/users/${id}/holdings`),
  });

/* Your own positions, with value and P&L. */
export const usePortfolio = (enabled = true) => {
  const jwt = useSession((s) => s.session?.token);
  return useQuery({
    queryKey: ["portfolio", jwt],
    enabled: enabled && !!jwt,
    staleTime: 30_000,
    queryFn: () =>
      api<{ totals: { value: string }; holdings: Holding[] }>("/me/portfolio", {
        token: jwt,
      }),
  });
};

export const useEarnings = () => {
  const jwt = useSession((s) => s.session?.token);
  return useQuery({
    queryKey: ["earnings", jwt],
    enabled: !!jwt,
    staleTime: 30_000,
    queryFn: () => api<Earnings>("/me/created", { token: jwt }),
  });
};

export const useActivity = () => {
  const jwt = useSession((s) => s.session?.token);
  return useInfiniteQuery({
    queryKey: ["activity", jwt],
    enabled: !!jwt,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api<{ items: ActivityItem[]; nextOffset: number | null }>(
        `/me/activity?limit=${PAGE}&offset=${pageParam}`,
        { token: jwt },
      ),
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });
};

export const useSolBalance = (wallet: string | undefined) =>
  useQuery({
    queryKey: ["sol-balance", wallet],
    enabled: !!wallet,
    refetchInterval: 30_000,
    queryFn: async () =>
      (await connection.getBalance(new PublicKey(wallet!))) / 1e9,
  });

/*
 * Portfolio change over 24h: the memes' value now against their value a day ago (each
 * holding's 24h change backed out), as a % of what the whole portfolio was worth then.
 */
export const portfolioChangePct = (holdings: Holding[], cash: number) => {
  let now = 0;
  let before = 0;
  for (const h of holdings) {
    const value = skrOf(h.value);
    now += value;
    before += value / (1 + h.priceChange24hBps / 10_000);
  }
  const base = cash + before;
  return base > 0 ? ((now - before) / base) * 100 : 0;
};

/*
 * Follow / unfollow with an optimistic update of the cached profile; rolled back (and
 * the feed's flags refreshed) when the server refuses.
 */
export const useFollow = (id: string | undefined) => {
  const client = useQueryClient();
  return useCallback(
    async (next: boolean) => {
      const jwt = token();
      if (!jwt || !id) return false;
      const keys = client
        .getQueryCache()
        .findAll({ queryKey: ["profile", id] })
        .map((q) => q.queryKey);
      const patch = (following: boolean) =>
        keys.forEach((key) =>
          client.setQueryData<Profile>(key, (old) =>
            old
              ? {
                  ...old,
                  isFollowing: following,
                  counts: {
                    ...old.counts,
                    followers: Math.max(
                      0,
                      old.counts.followers + (following ? 1 : -1),
                    ),
                  },
                }
              : old,
          ),
        );
      patch(next);
      try {
        await api(`/users/${id}/follow`, {
          method: next ? "PUT" : "DELETE",
          token: jwt,
        });
        client.invalidateQueries({ queryKey: ["feed"] });
        return true;
      } catch (err) {
        console.warn("[profile] follow failed", err);
        patch(!next);
        return false;
      }
    },
    [client, id],
  );
};
