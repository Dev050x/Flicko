import { getReadonlyProgram, memePrice, toMemeState } from "@flicko/sdk";
import { Connection, PublicKey } from "@solana/web3.js";
import type { ChainTransaction, MemeChainState } from "./apply";

export interface ChainSource {
  signaturesAfter(until: string | undefined): Promise<string[]>;
  transaction(signature: string): Promise<ChainTransaction | null>;
  loadMemeState(memePda: string): Promise<MemeChainState | null>;
  onSignature(listener: (signature: string) => void): () => void;
}

const PAGE = 1000;

export const connectionSource = (
  rpcUrl: string,
  wsUrl: string | undefined,
  programId: PublicKey,
): ChainSource => {
  const connection = new Connection(rpcUrl, {
    commitment: "confirmed",
    wsEndpoint: wsUrl,
  });
  const program = getReadonlyProgram(connection, programId);

  return {
    signaturesAfter: async (until) => {
      const found: string[] = [];
      let before: string | undefined;
      for (;;) {
        const page = await connection.getSignaturesForAddress(programId, {
          until,
          before,
          limit: PAGE,
        });
        found.push(...page.filter((s) => !s.err).map((s) => s.signature));
        if (page.length < PAGE) break;
        before = page[page.length - 1]!.signature;
      }
      return found.reverse();
    },
    transaction: async (signature) => {
      const tx = await connection.getTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      if (!tx) return null;
      return {
        signature,
        slot: tx.slot,
        blockTime: tx.blockTime ?? null,
        err: tx.meta?.err ?? null,
        logs: tx.meta?.logMessages ?? [],
      };
    },
    loadMemeState: async (memePda) => {
      const account = await program.account.meme.fetchNullable(
        new PublicKey(memePda),
      );
      if (!account) return null;
      const state = toMemeState(account);
      return {
        phase: state.phase,
        tokensSold: state.tokensSold.toString(),
        realSkr: state.realSkr.toString(),
        poolSkr: state.poolSkr.toString(),
        poolTokens: state.poolTokens.toString(),
        price: memePrice(state).toString(),
      };
    },
    onSignature: (listener) => {
      const id = connection.onLogs(
        programId,
        (logs) => {
          if (!logs.err) listener(logs.signature);
        },
        "confirmed",
      );
      return () => {
        void connection.removeOnLogsListener(id);
      };
    },
  };
};
