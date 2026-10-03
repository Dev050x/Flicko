import { PublicKey } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";

import { config } from "@/config";
import { connection } from "@/lib/solana";

/*
 * The wallet's SKR balance in whole SKR, summed over its SKR token accounts. Refreshes
 * every 20s while something is showing it.
 */
export const skrBalanceKey = (wallet: string | undefined) =>
  ["skr-balance", wallet] as const;

export const useSkrBalance = (wallet: string | undefined) =>
  useQuery({
    queryKey: skrBalanceKey(wallet),
    enabled: !!wallet,
    refetchInterval: 20_000,
    queryFn: async () => {
      const { value } = await connection.getParsedTokenAccountsByOwner(
        new PublicKey(wallet!),
        { mint: new PublicKey(config.skrMint) },
      );
      return value.reduce(
        (sum, { account }) =>
          sum +
          Number(
            (
              account.data.parsed as {
                info: { tokenAmount: { uiAmountString?: string } };
              }
            ).info.tokenAmount.uiAmountString ?? 0,
          ),
        0,
      );
    },
  });

/*
 * "1,240" for big balances, up to two decimals for small ones.
 */
export const formatSkr = (value: number) =>
  value.toLocaleString("en-US", {
    maximumFractionDigits: value >= 100 ? 0 : 2,
  });
