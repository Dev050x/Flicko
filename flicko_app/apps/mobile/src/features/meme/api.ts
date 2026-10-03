import { memePda } from "@flicko/sdk";
import { PublicKey } from "@solana/web3.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ImageSource } from "expo-image";

import { config } from "@/config";
import { skrOf, type MarketRow, type Window } from "@/features/markets/api";
import { api } from "@/lib/api";
import { connection } from "@/lib/solana";
import detailMock from "@/mocks/meme-detail.json";
import { useSession } from "@/store/session";

/*
 * The meme page: `GET /memes/:mint` ({meme, overview}, base units as strings) mapped to
 * MemeView in whole SKR / whole tokens. With EXPO_PUBLIC_USE_MOCKS=1 it comes from
 * src/mocks/meme-detail.json.
 */
const TOKEN = 1e6;

export type ReactionKind = "rocket" | "fire" | "poop";
export const REACTIONS: { kind: ReactionKind; emoji: string }[] = [
  { kind: "rocket", emoji: "🚀" },
  { kind: "fire", emoji: "🔥" },
  { kind: "poop", emoji: "💩" },
];

export interface MemeView {
  mint: string;
  symbol: string;
  name: string;
  image: ImageSource | number | null;
  creator: { wallet: string; handle: string | null };
  creatorMemes: number;
  createdAt: number;
  phase: "pool" | "launching";
  /** 0-100 */
  launchPct: number;
  trendingRank: number | null;
  priceSkr: number;
  /** percent per window */
  change: Record<Window, number>;
  marketCapSkr: number;
  liquiditySkr: number;
  holders: number;
  volume24hSkr: number;
  trades24h: number;
  /** whole tokens */
  supply: number;
  /** whole tokens left in the launch sale (launching only) */
  saleLeft: number;
  activity: { buys: number; sells: number; buyers: number; sellers: number };
  /** graduated: pool reserves; launching: SKR raised so far */
  pool: { tokens: number; skr: number };
  memePda: string;
  creatorHoldsPct: number;
  reactions: Record<ReactionKind, number>;
  myReactions: ReactionKind[];
  position: {
    tokens: number;
    avgBuySkr: number;
    valueSkr: number;
    pnlSkr: number;
    pnlPct: number;
  } | null;
  /** oldest first, SKR */
  sparkline: number[];
}

interface ServerMeme {
  mint: string;
  name: string;
  symbol: string;
  imageUrl: string | null;
  creator: string;
  creatorUsername: string | null;
  phase: "launch" | "graduated";
  price: string;
  createdAt: string;
  totalSupply: string;
  tokensSold: string;
  saleSupply: string;
  realSkr: string;
  poolSkr: string;
  poolTokens: string;
  memePda: string;
}

interface ServerOverview {
  market: Omit<MarketRow, "mint" | "name" | "symbol" | "imageUrl" | "createdAt"> & {
    buys24h: number;
    sells24h: number;
    buyers24h: number;
    sellers24h: number;
    sparkline: string[];
  };
  trendingRank: number | null;
  creatorHoldsBps: number;
  creatorMemes: number;
  reactions: Record<ReactionKind, number>;
  myReactions: ReactionKind[];
  position: {
    balance: string;
    avgBuyPrice: string;
    value: string;
    pnl: string;
    pnlBps: number;
  } | null;
}

const toView = ({ meme, overview }: { meme: ServerMeme; overview: ServerOverview }): MemeView => {
  const m = overview.market;
  const price = skrOf(meme.price);
  const graduated = meme.phase === "graduated";
  return {
    mint: meme.mint,
    symbol: meme.symbol,
    name: meme.name,
    image: meme.imageUrl ? { uri: meme.imageUrl } : null,
    creator: { wallet: meme.creator, handle: meme.creatorUsername },
    creatorMemes: overview.creatorMemes,
    createdAt: Date.parse(meme.createdAt),
    phase: graduated ? "pool" : "launching",
    launchPct: m.launchProgressBps / 100,
    trendingRank: overview.trendingRank,
    priceSkr: price,
    change: { "5m": m.change.m5 / 100, "1h": m.change.h1 / 100, "6h": m.change.h6 / 100, "24h": m.change.h24 / 100 },
    marketCapSkr: skrOf(m.marketCap),
    liquiditySkr: skrOf(m.liquidity),
    holders: m.holders,
    volume24hSkr: skrOf(m.volume.h24),
    trades24h: m.txns.h24,
    supply: Number(meme.totalSupply) / TOKEN,
    saleLeft: Math.max(0, (Number(meme.saleSupply) - Number(meme.tokensSold)) / TOKEN),
    activity: {
      buys: m.buys24h,
      sells: m.sells24h,
      buyers: m.buyers24h,
      sellers: m.sellers24h,
    },
    pool: graduated
      ? { tokens: Number(meme.poolTokens) / TOKEN, skr: skrOf(meme.poolSkr) }
      : { tokens: Math.max(0, (Number(meme.saleSupply) - Number(meme.tokensSold)) / TOKEN), skr: skrOf(meme.realSkr) },
    memePda: meme.memePda,
    creatorHoldsPct: overview.creatorHoldsBps / 100,
    reactions: overview.reactions,
    myReactions: overview.myReactions,
    position: overview.position && {
      tokens: Number(overview.position.balance) / TOKEN,
      avgBuySkr: skrOf(overview.position.avgBuyPrice),
      valueSkr: skrOf(overview.position.value),
      pnlSkr: skrOf(overview.position.pnl),
      pnlPct: overview.position.pnlBps / 100,
    },
    sparkline: [...m.sparkline.map(skrOf), price],
  };
};

