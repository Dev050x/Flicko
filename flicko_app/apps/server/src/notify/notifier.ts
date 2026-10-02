import { and, eq, gt, inArray, isNotNull, ne } from "drizzle-orm";
import { memes, positions, users } from "../db/schema";
import type { Db } from "../db/types";
import type { FlickoEvent } from "../indexer/events";
import type { PushMessage, PushSender } from "./expo";

export const GAIN_THRESHOLDS_BPS = [5_000, 10_000, 40_000, 90_000];
const BUYER_COOLDOWN_MS = 5 * 60_000;
const MAX_EVENT_AGE_MS = 15 * 60_000;
const TOKEN_UNIT = 1_000_000n;

export interface NotifierDeps {
  db: Db;
  sender: PushSender;
  now?: () => number;
  log?: (message: string) => void;
}

const skr = (amount: string) => {
  const whole = Number(BigInt(amount) / 10_000n) / 100;
  return whole.toLocaleString("en-US", { maximumFractionDigits: 2 });
};

const gainLabel = (bps: number) =>
  bps >= 10_000 ? `${bps / 10_000 + 1}x` : `${bps / 100}%`;

export const createNotifier = (deps: NotifierDeps) => {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? (() => {});
  const lastBuyerPing = new Map<string, number>();

  const tokensOf = async (wallets: string[]) => {
    if (wallets.length === 0) return new Map<string, string>();
    const rows = await deps.db
      .select({ wallet: users.wallet, token: users.pushToken })
      .from(users)
      .where(and(inArray(users.wallet, wallets), isNotNull(users.pushToken)));
    return new Map(rows.map((row) => [row.wallet, row.token!]));
  };

  const memeByPda = async (memePda: string) => {
    const [meme] = await deps.db
      .select({
        mint: memes.mint,
        name: memes.name,
        creator: memes.creator,
        price: memes.price,
      })
      .from(memes)
      .where(eq(memes.memePda, memePda));
    return meme;
  };

  const holdersOf = (mint: string) =>
    deps.db
      .select()
      .from(positions)
      .where(and(eq(positions.mint, mint), gt(positions.balance, "0")));

  const graduated = async (memePda: string): Promise<PushMessage[]> => {
    const meme = await memeByPda(memePda);
    if (!meme) return [];
    const holders = await holdersOf(meme.mint);
    const wallets = [
      ...new Set([meme.creator, ...holders.map((h) => h.wallet)]),
    ];
    const tokens = await tokensOf(wallets);
    return [...tokens.values()].map((to) => ({
      to,
      title: `🎓 ${meme.name} graduated!`,
      body: "The launch sold out. It now trades in a locked pool forever.",
      data: { kind: "graduated", mint: meme.mint },
    }));
  };

  const newBuyer = async (
    event: Extract<FlickoEvent, { kind: "trade" }>,
  ): Promise<PushMessage[]> => {
    if (!event.isBuy) return [];
    const meme = await memeByPda(event.meme);
    if (!meme || meme.creator === event.trader) return [];
    const last = lastBuyerPing.get(meme.mint) ?? 0;
    if (now() - last < BUYER_COOLDOWN_MS) return [];
    const to = (await tokensOf([meme.creator])).get(meme.creator);
    if (!to) return [];
    lastBuyerPing.set(meme.mint, now());
    return [
      {
        to,
        title: `🟢 New buyer on ${meme.name}`,
        body: `Someone just bought ${skr(event.skrAmount)} SKR worth. You earn 2% of every trade.`,
        data: { kind: "buyer", mint: meme.mint },
      },
    ];
  };

  const gains = async (memePda: string): Promise<PushMessage[]> => {
    const meme = await memeByPda(memePda);
    if (!meme) return [];
    const price = BigInt(meme.price);
    const crossed: { wallet: string; threshold: number }[] = [];
    for (const position of await holdersOf(meme.mint)) {
      const cost = BigInt(position.costBasisSkr);
      if (cost === 0n) continue;
      const value = (BigInt(position.balance) * price) / TOKEN_UNIT;
      const gainBps = Number(((value - cost) * 10_000n) / cost);
      const threshold = GAIN_THRESHOLDS_BPS.filter((t) => t <= gainBps).at(-1);
      if (threshold && threshold > position.notifiedGainBps) {
        crossed.push({ wallet: position.wallet, threshold });
      }
    }
    if (crossed.length === 0) return [];
    for (const { wallet, threshold } of crossed) {
      await deps.db
        .update(positions)
        .set({ notifiedGainBps: threshold })
        .where(
          and(
            eq(positions.wallet, wallet),
            eq(positions.mint, meme.mint),
            ne(positions.notifiedGainBps, threshold),
          ),
        );
    }
    const tokens = await tokensOf(crossed.map((c) => c.wallet));
    return crossed.flatMap(({ wallet, threshold }) => {
      const to = tokens.get(wallet);
      if (!to) return [];
      return [
        {
          to,
          title: `🚀 ${meme.name} is up ${gainLabel(threshold)}`,
          body: "Your bag is pumping. Take profit or keep holding?",
          data: { kind: "gain", mint: meme.mint },
        },
      ];
    });
  };

  const notify = async (events: FlickoEvent[], blockTime: number | null) => {
    if (events.length === 0) return 0;
    if (blockTime !== null && now() - blockTime * 1000 > MAX_EVENT_AGE_MS) {
      return 0;
    }
    const messages: PushMessage[] = [];
    const priced = new Set<string>();
    for (const event of events) {
      if (event.kind === "graduated")
        messages.push(...(await graduated(event.meme)));
      if (event.kind === "trade") {
        messages.push(...(await newBuyer(event)));
        priced.add(event.meme);
      }
    }
    for (const memePda of priced) messages.push(...(await gains(memePda)));
    if (messages.length === 0) return 0;

    const { invalidTokens } = await deps.sender.send(messages);
    if (invalidTokens.length) {
      await deps.db
        .update(users)
        .set({ pushToken: null })
        .where(inArray(users.pushToken, invalidTokens));
      log(`cleared ${invalidTokens.length} dead push tokens`);
    }
    return messages.length;
  };

  return { notify };
};

export type Notifier = ReturnType<typeof createNotifier>;
