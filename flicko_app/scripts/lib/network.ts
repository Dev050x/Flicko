import { getReadonlyProgram, PROGRAM_ID } from "@flicko/sdk";
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
  type Signer,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export interface NetworkConfig {
  cluster: string;
  programId: string;
  skrMint?: string;
  skrDecimals?: number;
  attestor?: string;
  /** devnet wallet the server sends welcome SKR from */
  faucet?: string;
  lookupTable?: string;
}

export const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
export const CLUSTER = process.env.CLUSTER ?? "devnet";

const keypairPath =
  process.env.KEYPAIR ?? join(homedir(), ".config/solana/id.json");
const configPath = resolve(
  process.env.NETWORK_CONFIG ??
    join(import.meta.dir, `../../config/${CLUSTER}.json`),
);

export const attestorKeypairPath =
  process.env.ATTESTOR_KEYPAIR ??
  join(homedir(), ".config/solana/flicko-attestor.json");

export const connection = new Connection(RPC_URL, "confirmed");

const loadKeypair = (
  path: string,
  name: string,
  setup: string,
  { create = false } = {},
) => {
  if (!existsSync(path)) {
    if (!create) {
      console.error(`no ${name} keypair at ${path}, run ${setup} first`);
      process.exit(1);
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify([...Keypair.generate().secretKey]), {
      mode: 0o600,
    });
    chmodSync(path, 0o600);
    console.log(`created ${name} keypair at ${path}`);
  }
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]),
  );
};

export const loadAttestor = (opts: { create?: boolean } = {}) =>
  loadKeypair(attestorKeypairPath, "attestor", "devnet:attestor", opts);

/* The wallet the server sends new users' welcome SKR from. */
export const faucetKeypairPath =
  process.env.FAUCET_KEYPAIR ??
  join(homedir(), ".config/solana/flicko-faucet.json");

export const loadFaucet = (opts: { create?: boolean } = {}) =>
  loadKeypair(faucetKeypairPath, "faucet", "devnet:faucet-wallet", opts);

export const payer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(keypairPath, "utf8")) as number[]),
);

export const programId = process.env.PROGRAM_ID
  ? new PublicKey(process.env.PROGRAM_ID)
  : PROGRAM_ID;

export const program = getReadonlyProgram(connection, programId);

export const readNetworkConfig = (): NetworkConfig =>
  existsSync(configPath)
    ? (JSON.parse(readFileSync(configPath, "utf8")) as NetworkConfig)
    : { cluster: CLUSTER, programId: programId.toBase58() };

export const writeNetworkConfig = (config: NetworkConfig) => {
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`saved ${configPath}`);
};

export const requireSkrMint = (config: NetworkConfig) => {
  if (!config.skrMint) {
    console.error("no SKR mint in network config, run devnet:skr first");
    process.exit(1);
  }
  return new PublicKey(config.skrMint);
};

export const send = (
  instructions: TransactionInstruction[],
  signers: Signer[] = [],
) =>
  sendAndConfirmTransaction(
    connection,
    new Transaction().add(...instructions),
    [payer, ...signers],
    { commitment: "confirmed" },
  );

export const txUrl = (signature: string) =>
  CLUSTER === "localnet"
    ? signature
    : `https://explorer.solana.com/tx/${signature}?cluster=${CLUSTER}`;
