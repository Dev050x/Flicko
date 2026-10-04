import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import type { ImageSource } from "expo-image";

import { config } from "@/config";
import { profileAvatar } from "@/features/avatars/catalog";
import { skrOf } from "@/features/markets/api";
import { api } from "@/lib/api";
import { shortAddress } from "@/lib/format";
import candlesMock from "@/mocks/candles-15m.json";
import holdersMock from "@/mocks/holders.json";
import tradesMock from "@/mocks/trades.json";

/*
 * Data for the meme page's Chart, Trades and Holders tabs. Each tab loads on its own;
 * amounts arrive as base-unit strings and are mapped to whole SKR / tokens here.
 */
export const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

const TOKEN = 1e6;

export interface CandleView {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  /** SKR */
  v: number;
  trades: number;
}

interface ServerCandle {
  time: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  trades: number;
}

export const useCandles = (mint: string, tf: Timeframe, enabled: boolean) =>
  useQuery({
    queryKey: ["candles", mint, tf],
    enabled,
    refetchInterval: enabled ? 15_000 : false,
    queryFn: async (): Promise<CandleView[]> => {
      if (config.useMocks) {
        return candlesMock.candles.map((c) => ({
          t: c.t * 1000,
          o: c.o,
          h: c.h,
          l: c.l,
          c: c.c,
          v: c.v,
          trades: 1,
        }));
      }
      const res = await api<{ candles: ServerCandle[] }>(
        `/memes/${mint}/candles?tf=${tf}&limit=60`,
      );
      return res.candles.map((c) => ({
        t: Date.parse(c.time),
        o: skrOf(c.open),
        h: skrOf(c.high),
        l: skrOf(c.low),
        c: skrOf(c.close),
        v: skrOf(c.volume),
        trades: c.trades,
      }));
    },
  });

export interface TradeView {
  id: string;
  side: "buy" | "sell";
  /** SKR */
  skr: number;
  /** SKR per token after the trade */
  price: number;
  /** whole tokens */
  tokens: number;
  /** "@handle" or a short address */
  trader: string;
  /** true when `trader` is a shortened address (shown in mono) */
  traderIsAddress: boolean;
  /** the trader's avatar, or null when they haven't set one */
  avatar?: ImageSource | null;
  wallet: string;
  at: number;
}

interface ServerTrade {
  signature: string;
  trader: string;
  traderUsername: string | null;
  traderAvatarId: string | null;
  traderAvatarUrl: string | null;
  isBuy: boolean;
  skrAmount: string;
  tokenAmount: string;
  priceAfter: string;
  blockTime: string;
}

const PAGE = 50;

export type TradeFilter = "all" | "buys" | "sells" | "mine";

/*
 * Newest first, 50 per page; the first page refreshes every 5s while shown. "mine"
 * needs a wallet. `largeSkr` is the meme's 95th-percentile trade size (null before any).
 */
export const useTrades = (
  mint: string,
  enabled: boolean,
  filter: TradeFilter = "all",
  wallet?: string,
) =>
  useInfiniteQuery({
    queryKey: ["trades", mint, filter, filter === "mine" ? wallet : null],
    enabled: enabled && (filter !== "mine" || !!wallet),
    refetchInterval: enabled ? 5_000 : false,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      if (config.useMocks) {
        const items: TradeView[] = tradesMock.items
          .map((t, i): TradeView => ({
            id: `mock-${i}`,
            side: t.side === "buy" ? "buy" : "sell",
            skr: t.skr,
            price: t.priceSkr,
            tokens: t.skr / t.priceSkr,
            trader: t.trader,
            traderIsAddress: !t.trader.startsWith("@"),
            wallet: t.trader,
            at: Date.now() - t.ageSec * 1000,
          }))
          .filter(
            (t) =>
              filter === "all" || (filter === "buys") === (t.side === "buy"),
          );
        return { items, largeSkr: 250, nextOffset: null };
      }
      const params = new URLSearchParams({
        limit: String(PAGE),
        offset: String(pageParam),
      });
      if (filter === "buys") params.set("side", "buy");
      if (filter === "sells") params.set("side", "sell");
      if (filter === "mine" && wallet) params.set("trader", wallet);
      const res = await api<{
        items: ServerTrade[];
        largeSkr: string | null;
        nextOffset: number | null;
      }>(`/memes/${mint}/trades?${params}`);
      return {
        items: res.items.map((t): TradeView => ({
          id: t.signature,
          side: t.isBuy ? "buy" : "sell",
          skr: skrOf(t.skrAmount),
          price: skrOf(t.priceAfter),
          tokens: Number(t.tokenAmount) / TOKEN,
          trader: t.traderUsername
            ? `@${t.traderUsername}`
            : shortAddress(t.trader),
          traderIsAddress: !t.traderUsername,
          avatar: profileAvatar(t.traderAvatarUrl, t.traderAvatarId),
          wallet: t.trader,
          at: Date.parse(t.blockTime),
        })),
        largeSkr: res.largeSkr === null ? null : skrOf(res.largeSkr),
        nextOffset: res.nextOffset,
      };
    },
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });

