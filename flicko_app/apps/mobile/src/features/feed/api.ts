import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { config } from "@/config";
import { api } from "@/lib/api";

import type { FeedTab, Meme } from "./types";

/*
 * Feed data from the server (`GET /feed`, cards in base units as strings), mapped to
 * the feed's Meme shape. Likes, comments and follows aren't on the server yet; the
 * store keeps them locally.
 */
interface MemeCard {
  mint: string;
  name: string;
  symbol: string;
  imageUrl: string | null;
  creator: string;
  creatorUsername: string | null;
  phase: "launch" | "graduated";
  /** SKR base units per whole token */
  price: string;
  priceChange24hBps: number;
  volume24h: string;
  launchProgressBps: number;
  createdAt: string;
  totalSupply: string;
  tokensSold: string;
  startPrice: string;
  graduatedAt: string | null;
}

interface FeedPage {
  items: MemeCard[];
  nextOffset: number | null;
}

const PAGE = 20;
const TOKEN_DECIMALS = 6;
const defaultAvatar = require("../../../assets/brand/flicko-pfp-dark-ring-1024.png");

const skrOf = (baseUnits: string) => Number(baseUnits) / 10 ** config.skrDecimals;
const tokensOf = (baseUnits: bigint) => Number(baseUnits / 10n ** BigInt(TOKEN_DECIMALS));
const shortWallet = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

export const toMeme = (card: MemeCard): Meme => {
  const createdAt = Date.parse(card.createdAt);
  const saleSupply = (BigInt(card.totalSupply) * 4n) / 5n;
  const price = skrOf(card.price);
  const launchPrice = skrOf(card.startPrice);
  const trading = card.phase === "graduated";
  return {
    id: card.mint,
    imageUrl: card.imageUrl ?? "",
    creator: {
      wallet: card.creator,
      handle: card.creatorUsername ?? shortWallet(card.creator),
      avatarUrl: defaultAvatar,
      isFollowing: false,
    },
    ticker: card.symbol,
    createdAt,
    status: trading ? "trading" : "launching",
    supplyTotal: tokensOf(saleSupply),
    supplySold: trading ? tokensOf(saleSupply) : tokensOf(BigInt(card.tokensSold)),
    launchPrice,
    price,
    totalSupply: tokensOf(BigInt(card.totalSupply)),
    volume24h: skrOf(card.volume24h),
    change24hPct: card.priceChange24hBps / 100,
    changeSinceLaunchPct: trading && launchPrice > 0 ? ((price - launchPrice) / launchPrice) * 100 : undefined,
    soldOutDurationMin:
      trading && card.graduatedAt
        ? Math.max(1, Math.round((Date.parse(card.graduatedAt) - createdAt) / 60_000))
        : undefined,
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
  };
};

/* Following uses the trending order and keeps the creators you follow. */
const serverTab = (tab: FeedTab) => (tab === "launching" ? "new" : "trending");

export const useFeedPages = (tab: FeedTab) =>
  useInfiniteQuery({
    queryKey: ["feed", serverTab(tab)],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const page = await api<FeedPage>(
        `/feed?tab=${serverTab(tab)}&limit=${PAGE}&offset=${pageParam}`,
      );
      return { ...page, items: page.items.map(toMeme) };
    },
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    staleTime: 30_000,
  });

interface TradeRow {
  priceAfter: string;
}

const HISTORY_TRADES = 60;

/*
 * The price line for a meme: its launch price, then the price after each of its last
 * trades (oldest first). Built from trades rather than hourly candles, which only exist
 * for hours with trades, so a single buy already draws a line.
 */
export const usePriceHistory = (mint: string, launchPrice: number, enabled: boolean) =>
  useQuery({
    queryKey: ["price-history", mint],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const { items } = await api<{ items: TradeRow[] }>(
        `/memes/${mint}/trades?limit=${HISTORY_TRADES}`,
      );
      const after = items.map((t) => skrOf(t.priceAfter)).reverse();
      return items.length < HISTORY_TRADES ? [launchPrice, ...after] : after;
    },
  });
