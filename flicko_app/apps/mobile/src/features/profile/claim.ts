import { claimCreatorFeesInstructionRaw } from "@flicko/sdk";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  type BlockhashWithExpiryBlockHeight,
} from "@solana/web3.js";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { config } from "@/config";
import { programId } from "@/features/create/chain";
import { skrBalanceKey } from "@/features/wallet/skr-balance";
import { api } from "@/lib/api";
import { ConnectError, NotSubmittedError, signAndSend } from "@/lib/mwa";
import { connection } from "@/lib/solana";
import { useSession } from "@/store/session";

/* Memes per transaction: each claim adds 7 accounts, so this stays well under the size limit. */
const PER_TX = 4;

interface Claimable {
  mint: string;
  symbol: string;
  claimable: string;
}

export class ClaimProblem extends Error {}

/*
 * Claims creator fees on every meme that has some. The server lists them (from the
 * indexer), they are batched PER_TX to a transaction and signed one wallet prompt at a
 * time. Resolves with the SKR claimed so far for the toast; null when the wallet was
 * cancelled before anything went through.
 */
export const useClaim = () => {
  const client = useQueryClient();
  const [claiming, setClaiming] = useState(false);

  const run = useCallback(async (): Promise<number | null> => {
    const { session, setMwaAuthToken } = useSession.getState();
    if (!session || claiming) return null;
    setClaiming(true);
    const owner = new PublicKey(session.wallet);
    const skrMint = new PublicKey(config.skrMint);
    let claimed = 0n;
    try {
      const { items } = await api<{ items: Claimable[] }>("/me/claimable", {
        token: session.token,
      });
      for (let i = 0; i < items.length; i += PER_TX) {
        const batch = items.slice(i, i + PER_TX);
        const instructions = [
          createAssociatedTokenAccountIdempotentInstruction(
            owner,
            getAssociatedTokenAddressSync(skrMint, owner),
            owner,
            skrMint,
          ),
          ...batch.map((item) =>
            claimCreatorFeesInstructionRaw(
              { creator: owner, mint: new PublicKey(item.mint), skrMint },
              programId,
            ),
          ),
        ];
        let latest: BlockhashWithExpiryBlockHeight | null = null;
        let sent;
        try {
          sent = await signAndSend(session.mwaAuthToken, async () => {
            latest = await connection.getLatestBlockhash("confirmed");
            return new VersionedTransaction(
              new TransactionMessage({
                payerKey: owner,
                recentBlockhash: latest.blockhash,
                instructions,
              }).compileToV0Message(),
            );
          });
        } catch (err) {
          if (err instanceof ConnectError) {
            if (claimed === 0n) return null;
            break;
          }
          if (err instanceof NotSubmittedError) {
            throw new ClaimProblem(
              "Your wallet didn't send it. Check your SOL and try again.",
            );
          }
          throw err;
        }
        setMwaAuthToken(sent.authToken);
        const { value } = await connection.confirmTransaction(
          { signature: sent.signature, ...latest! },
          "confirmed",
        );
        if (value.err)
          throw new ClaimProblem("The claim didn't go through. Try again.");
        claimed += batch.reduce(
          (sum, item) => sum + BigInt(item.claimable),
          0n,
        );
      }
      return Number(claimed) / 10 ** config.skrDecimals;
    } catch (err) {
      if (err instanceof ClaimProblem) throw err;
      console.warn("[claim] failed", err);
      throw new ClaimProblem("Something went wrong. Try again.");
    } finally {
      setClaiming(false);
      // The indexer needs a moment to see the claim, so refetch now and again shortly.
      const refresh = () => {
        client.invalidateQueries({ queryKey: ["earnings"] });
        client.invalidateQueries({ queryKey: ["portfolio"] });
        client.invalidateQueries({ queryKey: ["activity"] });
        client.invalidateQueries({ queryKey: skrBalanceKey(session.wallet) });
      };
      refresh();
      setTimeout(refresh, 4000);
    }
  }, [claiming, client]);

  return { claiming, run };
};
