import { createMemeInstructions, memePda } from "@flicko/sdk";
import { hexToBytes } from "@noble/hashes/utils.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createBurnCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  type BlockhashWithExpiryBlockHeight,
} from "@solana/web3.js";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useCallback, useState } from "react";

import { config } from "@/config";
import type { Filter } from "@/features/filters/catalog";
import { skrBalanceKey } from "@/features/wallet/skr-balance";
import { api, ApiError, apiForm } from "@/lib/api";
import { ConnectError, NotSubmittedError, signAndSend } from "@/lib/mwa";
import { connection } from "@/lib/solana";
import { useSession } from "@/store/session";

import { program, programId } from "./chain";
import { formatUnits } from "./format";
import { flatten, LAUNCH_EDGE } from "./render";
import { captionOf, type LaunchAttempt, type Prepared, useCreateStore } from "./store";

/*
 * The launch: pre-checks → flatten the meme → POST /memes/prepare (image stored, hash
 * checked, attestation signed) → [SKR account if missing, premium-filter burns,
 * ed25519 attestation, create_meme] in one v0 transaction through MWA → wait for
 * `confirmed` → POST /memes/confirm → Live.
 *
 * Never launches twice: the prepared upload and the mint keypair are kept between
 * attempts, and before retrying we check whether the last signature or the mint already
 * landed (a second create for the same mint would fail on-chain anyway).
 */
export type LaunchStep = "idle" | "preparing" | "wallet" | "launching";

export type LaunchProblem =
  | { kind: "skr"; need: string }
  | { kind: "sol"; need: string }
  | { kind: "failed" }
  | { kind: "unsafe" }
  | { kind: "text"; text: string };

export interface LaunchInput {
  name: string;
  symbol: string;
  /** base units (whole tokens x 10^6) */
  supply: bigint;
  /** SKR base units per whole token */
  startPrice: bigint;
  /** SKR base units burned by create_meme */
  creationFee: bigint;
  /** estimated SOL for rent and signatures */
  networkFee: number;
  /** locked premium filters in the meme, burned in the same transaction */
  premium: Filter[];
}

const CONFIRM_RETRIES = 6;
const CONFIRM_DELAY_MS = 1500;
const ATTESTATION_MARGIN_S = 90;
const SKR_ACCOUNT_SIZE = 165;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const skrUnits = (whole: number) => BigInt(whole) * 10n ** BigInt(config.skrDecimals);

class LaunchFailed extends Error {}

interface PrepareResponse {
  uploadId: string;
  metadataUri: string;
  imageUrl: string;
  imageHash: string;
  name: string;
  symbol: string;
  attestation: Prepared["attestation"];
}

/* Did the last attempt land? Its signature confirmed, or its mint has a Meme account. */
const landed = async (attempt: LaunchAttempt) => {
  if (!attempt.mintSecret) return null;
  const mint = Keypair.fromSecretKey(Uint8Array.from(attempt.mintSecret)).publicKey;
  if (attempt.signature) {
    const { value } = await connection.getSignatureStatus(attempt.signature, {
      searchTransactionHistory: true,
    });
    if (value && !value.err && value.confirmationStatus !== "processed") {
      return { signature: attempt.signature, mint: mint.toBase58() };
    }
  }
  const meme = await connection.getAccountInfo(memePda(mint, programId));
  return meme ? { signature: attempt.signature, mint: mint.toBase58() } : null;
};

/* true = confirmed, false = failed on-chain; throws if we can't tell (timeout). */
const confirm = async (signature: string, latest: BlockhashWithExpiryBlockHeight) => {
  try {
    const { value } = await connection.confirmTransaction(
      { signature, ...latest },
      "confirmed",
    );
    return !value.err;
  } catch (err) {
    const { value } = await connection.getSignatureStatus(signature, {
      searchTransactionHistory: true,
    });
    if (value?.err) return false;
    if (value && value.confirmationStatus !== "processed") return true;
    if (!value) return false;
    throw err;
  }
};

