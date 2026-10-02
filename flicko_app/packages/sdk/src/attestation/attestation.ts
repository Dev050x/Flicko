import { Ed25519Program, PublicKey } from "@solana/web3.js";
import { ATTESTATION_PREFIX } from "../core/constants";

export interface AttestationFields {
  creator: PublicKey;
  imageHash: Uint8Array | number[];
  expiresAt: bigint | number;
  name: string;
  symbol: string;
  uri: string;
}

export interface Attestation {
  authority: string;
  signature: string;
  expiresAt: number;
}

const encoder = new TextEncoder();

const lengthPrefixed = (field: string) => {
  const bytes = encoder.encode(field);
  if (bytes.length > 255) throw new Error("attestation field is too long");
  return [bytes.length, ...bytes];
};

export const attestationMessage = (fields: AttestationFields) => {
  const imageHash = Uint8Array.from(fields.imageHash);
  if (imageHash.length !== 32) throw new Error("image hash must be 32 bytes");
  const expiresAt = new Uint8Array(8);
  new DataView(expiresAt.buffer).setBigInt64(0, BigInt(fields.expiresAt), true);
  return Uint8Array.from([
    ...encoder.encode(ATTESTATION_PREFIX),
    ...fields.creator.toBytes(),
    ...imageHash,
    ...expiresAt,
    ...lengthPrefixed(fields.name),
    ...lengthPrefixed(fields.symbol),
    ...lengthPrefixed(fields.uri),
  ]);
};

export const attestationInstruction = (
  fields: AttestationFields,
  attestation: Pick<Attestation, "authority" | "signature">,
) =>
  Ed25519Program.createInstructionWithPublicKey({
    publicKey: new PublicKey(attestation.authority).toBytes(),
    message: attestationMessage(fields),
    signature: Uint8Array.from(Buffer.from(attestation.signature, "base64")),
  });
