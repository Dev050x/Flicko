import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { config } from "@/config";
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
  wallet: string;
  at: number;
}

interface ServerTrade {
  signature: string;
  trader: string;
  traderUsername: string | null;
  isBuy: boolean;
  skrAmount: string;
  tokenAmount: string;
  priceAfter: string;
  blockTime: string;
}

const PAGE = 50;

/* Newest first, paged; the first page refreshes every 5s while the tab is open. */
export const useTrades = (mint: string, enabled: boolean) =>
  useInfiniteQuery({
    queryKey: ["trades", mint],
    enabled,
    refetchInterval: enabled ? 5_000 : false,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      if (config.useMocks) {
        const items: TradeView[] = tradesMock.items.map((t, i) => ({
          id: `mock-${i}`,
          side: t.side === "buy" ? "buy" : "sell",
          skr: t.skr,
          price: t.priceSkr,
          tokens: t.skr / t.priceSkr,
          trader: t.trader,
          traderIsAddress: !t.trader.startsWith("@"),
          wallet: t.trader,
          at: Date.now() - t.ageSec * 1000,
        }));
        return { items, nextOffset: null };
      }
      const res = await api<{
        items: ServerTrade[];
        nextOffset: number | null;
      }>(`/memes/${mint}/trades?limit=${PAGE}&offset=${pageParam}`);
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
          wallet: t.trader,
          at: Date.parse(t.blockTime),
        })),
        nextOffset: res.nextOffset,
      };
    },
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });

export interface HolderView {
  rank: number;
  /** "@handle", a short address, or "Pool" */
  label: string;
  isAddress: boolean;
  kind: "pool" | "creator" | "holder";
  /** percent of supply */
  pct: number;
  tokens: number;
  valueSkr: number;
}

export interface HoldersView {
  total: number;
  top10Pct: number;
  creatorPct: number;
  items: HolderView[];
}

interface ServerHolders {
  total: number;
  top10Bps: number;
  creatorBps: number;
  items: {
    rank: number;
    wallet: string | null;
    username: string | null;
    kind: "pool" | "creator" | "holder";
    balance: string;
    shareBps: number;
    value: string;
  }[];
}

export const useHolders = (mint: string, enabled: boolean) =>
  useQuery({
    queryKey: ["holders", mint],
    enabled,
    refetchInterval: enabled ? 30_000 : false,
    queryFn: async (): Promise<HoldersView> => {
      if (config.useMocks) {
        return {
          total: holdersMock.total,
          top10Pct: holdersMock.top10Pct,
          creatorPct: holdersMock.creatorPct,
          items: holdersMock.items.map((h) => ({
            rank: h.rank,
            label: h.label === "Pool" ? "Pool" : (h.label ?? h.address),
            isAddress: !h.label,
            kind:
              h.label === "Pool"
                ? "pool"
                : h.tag === "Creator"
                  ? "creator"
                  : "holder",
            pct: h.pct,
            tokens: h.amount,
            valueSkr: h.valueSkr,
          })),
        };
      }
      const res = await api<ServerHolders>(`/memes/${mint}/holders`);
      return {
        total: res.total,
        top10Pct: res.top10Bps / 100,
        creatorPct: res.creatorBps / 100,
        items: res.items.map((h) => ({
          rank: h.rank,
          label:
            h.kind === "pool"
              ? "Pool"
              : h.username
                ? `@${h.username}`
                : shortAddress(h.wallet ?? ""),
          isAddress: h.kind !== "pool" && !h.username,
          kind: h.kind,
          pct: h.shareBps / 100,
          tokens: Number(h.balance) / TOKEN,
          valueSkr: skrOf(h.value),
        })),
      };
    },
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
