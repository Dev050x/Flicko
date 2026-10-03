import { createBurnCheckedInstruction } from "@solana/spl-token";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { config } from "@/config";
import { api } from "@/lib/api";
import { signAndSend } from "@/lib/mwa";
import { connection } from "@/lib/solana";
import { useSession, type Session } from "@/store/session";

import type { Filter } from "./catalog";

/*
 * Premium filters are free to preview and shoot with; posting a meme that uses one
 * needs it unlocked, which burns its price in SKR from the wallet. The server checks the
 * burn on-chain and remembers the unlock for the wallet.
 */
const unlocksKey = (wallet: string | undefined) =>
  ["filter-unlocks", wallet] as const;

export const useUnlockedFilters = () => {
  const session = useSession((s) => s.session);
  return useQuery({
    queryKey: unlocksKey(session?.wallet),
    enabled: !!session,
    queryFn: async () =>
      new Set(
        (
          await api<{ filterIds: string[] }>("/me/filters", {
            token: session!.token,
          })
        ).filterIds,
      ),
  });
};

export const isLocked = (filter: Filter, unlocked: Set<string> | undefined) =>
  filter.premium && !unlocked?.has(filter.id);

export class UnlockError extends Error {}

const burnTransaction = async (session: Session, filter: Filter) => {
  const owner = new PublicKey(session.wallet);
  const mint = new PublicKey(config.skrMint);
  const amount =
    BigInt(filter.priceSkr ?? 0) * 10n ** BigInt(config.skrDecimals);
  const { value } = await connection.getParsedTokenAccountsByOwner(owner, {
    mint,
  });
  const source = value.find(
    ({ account }) =>
      BigInt(
        (account.data.parsed as { info: { tokenAmount: { amount: string } } })
          .info.tokenAmount.amount,
      ) >= amount,
  );
  if (!source) {
    throw new UnlockError(`You need ${filter.priceSkr} SKR to unlock this.`);
  }
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();
  const tx = new Transaction({
    feePayer: owner,
    blockhash,
    lastValidBlockHeight,
  }).add(
    createBurnCheckedInstruction(
      source.pubkey,
      mint,
      owner,
      amount,
      config.skrDecimals,
      [],
      source.account.owner,
    ),
  );
  return { tx, blockhash, lastValidBlockHeight };
};

/*
 * Burn → wait for confirmation → POST /filters/unlock. Call from the post flow.
 */
export const useUnlockFilter = () => {
  const client = useQueryClient();
  return useCallback(
    async (filter: Filter) => {
      const { session, setMwaAuthToken } = useSession.getState();
      if (!session) throw new UnlockError("Connect a wallet to unlock.");
      const built = await burnTransaction(session, filter);
      const { signature, authToken } = await signAndSend(
        session.mwaAuthToken,
        async () => built.tx,
      );
      setMwaAuthToken(authToken);
      await connection.confirmTransaction(
        {
          signature,
          blockhash: built.blockhash,
          lastValidBlockHeight: built.lastValidBlockHeight,
        },
        "confirmed",
      );
      await api("/filters/unlock", {
        method: "POST",
        token: session.token,
        body: { filterId: filter.id, signature },
      });
      client.invalidateQueries({ queryKey: unlocksKey(session.wallet) });
      client.invalidateQueries({ queryKey: ["skr-balance", session.wallet] });
    },
    [client],
  );
};
