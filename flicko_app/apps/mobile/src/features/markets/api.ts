import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ImageSource } from "expo-image";

import { config } from "@/config";
import { api } from "@/lib/api";
import { useSession } from "@/store/session";

import { mockMarket, mockStats } from "./mocks";

/*
 * Markets data: `GET /market` rows (amounts as base-unit strings) mapped to MarketItem in
 * whole SKR, the stats strip, and the signed-in wallet's watchlist. With
 * EXPO_PUBLIC_USE_MOCKS=1 everything comes from src/mocks instead.
 */
export type Window = "5m" | "1h" | "6h" | "24h";
export const WINDOWS: Window[] = ["5m", "1h", "6h", "24h"];
export type MarketTab = "watchlist" | "trending" | "new" | "gainers" | "volume";
export type MarketSort = "rank" | "mcap" | "volume" | "change" | "age";

const SERVER_WINDOW = { "5m": "m5", "1h": "h1", "6h": "h6", "24h": "h24" } as const;
type ServerWindow = (typeof SERVER_WINDOW)[Window];

export interface MarketRow {
  mint: string;
  name: string;
  symbol: string;
  imageUrl: string | null;
  phase: "launch" | "graduated";
  price: string;
  marketCap: string;
  liquidity: string;
  holders: number;
  launchProgressBps: number;
  createdAt: string;
  change: Record<ServerWindow, number>;
  volume: Record<ServerWindow, string>;
  txns: Record<ServerWindow, number>;
}

export interface MarketItem {
  mint: string;
  symbol: string;
  name: string;
  image: ImageSource | number | null;
  createdAt: number;
  phase: "pool" | "launching";
  /** 0-100 */
  launchPct: number;
  priceSkr: number;
  /** percent, per window */
  change: Record<Window, number>;
  marketCapSkr: number;
  volumeSkr: Record<Window, number>;
  holders: number;
}

export interface MarketStats {
  volume24hSkr: number;
  trades24h: number;
  launchesToday: number;
}

const skrUnit = 10 ** config.skrDecimals;
/** whole SKR from a base-unit string */
export const skrOf = (units: string) => Number(units) / skrUnit;

const perWindow = <T, U>(source: Record<ServerWindow, T>, map: (v: T) => U) =>
  Object.fromEntries(WINDOWS.map((w) => [w, map(source[SERVER_WINDOW[w]])])) as Record<Window, U>;

export const toMarketItem = (row: MarketRow): MarketItem => ({
  mint: row.mint,
  symbol: row.symbol,
  name: row.name,
  image: row.imageUrl ? { uri: row.imageUrl } : null,
  createdAt: Date.parse(row.createdAt),
  phase: row.phase === "graduated" ? "pool" : "launching",
  launchPct: row.launchProgressBps / 100,
  priceSkr: skrOf(row.price),
  change: perWindow(row.change, (bps) => bps / 100),
  marketCapSkr: skrOf(row.marketCap),
  volumeSkr: perWindow(row.volume, skrOf),
  holders: row.holders,
});

const SERVER_SORT: Record<Exclude<MarketTab, "watchlist">, string> = {
  trending: "trending",
  new: "new",
  gainers: "change",
  volume: "volume",
};
const SORT_PARAM: Record<Exclude<MarketSort, "rank">, string> = {
  mcap: "mcap",
  volume: "volume",
  change: "change",
  age: "new",
};

const PAGE = 30;

/* One Markets tab, paged by offset. Refetches every 15s while `live`. */
export const useMarketList = (
  tab: Exclude<MarketTab, "watchlist">,
  window: Window,
  sort: MarketSort,
  q: string,
  live: boolean,
) =>
  useInfiniteQuery({
    queryKey: ["market", tab, window, sort, q],
    initialPageParam: 0,
    refetchInterval: live ? 15_000 : false,
    queryFn: async ({ pageParam }) => {
      if (config.useMocks) return { items: mockMarket(tab, window, sort, q), nextOffset: null };
      const params = new URLSearchParams({
        sort: sort === "rank" ? SERVER_SORT[tab] : SORT_PARAM[sort],
        window: SERVER_WINDOW[window],
        limit: String(PAGE),
        offset: String(pageParam),
      });
      if (q) params.set("q", q);
      const page = await api<{ items: MarketRow[]; nextOffset: number | null }>(
        `/market?${params}`,
      );
      return { items: page.items.map(toMarketItem), nextOffset: page.nextOffset };
    },
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });

export const useMarketStats = (live: boolean) =>
  useQuery({
    queryKey: ["market-stats"],
    refetchInterval: live ? 15_000 : false,
    queryFn: async (): Promise<MarketStats> => {
      if (config.useMocks) return mockStats();
      const s = await api<{ volume24h: string; trades24h: number; launchesToday: number }>(
        "/market/stats",
      );
      return {
        volume24hSkr: skrOf(s.volume24h),
        trades24h: s.trades24h,
        launchesToday: s.launchesToday,
      };
    },
  });

/* ---- watchlist ---- */

// Mock mode keeps stars in memory.
const mockStars = new Set<string>();

const watchKey = (wallet: string | undefined) => ["watchlist", wallet] as const;

/* Starred mints (for star buttons). Empty for guests. */
export const useWatchedMints = () => {
  const session = useSession((s) => s.session);
  return useQuery({
    queryKey: watchKey(session?.wallet),
    enabled: config.useMocks || !!session,
    queryFn: async () => {
      if (config.useMocks) return [...mockStars];
      return (await api<{ mints: string[] }>("/me/watchlist", { token: session!.token })).mints;
    },
  });
};

/* The Watchlist tab's rows for a time window. */
export const useWatchlistRows = (window: Window, live: boolean) => {
  const session = useSession((s) => s.session);
  return useQuery({
    queryKey: [...watchKey(session?.wallet), "rows", window],
    enabled: config.useMocks || !!session,
    refetchInterval: live ? 15_000 : false,
    queryFn: async () => {
      if (config.useMocks) {
        return mockMarket("trending", window, "rank", "").filter((m) => mockStars.has(m.mint));
      }
      const res = await api<{ items: MarketRow[] }>(
        `/me/watchlist?window=${SERVER_WINDOW[window]}`,
        { token: session!.token },
      );
      return res.items.map(toMarketItem);
    },
  });
};

/* Star / unstar, updating star buttons right away. */
export const useToggleWatch = () => {
  const client = useQueryClient();
  const session = useSession((s) => s.session);
  const key = watchKey(session?.wallet);
  return useMutation({
    mutationFn: async ({ mint, on }: { mint: string; on: boolean }) => {
      if (config.useMocks) {
        if (on) mockStars.add(mint);
        else mockStars.delete(mint);
        return;
      }
      if (!session) throw new Error("not signed in");
      await api(`/me/watchlist/${mint}`, { method: on ? "POST" : "DELETE", token: session.token });
    },
    onMutate: async ({ mint, on }) => {
      await client.cancelQueries({ queryKey: key, exact: true });
      const before = client.getQueryData<string[]>(key);
      client.setQueryData<string[]>(key, (list = []) =>
        on ? [mint, ...list.filter((m) => m !== mint)] : list.filter((m) => m !== mint),
      );
      return { before };
    },
    onError: (_err, _vars, context) => client.setQueryData(key, context?.before),
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });
};
