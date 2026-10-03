import {
  buyInstructionRaw,
  decodeMemeAccount,
  memePda,
  memePrice,
  memeTokenAccount,
  quoteBuy,
  quoteSell,
  sellInstructionRaw,
  skrInForTokens,
  withSlippage,
  type FeeConfig,
  type MemeAccountDecoded,
} from "@flicko/sdk";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  type BlockhashWithExpiryBlockHeight,
} from "@solana/web3.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { config } from "@/config";
import { skrBalanceKey } from "@/features/wallet/skr-balance";
import { ConnectError, NotSubmittedError, signAndSend } from "@/lib/mwa";
import { connection } from "@/lib/solana";
import { useSession } from "@/store/session";

import { useFeedStore } from "./store";

/*
 * Buying and selling from the feed. Quotes come from @flicko/sdk's math on the Meme
 * account read straight from the chain (decoded by hand; Anchor's coder doesn't run on
 * the phone), and the buy/sell instructions are built by hand for the same reason.
 * Amounts in base units: meme tokens and SKR both have 6 decimals.
 */
export const TOKEN_UNIT = 1_000_000n;
const SLIPPAGE_BPS = 100;
const BASE_FEE_LAMPORTS = 5_000;
// A Token-2022 associated account for a meme mint (account + ImmutableOwner).
const MEME_TOKEN_ACCOUNT_SIZE = 170;

const programId = new PublicKey(config.programId);
const skrMint = new PublicKey(config.skrMint);
const skrUnit = 10n ** BigInt(config.skrDecimals);

export type TradeSide = "buy" | "sell";

/** whole SKR as a number, from base units */
export const skrNumber = (units: bigint) => Number(units) / Number(skrUnit);

const fetchMemeState = async (mint: string) => {
  const info = await connection.getAccountInfo(memePda(new PublicKey(mint), programId));
  if (!info) throw new Error(`no Meme account for ${mint}`);
  return decodeMemeAccount(info.data);
};

/* The meme's live on-chain state while the sheet is open. */
export const useMemeState = (mint: string) =>
  useQuery({
    queryKey: ["meme-state", mint],
    refetchInterval: 5_000,
    queryFn: () => fetchMemeState(mint),
  });

/* The wallet's meme tokens (base units) and whether its token account exists. */
export const useTokenHolding = (wallet: string | undefined, mint: string) =>
  useQuery({
    queryKey: ["token-holding", wallet, mint],
    enabled: !!wallet,
    queryFn: async () => {
      const account = memeTokenAccount(new PublicKey(wallet!), new PublicKey(mint));
      try {
        const { value } = await connection.getTokenAccountBalance(account);
        return { amount: BigInt(value.amount), exists: true };
      } catch {
        return { amount: 0n, exists: false };
      }
    },
  });

/* Rent for a new meme token account (the first buy creates it). */
export const useTokenAccountRent = () =>
  useQuery({
    queryKey: ["rent", MEME_TOKEN_ACCOUNT_SIZE],
    staleTime: Infinity,
    queryFn: () => connection.getMinimumBalanceForRentExemption(MEME_TOKEN_ACCOUNT_SIZE),
  });

export const networkFeeSol = (newAccountRent: number) =>
  (BASE_FEE_LAMPORTS + newAccountRent) / LAMPORTS_PER_SOL;

export interface TradeQuote {
  /** meme tokens, base units */
  tokens: bigint;
  /** buy: SKR paid; sell: SKR received (after fees). Base units. */
  skr: bigint;
}

/* What `quantity` whole tokens cost (buy) or return (sell) right now; null if it can't trade. */
export const quoteTrade = (
  state: MemeAccountDecoded,
  fees: FeeConfig,
  side: TradeSide,
  quantity: number,
): TradeQuote | null => {
  const tokens = BigInt(Math.max(0, Math.floor(quantity))) * TOKEN_UNIT;
  if (tokens === 0n) return null;
  try {
    if (side === "buy") {
      const skr = skrInForTokens(state, fees, tokens);
      if (skr === null) return null;
      return { tokens: quoteBuy(state, fees, skr).tokensOut, skr };
    }
    return { tokens, skr: quoteSell(state, fees, tokens).fees.net };
  } catch {
    return null;
  }
};

