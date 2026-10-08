import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  type Connection,
  type Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
} from "@solana/web3.js";
import { and, eq, isNull } from "drizzle-orm";
import { skrAirdrops } from "../db/schema";
import type { Db } from "../db/types";

/* Sends one wallet its welcome SKR and returns the transaction signature. */
export interface WelcomeAirdrop {
  /** SKR base units */
  amount: bigint;
  send: (wallet: string) => Promise<string>;
}

/*
 * Welcome SKR as a plain token transfer from a faucet wallet (devnet): the faucet pays
 * the fee and, if needed, the new user's SKR account rent. The server never holds the
 * mint authority.
 */
export const faucetAirdrop = (opts: {
  connection: Connection;
  faucet: Keypair;
  skrMint: PublicKey;
  decimals: number;
  amount: bigint;
}): WelcomeAirdrop => {
  const { connection, faucet, skrMint, decimals, amount } = opts;
  const source = getAssociatedTokenAddressSync(skrMint, faucet.publicKey);
  return {
    amount,
    send: async (wallet) => {
      const owner = new PublicKey(wallet);
      const destination = getAssociatedTokenAddressSync(skrMint, owner);
      const tx = new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(
          faucet.publicKey,
          destination,
          owner,
          skrMint,
        ),
        createTransferCheckedInstruction(
          source,
          skrMint,
          destination,
          faucet.publicKey,
          amount,
          decimals,
        ),
      );
      return sendAndConfirmTransaction(connection, tx, [faucet], {
        commitment: "confirmed",
      });
    },
  };
};

const sending = new Set<string>();

/*
 * Queue the welcome SKR for a new wallet (once ever), then send whatever is still
 * unsent for it. Never throws: sign-in must not fail because the faucet did.
 */
export const grantWelcomeSkr = async (
  db: Db,
  airdrop: WelcomeAirdrop,
  wallet: string,
  isNewUser: boolean,
) => {
  if (sending.has(wallet)) return;
  sending.add(wallet);
  try {
    if (isNewUser) {
      await db
        .insert(skrAirdrops)
        .values({ wallet, amount: airdrop.amount.toString() })
        .onConflictDoNothing();
    }
    const unsent = and(eq(skrAirdrops.wallet, wallet), isNull(skrAirdrops.signature));
    const [pending] = await db.select().from(skrAirdrops).where(unsent);
    if (!pending) return;
    const signature = await airdrop.send(wallet);
    await db.update(skrAirdrops).set({ signature }).where(unsent);
    console.log(`[airdrop] sent welcome SKR to ${wallet}: ${signature}`);
  } catch (err) {
    console.warn(`[airdrop] welcome SKR for ${wallet} failed`, err);
  } finally {
    sending.delete(wallet);
  }
};