export interface HolderView {
  /** among wallets; the pool isn't ranked */
  rank: number;
  wallet: string;
  /** "@handle" or a short address */
  label: string;
  isAddress: boolean;
  /** null when they haven't set one */
  avatar: ImageSource | null;
  isCreator: boolean;
  /** percent of supply */
  pct: number;
  tokens: number;
  valueSkr: number;
}

export interface HoldersPage {
  total: number;
  top10Pct: number;
  creatorPct: number;
  /** null during launch: the pool doesn't exist yet */
  pool: { pct: number; tokens: number; valueSkr: number } | null;
  items: HolderView[];
  /** the signed-in wallet's own row, wherever it ranks */
  me: HolderView | null;
  nextOffset: number | null;
}

interface ServerHolder {
  rank: number;
  wallet: string;
  username: string | null;
  avatarId: string | null;
  avatarUrl: string | null;
  isCreator: boolean;
  balance: string;
  shareBps: number;
  value: string;
}

const toHolder = (h: ServerHolder): HolderView => ({
  rank: h.rank,
  wallet: h.wallet,
  label: h.username ? `@${h.username}` : shortAddress(h.wallet),
  isAddress: !h.username,
  avatar: profileAvatar(h.avatarUrl, h.avatarId),
  isCreator: h.isCreator,
  pct: h.shareBps / 100,
  tokens: Number(h.balance) / TOKEN,
  valueSkr: skrOf(h.value),
});

const mockHolders = (): HoldersPage => {
  const pool = holdersMock.items.find((h) => h.label === "Pool");
  return {
    total: holdersMock.total,
    top10Pct: holdersMock.top10Pct,
    creatorPct: holdersMock.creatorPct,
    pool: pool
      ? { pct: pool.pct, tokens: pool.amount, valueSkr: pool.valueSkr }
      : null,
    items: holdersMock.items
      .filter((h) => h.label !== "Pool")
      .map((h, i) => ({
        rank: i + 1,
        wallet: h.address,
        label: h.label ?? h.address,
        isAddress: !h.label,
        avatar: null,
        isCreator: h.tag === "Creator",
        pct: h.pct,
        tokens: h.amount,
        valueSkr: h.valueSkr,
      })),
    me: null,
    nextOffset: null,
  };
};

/* Holders, 50 per page, with the viewer's own row when signed in. */
export const useHolders = (mint: string, enabled: boolean, token?: string) =>
  useInfiniteQuery({
    queryKey: ["holders", mint, token ? "me" : "guest"],
    enabled,
    refetchInterval: enabled ? 30_000 : false,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<HoldersPage> => {
      if (config.useMocks) return mockHolders();
      const res = await api<{
        total: number;
        top10Bps: number;
        creatorBps: number;
        pool: { balance: string; shareBps: number; value: string } | null;
        items: ServerHolder[];
        me: ServerHolder | null;
        nextOffset: number | null;
      }>(`/memes/${mint}/holders?limit=50&offset=${pageParam}`, { token });
      return {
        total: res.total,
        top10Pct: res.top10Bps / 100,
        creatorPct: res.creatorBps / 100,
        pool: res.pool && {
          pct: res.pool.shareBps / 100,
          tokens: Number(res.pool.balance) / TOKEN,
          valueSkr: skrOf(res.pool.value),
        },
        items: res.items.map(toHolder),
        me: res.me && toHolder(res.me),
        nextOffset: res.nextOffset,
      };
    },
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });

export interface SoldPoint {
  t: number;
  /** percent of the launch sale */
  pct: number;
}

/* Launch sale progress over time (launching Chart tab). */
export const useSoldOverTime = (mint: string, enabled: boolean) =>
  useQuery({
    queryKey: ["sold", mint],
    enabled,
    refetchInterval: enabled ? 15_000 : false,
    queryFn: async (): Promise<SoldPoint[]> => {
      if (config.useMocks) {
        const start = Date.now() - 3 * 3_600_000;
        return [0, 8, 15, 15, 31, 44, 52, 60, 74].map((pct, i) => ({
          t: start + (i * 3 * 3_600_000) / 8,
          pct,
        }));
      }
      const res = await api<{ points: { time: string; soldBps: number }[] }>(
        `/memes/${mint}/sold`,
      );
      return res.points.map((p) => ({
        t: Date.parse(p.time),
        pct: p.soldBps / 100,
      }));
    },
  });
