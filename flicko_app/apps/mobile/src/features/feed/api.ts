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

interface Candle {
  close: string;
}

/* Hourly closes over the last day, for a trading meme's sparkline. */
export const usePriceHistory = (mint: string, enabled: boolean) =>
  useQuery({
    queryKey: ["candles", mint, "1h"],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { candles } = await api<{ candles: Candle[] }>(
        `/memes/${mint}/candles?interval=1h&limit=24`,
      );
      return candles.map((c) => skrOf(c.close));
    },
  });
