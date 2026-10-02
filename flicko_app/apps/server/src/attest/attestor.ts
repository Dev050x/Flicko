import { ed25519 } from "@noble/curves/ed25519.js";
import { attestationMessage, type Attestation } from "@flicko/sdk";
import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

export const ATTESTATION_TTL_SECONDS = 600;

export interface AttestFields {
  creator: string;
  imageHash: string;
  name: string;
  symbol: string;
  uri: string;
}

export interface Attestor {
  publicKey: string;
  attest(fields: AttestFields): Attestation;
}

export const parseSecretKey = (value: string) => {
  const trimmed = value.trim();
  const bytes = trimmed.startsWith("[")
    ? Uint8Array.from(JSON.parse(trimmed) as number[])
    : bs58.decode(trimmed);
  if (bytes.length !== 64)
    throw new Error("attestor secret key must be 64 bytes");
  return bytes;
};

export const createAttestor = (
  secretKey: Uint8Array,
  now: () => number = Date.now,
): Attestor => {
  const keypair = Keypair.fromSecretKey(secretKey);
  const seed = secretKey.slice(0, 32);
  const publicKey = keypair.publicKey.toBase58();
  return {
    publicKey,
    attest: (fields) => {
      const expiresAt = Math.floor(now() / 1000) + ATTESTATION_TTL_SECONDS;
      const message = attestationMessage({
        creator: new PublicKey(fields.creator),
        imageHash: Buffer.from(fields.imageHash, "hex"),
        expiresAt,
        name: fields.name,
        symbol: fields.symbol,
        uri: fields.uri,
      });
      return {
        authority: publicKey,
        signature: Buffer.from(ed25519.sign(message, seed)).toString("base64"),
        expiresAt,
      };
    },
  };
};
