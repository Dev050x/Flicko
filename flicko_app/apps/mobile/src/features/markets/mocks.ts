import markets from "@/mocks/markets.json";

import type { MarketItem, MarketSort, MarketStats, MarketTab, Window } from "./api";

/*
 * The markets kit's mock data (src/mocks) as MarketItems, for EXPO_PUBLIC_USE_MOCKS=1.
 * The mocks only carry a 24h change, so every window shows it.
 */
export const MOCK_THUMBS: Record<string, number> = {
  "thumb-0": require("../../../assets/mocks/thumb-0.jpg"),
  "thumb-1": require("../../../assets/mocks/thumb-1.jpg"),
  "thumb-2": require("../../../assets/mocks/thumb-2.jpg"),
  "thumb-3": require("../../../assets/mocks/thumb-3.jpg"),
  "thumb-4": require("../../../assets/mocks/thumb-4.jpg"),
  "thumb-5": require("../../../assets/mocks/thumb-5.jpg"),
  "thumb-6": require("../../../assets/mocks/thumb-6.jpg"),
  "thumb-7": require("../../../assets/mocks/thumb-7.jpg"),
  "thumb-8": require("../../../assets/mocks/thumb-8.jpg"),
};

const ageMs = (age: string) => {
  const n = parseInt(age, 10);
  const unit = age.slice(-1);
  return n * (unit === "d" ? 86_400_000 : unit === "h" ? 3_600_000 : 60_000);
};

const items = (): MarketItem[] =>
  markets.items.map((m) => ({
    mint: m.mint,
    symbol: m.symbol,
    name: m.name,
    image: MOCK_THUMBS[m.image] ?? null,
    createdAt: Date.now() - ageMs(m.age),
    phase: m.phase === "pool" ? "pool" : "launching",
    launchPct: m.launchProgress ?? 100,
    priceSkr: m.priceSkr,
    change: { "5m": m.change24h, "1h": m.change24h, "6h": m.change24h, "24h": m.change24h },
    marketCapSkr: m.marketCapSkr,
    volumeSkr: {
      "5m": m.volume24hSkr,
      "1h": m.volume24hSkr,
      "6h": m.volume24hSkr,
      "24h": m.volume24hSkr,
    },
    holders: m.holders,
  }));

export const mockMarket = (
  tab: Exclude<MarketTab, "watchlist">,
  window: Window,
  sort: MarketSort,
  q: string,
) => {
  let list = items();
  if (q) {
    const needle = q.toLowerCase();
    list = list.filter(
      (m) => m.symbol.toLowerCase().includes(needle) || m.name.toLowerCase().includes(needle),
    );
  }
  const key =
    sort !== "rank" ? sort : tab === "gainers" ? "change" : tab === "volume" ? "volume" : tab === "new" ? "age" : null;
  const by: Record<string, (m: MarketItem) => number> = {
    mcap: (m) => m.marketCapSkr,
    volume: (m) => m.volumeSkr[window],
    change: (m) => m.change[window],
    age: (m) => m.createdAt,
  };
  return key ? [...list].sort((a, b) => by[key](b) - by[key](a)) : list;
};

export const mockStats = (): MarketStats => ({
  volume24hSkr: markets.stats.volume24hSkr,
  trades24h: markets.stats.trades24h,
  launchesToday: markets.stats.launchesToday,
});
