import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import {
  connection,
  payer,
  readNetworkConfig,
  writeNetworkConfig,
} from "./lib/network";

const DECIMALS = 6;
const INITIAL_SUPPLY = 1_000_000n;

const config = readNetworkConfig();

if (
  config.skrMint &&
  (await connection.getAccountInfo(new PublicKey(config.skrMint)))
) {
  console.log(`test SKR mint already exists: ${config.skrMint}`);
  process.exit(0);
}

const mint = await createMint(
  connection,
  payer,
  payer.publicKey,
  null,
  DECIMALS,
);
const account = await getOrCreateAssociatedTokenAccount(
  connection,
  payer,
  mint,
  payer.publicKey,
);
await mintTo(
  connection,
  payer,
  mint,
  account.address,
  payer,
  INITIAL_SUPPLY * 10n ** BigInt(DECIMALS),
);

console.log(`created test SKR mint ${mint.toBase58()}`);
console.log(`minted ${INITIAL_SUPPLY} SKR to ${payer.publicKey.toBase58()}`);
writeNetworkConfig({
  ...config,
  skrMint: mint.toBase58(),
  skrDecimals: DECIMALS,
});
