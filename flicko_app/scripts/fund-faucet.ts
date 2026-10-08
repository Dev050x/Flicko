import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import {
  connection,
  faucetKeypairPath,
  loadFaucet,
  payer,
  readNetworkConfig,
  requireSkrMint,
  send,
  txUrl,
  writeNetworkConfig,
} from "./lib/network";

/*
 * Creates (once) and funds the faucet wallet the server sends new users' welcome SKR
 * from: mints test SKR to it and keeps enough SOL for fees and new users' SKR account
 * rent (about 0.002 SOL each). Idempotent; run it again to top up.
 *   bun run devnet:faucet-wallet [skr-amount]
 */
const MIN_SOL = 0.5 * LAMPORTS_PER_SOL;
const SOL_TARGET = 1 * LAMPORTS_PER_SOL;

const [amountArg = "10000000"] = process.argv.slice(2);
const faucet = loadFaucet({ create: true });
const config = readNetworkConfig();
const skrMint = requireSkrMint(config);
const decimals = BigInt(config.skrDecimals ?? 6);

const account = await getOrCreateAssociatedTokenAccount(
  connection,
  payer,
  skrMint,
  faucet.publicKey,
);
const minted = await mintTo(
  connection,
  payer,
  skrMint,
  account.address,
  payer,
  BigInt(amountArg) * 10n ** decimals,
);
console.log(`minted ${amountArg} test SKR to the faucet ${faucet.publicKey.toBase58()}`);
console.log(txUrl(minted));

const balance = await connection.getBalance(faucet.publicKey);
if (balance < MIN_SOL) {
  const topUp = await send([
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: faucet.publicKey,
      lamports: SOL_TARGET - balance,
    }),
  ]);
  console.log(`topped the faucet up to ${SOL_TARGET / LAMPORTS_PER_SOL} SOL`);
  console.log(txUrl(topUp));
}

writeNetworkConfig({ ...readNetworkConfig(), faucet: faucet.publicKey.toBase58() });
console.log(`server: put the keypair at ${faucetKeypairPath} into FAUCET_SECRET_KEY`);
