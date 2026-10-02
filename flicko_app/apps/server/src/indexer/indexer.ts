import { eq } from "drizzle-orm";
import { indexerState } from "../db/schema";
import type { Db } from "../db/types";
import { applyTransaction } from "./apply";
import type { ChainSource } from "./chain";
import type { FlickoEvent } from "./events";

export interface IndexerDeps {
  db: Db;
  chain: ChainSource;
  decode: (logs: string[]) => FlickoEvent[];
  id?: string;
  catchUpMs?: number;
  retryMs?: number;
  log?: (message: string) => void;
}

export const createIndexer = (deps: IndexerDeps) => {
  const id = deps.id ?? "flicko";
  const log = deps.log ?? (() => {});
  const retryMs = deps.retryMs ?? 1_000;
  const queue: string[] = [];
  const queued = new Set<string>();
  const done = new Set<string>();
  let draining: Promise<void> | null = null;
  let stopped = false;

  const lastSignature = async () => {
    const [row] = await deps.db
      .select()
      .from(indexerState)
      .where(eq(indexerState.id, id));
    return row?.lastSignature ?? undefined;
  };

  const saveProgress = async (signature: string, slot: number) => {
    const values = {
      lastSignature: signature,
      lastSlot: slot,
      updatedAt: new Date(),
    };
    await deps.db
      .insert(indexerState)
      .values({ id, ...values })
      .onConflictDoUpdate({ target: indexerState.id, set: values });
  };

  const fetchWithRetry = async (signature: string) => {
    for (let attempt = 0; attempt < 5 && !stopped; attempt++) {
      const tx = await deps.chain.transaction(signature);
      if (tx) return tx;
      await Bun.sleep(retryMs);
    }
    return null;
  };

  const process = async (signature: string) => {
    const tx = await fetchWithRetry(signature);
    if (!tx) {
      log(`skipped ${signature}: transaction not found`);
      return;
    }
    const result = await applyTransaction(
      {
        db: deps.db,
        decode: deps.decode,
        loadMemeState: deps.chain.loadMemeState,
      },
      tx,
    );
    await saveProgress(signature, tx.slot);
    done.add(signature);
    if (result.events) log(`indexed ${signature} (${result.events} events)`);
  };

  const drain = () => {
    draining ??= (async () => {
      while (queue.length && !stopped) {
        const signature = queue.shift()!;
        queued.delete(signature);
        if (done.has(signature)) continue;
        try {
          await process(signature);
        } catch (err) {
          log(`failed ${signature}: ${(err as Error).message}`);
        }
      }
    })().finally(() => {
      draining = null;
      if (queue.length && !stopped) void drain();
    });
    return draining;
  };

  const enqueue = (signatures: string[]) => {
    for (const signature of signatures) {
      if (done.has(signature) || queued.has(signature)) continue;
      queued.add(signature);
      queue.push(signature);
    }
    return drain();
  };

  const catchUp = async () =>
    enqueue(await deps.chain.signaturesAfter(await lastSignature()));

  let unsubscribe = () => {};
  let timer: ReturnType<typeof setInterval> | undefined;

  return {
    catchUp,
    start: async () => {
      unsubscribe = deps.chain.onSignature((signature) => {
        void enqueue([signature]);
      });
      await catchUp().catch((err) =>
        log(`initial catch-up failed, retrying: ${(err as Error).message}`),
      );
      timer = setInterval(() => {
        catchUp().catch((err) =>
          log(`catch-up failed: ${(err as Error).message}`),
        );
      }, deps.catchUpMs ?? 30_000);
    },
    stop: async () => {
      unsubscribe();
      if (timer) clearInterval(timer);
      while (draining) await draining;
      stopped = true;
    },
  };
};
