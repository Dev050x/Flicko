import {
  configPda,
  CREATE_MEME_SIGNATURES,
  createMemeAccountSizes,
  getReadonlyProgram,
} from "@flicko/sdk";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";

import { config } from "@/config";
import { connection } from "@/lib/solana";

/*
 * What the Launch screen reads from chain: the program Config (creation fee, allowed
 * supply and price ranges), the network fee for create_meme, and the SOL balance.
 */
export const programId = new PublicKey(config.programId);
export const program = getReadonlyProgram(connection, programId);

const LAMPORTS_PER_SIGNATURE = 5_000;

export interface LaunchConfig {
  /** SKR base units, burned on create */
  creationFee: bigint;
  creatorFeeBps: number;
  minSupply: bigint;
  maxSupply: bigint;
  minStartPrice: bigint;
  maxStartPrice: bigint;
}

export const useLaunchConfig = () =>
  useQuery({
    queryKey: ["launch-config", config.programId],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<LaunchConfig> => {
      const account = await program.account.config.fetch(configPda(programId));
      return {
        creationFee: BigInt(account.creationFee.toString()),
        creatorFeeBps: account.creatorFeeBps,
        minSupply: BigInt(account.minSupply.toString()),
        maxSupply: BigInt(account.maxSupply.toString()),
        minStartPrice: BigInt(account.minStartPrice.toString()),
        maxStartPrice: BigInt(account.maxStartPrice.toString()),
      };
    },
  });

/*
 * Rent for the mint (which grows with name, symbol and uri), the Meme account and both
 * vaults, plus the signature fees. The uri isn't known until upload, so a typical one
 * stands in.
 */
const TYPICAL_URI = `https://flicko.s3.amazonaws.com/memes/${"0".repeat(64)}.json`;

export const useNetworkFee = (name: string, symbol: string) =>
  useQuery({
    queryKey: ["create-network-fee", name.length, symbol.length],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const sizes = createMemeAccountSizes(name || "x", symbol || "X", TYPICAL_URI);
      const rents = await Promise.all(
        sizes.map((size) => connection.getMinimumBalanceForRentExemption(size)),
      );
      const lamports =
        rents.reduce((a, b) => a + b, 0) + CREATE_MEME_SIGNATURES * LAMPORTS_PER_SIGNATURE;
      return lamports / LAMPORTS_PER_SOL;
    },
  });

export const useSolBalance = (wallet: string | undefined) =>
  useQuery({
    queryKey: ["sol-balance", wallet],
    enabled: !!wallet,
    refetchInterval: 20_000,
    queryFn: async () =>
      (await connection.getBalance(new PublicKey(wallet!))) / LAMPORTS_PER_SOL,
  });