export const useLaunch = (onCancelled: () => void) => {
  const client = useQueryClient();
  const [step, setStep] = useState<LaunchStep>("idle");
  const [problem, setProblem] = useState<LaunchProblem | null>(null);

  const finish = useCallback(
    async (result: { signature: string | null; mint: string }, premium: Filter[]) => {
      const { session } = useSession.getState();
      if (session && result.signature) {
        for (let i = 0; i < CONFIRM_RETRIES; i++) {
          try {
            await api("/memes/confirm", {
              method: "POST",
              token: session.token,
              body: { signature: result.signature, mint: result.mint },
            });
            break;
          } catch (err) {
            // 404 until the server's RPC sees the transaction; the indexer catches up anyway.
            if (!(err instanceof ApiError && err.status === 404)) {
              console.warn("[launch] confirm failed", err);
              break;
            }
            await wait(CONFIRM_DELAY_MS);
          }
        }
        for (const filter of premium) {
          await api("/filters/unlock", {
            method: "POST",
            token: session.token,
            body: { filterId: filter.id, signature: result.signature },
          }).catch((err) => console.warn("[launch] unlock not recorded", err));
        }
        client.invalidateQueries({ queryKey: ["filter-unlocks", session.wallet] });
        client.invalidateQueries({ queryKey: skrBalanceKey(session.wallet) });
        client.invalidateQueries({ queryKey: ["sol-balance", session.wallet] });
      }
      router.replace({ pathname: "/create/live", params: { mint: result.mint } });
    },
    [client],
  );

  const launch = useCallback(
    async (input: LaunchInput) => {
      const { session, setMwaAuthToken } = useSession.getState();
      if (!session || step !== "idle") return;
      const store = useCreateStore.getState;
      const owner = new PublicKey(session.wallet);
      const skrMint = new PublicKey(config.skrMint);
      setProblem(null);
      setStep("preparing");
      try {
        const already = await landed(store().launch);
        if (already) return await finish(already, input.premium);

        // Pre-checks.
        const ata = getAssociatedTokenAddressSync(skrMint, owner);
        const [skrAccount, lamports] = await Promise.all([
          connection.getTokenAccountBalance(ata).catch(() => null),
          connection.getBalance(owner),
        ]);
        const burns = input.premium.reduce((sum, f) => sum + skrUnits(f.priceSkr ?? 0), 0n);
        const skrNeeded = input.creationFee + burns;
        const skrHave = skrAccount ? BigInt(skrAccount.value.amount) : 0n;
        if (skrHave < skrNeeded) {
          setProblem({ kind: "skr", need: formatUnits(skrNeeded, config.skrDecimals) });
          return;
        }
        const accountRent = skrAccount
          ? 0
          : await connection.getMinimumBalanceForRentExemption(SKR_ACCOUNT_SIZE);
        const solNeeded = input.networkFee + accountRent / LAMPORTS_PER_SOL;
        if (lamports / LAMPORTS_PER_SOL < solNeeded) {
          setProblem({ kind: "sol", need: solNeeded.toFixed(3) });
          return;
        }

        // The meme exactly as shown, uploaded once.
        const s = store();
        const caption = captionOf(s);
        const image = await flatten(
          { photo: s.photo!, edits: s.edits, faces: s.faces ?? [], caption },
          LAUNCH_EDGE,
        );
        let prepared = s.launch.prepared;
        if (
          !prepared ||
          prepared.imageHash !== image.hash ||
          prepared.name !== input.name ||
          prepared.symbol !== input.symbol
        ) {
          const res = await apiForm<PrepareResponse>("/memes/prepare", {
            file: { uri: image.uri, name: "meme.jpg", type: "image/jpeg" },
            fields: {
              name: input.name,
              symbol: input.symbol,
              caption: JSON.stringify(caption),
            },
            token: session.token,
            timeoutMs: 60_000,
          });
          if (res.imageHash !== image.hash) {
            throw new Error("uploaded image hash does not match");
          }
          prepared = { ...res, fileUri: image.uri };
          // A new image is a new meme: start with a fresh mint.
          s.setLaunch({ prepared, mintSecret: null, signature: null });
        } else if (prepared.attestation.expiresAt - Date.now() / 1000 < ATTESTATION_MARGIN_S) {
          const { attestation } = await api<{ attestation: Prepared["attestation"] }>(
            `/uploads/${prepared.uploadId}/attest`,
            { method: "POST", token: session.token },
          );
          prepared = { ...prepared, attestation };
          s.setLaunch({ prepared });
        }

        let mintSecret = store().launch.mintSecret;
        if (!mintSecret) {
          mintSecret = Array.from(Keypair.generate().secretKey);
          store().setLaunch({ mintSecret });
        }
        const mint = Keypair.fromSecretKey(Uint8Array.from(mintSecret));

        const instructions = [
          ...(skrAccount
            ? []
            : [createAssociatedTokenAccountIdempotentInstruction(owner, ata, owner, skrMint)]),
          ...input.premium.map((f) =>
            createBurnCheckedInstruction(
              ata,
              skrMint,
              owner,
              skrUnits(f.priceSkr ?? 0),
              config.skrDecimals,
            ),
          ),
          ...(await createMemeInstructions(program, {
            creator: owner,
            mint: mint.publicKey,
            skrMint,
            name: input.name,
            symbol: input.symbol,
            uri: prepared.metadataUri,
            imageHash: hexToBytes(prepared.imageHash),
            supply: input.supply,
            startPrice: input.startPrice,
            attestation: prepared.attestation,
          })),
        ];
        const table = config.lookupTable
          ? (await connection.getAddressLookupTable(new PublicKey(config.lookupTable))).value
          : null;

        setStep("wallet");
        let latest: BlockhashWithExpiryBlockHeight | null = null;
        const sent = await signAndSend(session.mwaAuthToken, async () => {
          latest = await connection.getLatestBlockhash("confirmed");
          const tx = new VersionedTransaction(
            new TransactionMessage({
              payerKey: owner,
              recentBlockhash: latest.blockhash,
              instructions,
            }).compileToV0Message(table ? [table] : []),
          );
          tx.sign([mint]);
          return tx;
        });
        setMwaAuthToken(sent.authToken);
        store().setLaunch({ signature: sent.signature });

        setStep("launching");
        if (!(await confirm(sent.signature, latest!))) throw new LaunchFailed();
        await finish({ signature: sent.signature, mint: mint.publicKey.toBase58() }, input.premium);
      } catch (err) {
        if (err instanceof ConnectError) {
          onCancelled();
        } else if (err instanceof ApiError && err.status === 422) {
          setProblem(
            err.message === "caption rejected"
              ? { kind: "text", text: "That caption or name can't be posted. Try another." }
              : { kind: "unsafe" },
          );
        } else if (err instanceof ApiError && err.status === 429) {
          setProblem({ kind: "text", text: "That's a lot of launches. Try again in a bit." });
        } else if (err instanceof ApiError && err.status === 401) {
          setProblem({ kind: "text", text: "Your session expired. Sign in again to launch." });
        } else {
          if (!(err instanceof LaunchFailed || err instanceof NotSubmittedError)) {
            console.warn("[launch] failed", err);
          }
          setProblem({ kind: "failed" });
        }
      } finally {
        setStep("idle");
      }
    },
    [finish, onCancelled, step],
  );

  return { step, problem, launch, clearProblem: () => setProblem(null) };
};