const mockView = (): MemeView => {
  const d = detailMock;
  return {
    mint: d.mint,
    symbol: d.symbol,
    name: d.name,
    image: require("../../../assets/mocks/detail-squad.jpg"),
    creator: { wallet: d.creator.wallet, handle: d.creator.handle },
    creatorMemes: d.creator.memes,
    createdAt: Date.parse(d.createdAt),
    phase: d.phase === "pool" ? "pool" : "launching",
    launchPct: 100,
    trendingRank: d.trendingRank,
    priceSkr: d.priceSkr,
    change: { "5m": d.change["5m"], "1h": d.change["1h"], "6h": d.change["6h"], "24h": d.change["24h"] },
    marketCapSkr: d.marketCapSkr,
    liquiditySkr: d.liquiditySkr,
    holders: d.holders,
    volume24hSkr: d.volume24hSkr,
    trades24h: d.trades24h,
    supply: d.supply,
    saleLeft: 0,
    activity: d.activity24h,
    pool: { tokens: d.pool.tokenAmount, skr: d.pool.skrAmount },
    memePda: d.pool.poolAddress,
    creatorHoldsPct: d.safety.creatorHoldsPct,
    reactions: { rocket: d.reactions.rocket, fire: d.reactions.fire, poop: d.reactions.poop },
    myReactions: [],
    position: {
      tokens: d.position.tokens,
      avgBuySkr: d.position.avgBuySkr,
      valueSkr: d.position.valueSkr,
      pnlSkr: d.position.pnlSkr,
      pnlPct: d.position.pnlPct,
    },
    sparkline: d.sparkline24h,
  };
};

export const memeKey = (mint: string, wallet: string | undefined) => ["meme", mint, wallet] as const;

export const useMemeDetail = (mint: string) => {
  const session = useSession((s) => s.session);
  return useQuery({
    queryKey: memeKey(mint, session?.wallet),
    refetchInterval: 15_000,
    queryFn: async () => {
      if (config.useMocks) return mockView();
      const res = await api<{ meme: ServerMeme; overview: ServerOverview }>(`/memes/${mint}`, {
        token: session?.token,
      });
      return toView(res);
    },
  });
};

export interface SafetyChecks {
  mintAuthorityRevoked: boolean;
  noFreezeAuthority: boolean;
  liquidityLocked: boolean;
}

/*
 * The on-chain half of the safety card: the mint's authorities (parsed Token-2022 mint)
 * and that the Meme account, which holds the pool, is owned by the Flicko program.
 */
export const useSafetyChecks = (mint: string) =>
  useQuery({
    queryKey: ["safety", mint],
    staleTime: Infinity,
    queryFn: async (): Promise<SafetyChecks> => {
      if (config.useMocks) {
        return { mintAuthorityRevoked: true, noFreezeAuthority: true, liquidityLocked: true };
      }
      const programId = new PublicKey(config.programId);
      const mintKey = new PublicKey(mint);
      const [mintInfo, memeInfo] = await Promise.all([
        connection.getParsedAccountInfo(mintKey),
        connection.getAccountInfo(memePda(mintKey, programId)),
      ]);
      const parsed = (mintInfo.value?.data as { parsed?: { info?: Record<string, unknown> } })
        ?.parsed?.info;
      return {
        mintAuthorityRevoked: !!parsed && parsed.mintAuthority == null,
        noFreezeAuthority: !!parsed && parsed.freezeAuthority == null,
        liquidityLocked: !!memeInfo && memeInfo.owner.equals(programId),
      };
    },
  });

/* React once per kind; tapping again takes it back. Updates the counts right away. */
export const useReact = (mint: string) => {
  const client = useQueryClient();
  const session = useSession((s) => s.session);
  const key = memeKey(mint, session?.wallet);
  return useMutation({
    mutationFn: async ({ kind, on }: { kind: ReactionKind; on: boolean }) => {
      if (config.useMocks) return;
      if (!session) throw new Error("not signed in");
      await api(on ? `/memes/${mint}/react` : `/memes/${mint}/react/${kind}`, {
        method: on ? "POST" : "DELETE",
        body: on ? { kind } : undefined,
        token: session.token,
      });
    },
    onMutate: async ({ kind, on }) => {
      await client.cancelQueries({ queryKey: key });
      const before = client.getQueryData<MemeView>(key);
      if (before) {
        client.setQueryData<MemeView>(key, {
          ...before,
          reactions: { ...before.reactions, [kind]: before.reactions[kind] + (on ? 1 : -1) },
          myReactions: on
            ? [...before.myReactions, kind]
            : before.myReactions.filter((k) => k !== kind),
        });
      }
      return { before };
    },
    onError: (_err, _vars, context) => {
      if (context?.before) client.setQueryData(key, context.before);
    },
    onSettled: () => {
      if (!config.useMocks) client.invalidateQueries({ queryKey: key });
    },
  });
};