/* Whole tokens left in the launch sale, or what `skrUnits` buys from the pool. */
export const buyLimit = (state: MemeAccountDecoded, fees: FeeConfig, skrUnits: bigint) => {
  if (state.phase === "launch") return Number((state.saleSupply - state.tokensSold) / TOKEN_UNIT);
  try {
    return Number(quoteBuy(state, fees, skrUnits).tokensOut / TOKEN_UNIT);
  } catch {
    return 0;
  }
};

/** SKR per whole token, as a number */
export const spotPriceSkr = (state: MemeAccountDecoded) => skrNumber(memePrice(state));

export type TradeStep = "idle" | "wallet" | "confirming";

export class TradeProblem extends Error {}

const confirm = async (signature: string, latest: BlockhashWithExpiryBlockHeight) => {
  const { value } = await connection.confirmTransaction({ signature, ...latest }, "confirmed");
  return !value.err;
};

/*
 * Runs one trade: re-reads the Meme account, re-quotes with 1% slippage, signs through
 * the wallet, waits for `confirmed`, then refreshes balances and the feed card.
 * Resolves with a message for the toast; throws TradeProblem with one for the sheet.
 * A cancelled wallet resolves null.
 */
export const useTrade = (fees: FeeConfig | undefined) => {
  const client = useQueryClient();
  const [step, setStep] = useState<TradeStep>("idle");

  const run = useCallback(
    async (mint: string, ticker: string, side: TradeSide, quantity: number) => {
      const { session, setMwaAuthToken } = useSession.getState();
      if (!session || !fees || step !== "idle") return null;
      const owner = new PublicKey(session.wallet);
      const mintKey = new PublicKey(mint);
      setStep("wallet");
      try {
        const state = await fetchMemeState(mint);
        const quote = quoteTrade(state, fees, side, quantity);
        if (!quote) throw new TradeProblem("This amount can't be traded right now.");

        const instructions =
          side === "buy"
            ? [
                buyInstructionRaw(
                  {
                    trader: owner,
                    mint: mintKey,
                    skrMint,
                    skrIn: quote.skr,
                    minTokensOut: withSlippage(quote.tokens, SLIPPAGE_BPS),
                  },
                  programId,
                ),
              ]
            : [
                createAssociatedTokenAccountIdempotentInstruction(
                  owner,
                  getAssociatedTokenAddressSync(skrMint, owner),
                  owner,
                  skrMint,
                ),
                sellInstructionRaw(
                  {
                    trader: owner,
                    mint: mintKey,
                    skrMint,
                    tokensIn: quote.tokens,
                    minSkrOut: withSlippage(quote.skr, SLIPPAGE_BPS),
                  },
                  programId,
                ),
              ];

        let latest: BlockhashWithExpiryBlockHeight | null = null;
        const sent = await signAndSend(session.mwaAuthToken, async () => {
          latest = await connection.getLatestBlockhash("confirmed");
          return new VersionedTransaction(
            new TransactionMessage({
              payerKey: owner,
              recentBlockhash: latest.blockhash,
              instructions,
            }).compileToV0Message(),
          );
        });
        setMwaAuthToken(sent.authToken);
        setStep("confirming");
        if (!(await confirm(sent.signature, latest!))) {
          throw new TradeProblem("The trade didn't go through. The price may have moved; try again.");
        }

        // Show the new numbers right away; the indexer catches the server up.
        const after = await fetchMemeState(mint).catch(() => null);
        if (after) useFeedStore.getState().patchFromChain(mint, after);
        client.invalidateQueries({ queryKey: ["meme-state", mint] });
        client.invalidateQueries({ queryKey: ["token-holding", session.wallet, mint] });
        client.invalidateQueries({ queryKey: skrBalanceKey(session.wallet) });
        client.invalidateQueries({ queryKey: ["price-history", mint] });

        const count = (quote.tokens / TOKEN_UNIT).toLocaleString("en-US");
        return side === "buy" ? `Bought ${count} $${ticker}` : `Sold ${count} $${ticker}`;
      } catch (err) {
        if (err instanceof TradeProblem) throw err;
        if (err instanceof ConnectError) return null;
        if (err instanceof NotSubmittedError) {
          throw new TradeProblem("Your wallet didn't send it. Check your SOL and SKR and try again.");
        }
        console.warn("[trade] failed", err, (err as Error)?.stack);
        throw new TradeProblem("Something went wrong. Try again.");
      } finally {
        setStep("idle");
      }
    },
    [client, fees, step],
  );

  return { step, run };
};
