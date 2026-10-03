import type { Web3MobileWallet } from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import type { Transaction, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { Buffer } from "buffer";
import { TurboModuleRegistry } from "react-native";

import { chain, config } from "@/config";
import type { SignInInput } from "./auth";

/*
 * Mobile Wallet Adapter helpers. All signing happens in the wallet; we only keep the
 * wallet's auth_token so later sessions can reauthorize without a new approval.
 */
export type ConnectFailure = "noWallet" | "declined" | "timeout";

export class ConnectError extends Error {
  constructor(
    readonly reason: ConnectFailure,
    cause?: unknown,
  ) {
    super(reason);
    this.cause = cause;
  }
}

export interface Connected {
  address: string;
  authToken: string;
  walletLabel?: string;
  signedMessage: string;
  signature: string;
}

const identity = config.identity;
const CONNECT_TIMEOUT_MS = 60_000;

/*
 * The adapter's native module throws on import where it is not linked (Expo Go, or a
 * build made before it was added), so it is loaded only when the user connects, and only
 * after checking the native module is there.
 */
const loadTransact = () => {
  if (!TurboModuleRegistry.get("SolanaMobileWalletAdapter")) {
    console.warn(
      "[mwa] wallet adapter is not in this build; make a new development build",
    );
    throw new ConnectError("declined");
  }
  try {
    return (
      require("@solana-mobile/mobile-wallet-adapter-protocol-web3js") as typeof import("@solana-mobile/mobile-wallet-adapter-protocol-web3js")
    ).transact;
  } catch (err) {
    console.warn(
      "[mwa] wallet adapter is not in this build; make a new development build",
      err,
    );
    throw new ConnectError("declined", err);
  }
};

const toBase58 = (base64: string) => bs58.encode(Buffer.from(base64, "base64"));

const errorCode = (err: unknown) =>
  (err as { code?: string | number } | null)?.code;

/*
 * Connect and Sign In With Solana in one approval: authorize carries the server's SIWS
 * payload, and the wallet returns the signed message with the account.
 */
export const connectAndSignIn = async (
  input: SignInInput,
): Promise<Connected> => {
  const transact = loadTransact();
  const session = transact(async (wallet: Web3MobileWallet) => {
    const result = await wallet.authorize({
      chain,
      identity,
      sign_in_payload: input,
    });
    const signIn = result.sign_in_result;
    const account = result.accounts[0];
    if (!signIn || !account) throw new ConnectError("declined");
    return {
      address: toBase58(signIn.address),
      authToken: result.auth_token,
      walletLabel: account.label,
      signedMessage: signIn.signed_message,
      signature: signIn.signature,
    };
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new ConnectError("timeout")),
      CONNECT_TIMEOUT_MS,
    );
  });

  try {
    return await Promise.race([session, timeout]);
  } catch (err) {
    if (err instanceof ConnectError) throw err;
    if (errorCode(err) === "ERROR_WALLET_NOT_FOUND") {
      throw new ConnectError("noWallet", err);
    }
    throw new ConnectError("declined", err);
  } finally {
    clearTimeout(timer);
  }
};

/*
 * Reuses a stored auth_token inside a wallet session (for signing later). Returns the
 * refreshed token, or null if the wallet no longer accepts it.
 */
export const reauthorize = async (
  wallet: Web3MobileWallet,
  authToken: string,
) => {
  try {
    const result = await wallet.authorize({
      chain,
      identity,
      auth_token: authToken,
    });
    return result.auth_token;
  } catch {
    return null;
  }
};

/*
 * The wallet signed but its RPC refused the transaction (e.g. simulation failed), so
 * nothing landed. Different from the user declining.
 */
export class NotSubmittedError extends Error {
  constructor(cause?: unknown) {
    super("transaction not submitted");
    this.cause = cause;
  }
}

const NOT_SUBMITTED = [-4, "ERROR_NOT_SUBMITTED"];

/*
 * Signs and sends one transaction through the wallet, reusing the stored auth_token.
 * Returns the base58 signature and the (possibly refreshed) auth_token to store.
 */
export const signAndSend = async (
  authToken: string,
  build: () => Promise<Transaction | VersionedTransaction>,
): Promise<{ signature: string; authToken: string }> => {
  const transact = loadTransact();
  try {
    return await transact(async (wallet: Web3MobileWallet) => {
      const refreshed = await reauthorize(wallet, authToken);
      if (!refreshed) throw new ConnectError("declined");
      const [signature] = await wallet.signAndSendTransactions({
        transactions: [await build()],
      });
      if (!signature) throw new ConnectError("declined");
      return { signature, authToken: refreshed };
    });
  } catch (err) {
    if (err instanceof ConnectError) throw err;
    if (errorCode(err) === "ERROR_WALLET_NOT_FOUND") {
      throw new ConnectError("noWallet", err);
    }
    if (NOT_SUBMITTED.includes(errorCode(err) as never)) {
      throw new NotSubmittedError(err);
    }
    throw new ConnectError("declined", err);
  }
};
