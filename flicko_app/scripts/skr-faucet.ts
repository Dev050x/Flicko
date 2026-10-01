import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  connection,
  payer,
  readNetworkConfig,
  requireSkrMint,
  send,
  txUrl,
} from "./lib/network";

const MIN_SOL = 0.02 * LAMPORTS_PER_SOL;
const SOL_TOP_UP = 0.05 * LAMPORTS_PER_SOL;

const [walletArg, amountArg = "1000"] = process.argv.slice(2);
if (!walletArg) {
  console.error("usage: bun run devnet:faucet <wallet> [skr-amount]");
  process.exit(1);
}

const wallet = new PublicKey(walletArg);
const config = readNetworkConfig();
const skrMint = requireSkrMint(config);
const decimals = BigInt(config.skrDecimals ?? 6);
const amount = BigInt(amountArg) * 10n ** decimals;

const account = await getOrCreateAssociatedTokenAccount(
  connection,
  payer,
  skrMint,
  wallet,
);
const signature = await mintTo(
  connection,
  payer,
  skrMint,
  account.address,
  payer,
  amount,
);
console.log(`sent ${amountArg} test SKR to ${wallet.toBase58()}`);
console.log(txUrl(signature));

if ((await connection.getBalance(wallet)) < MIN_SOL) {
  const topUp = await send([
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: wallet,
      lamports: SOL_TOP_UP,
    }),
  ]);
  console.log(`topped up ${SOL_TOP_UP / LAMPORTS_PER_SOL} SOL for fees`);
  console.log(txUrl(topUp));
}
