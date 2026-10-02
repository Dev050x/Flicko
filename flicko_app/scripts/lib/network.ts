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

export const loadAttestor = ({ create = false } = {}) => {
  if (!existsSync(attestorKeypairPath)) {
    if (!create) {
      console.error(
        `no attestor keypair at ${attestorKeypairPath}, run devnet:attestor first`,
      );
      process.exit(1);
    }
    mkdirSync(dirname(attestorKeypairPath), { recursive: true });
    writeFileSync(
      attestorKeypairPath,
      JSON.stringify([...Keypair.generate().secretKey]),
      { mode: 0o600 },
    );
    chmodSync(attestorKeypairPath, 0o600);
    console.log(`created attestor keypair at ${attestorKeypairPath}`);
  }
  return Keypair.fromSecretKey(
    Uint8Array.from(
      JSON.parse(readFileSync(attestorKeypairPath, "utf8")) as number[],
    ),
  );
};

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
