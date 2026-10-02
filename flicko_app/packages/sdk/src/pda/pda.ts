import { PublicKey } from "@solana/web3.js";
import {
  ATTESTOR_SEED,
  CONFIG_SEED,
  MEME_SEED,
  PROGRAM_ID,
  SKR_VAULT_SEED,
  TOKEN_VAULT_SEED,
} from "../core/constants";

const seed = (value: string) => Buffer.from(value);

export const configPda = (programId: PublicKey = PROGRAM_ID) =>
  PublicKey.findProgramAddressSync([seed(CONFIG_SEED)], programId)[0];

export const attestorPda = (programId: PublicKey = PROGRAM_ID) =>
  PublicKey.findProgramAddressSync([seed(ATTESTOR_SEED)], programId)[0];

export const memePda = (mint: PublicKey, programId: PublicKey = PROGRAM_ID) =>
  PublicKey.findProgramAddressSync(
    [seed(MEME_SEED), mint.toBuffer()],
    programId,
  )[0];

export const tokenVaultPda = (
  meme: PublicKey,
  programId: PublicKey = PROGRAM_ID,
) =>
  PublicKey.findProgramAddressSync(
    [seed(TOKEN_VAULT_SEED), meme.toBuffer()],
    programId,
  )[0];

export const skrVaultPda = (
  meme: PublicKey,
  programId: PublicKey = PROGRAM_ID,
) =>
  PublicKey.findProgramAddressSync(
    [seed(SKR_VAULT_SEED), meme.toBuffer()],
    programId,
  )[0];

export const memeAccounts = (
  mint: PublicKey,
  programId: PublicKey = PROGRAM_ID,
) => {
  const meme = memePda(mint, programId);
  return {
    meme,
    tokenVault: tokenVaultPda(meme, programId),
    skrVault: skrVaultPda(meme, programId),
  };
};
