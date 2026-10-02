import { ed25519 } from "@noble/curves/ed25519.js";
import { PublicKey } from "@solana/web3.js";

export interface SignInInput {
  domain: string;
  address: string;
  statement: string;
  uri: string;
  version: string;
  chainId: string;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
}

export interface SiwsPolicy {
  domain: string;
  uri: string;
  chainId: string;
  statement: string;
  ttlSeconds: number;
}

export class SiwsError extends Error {}

const randomNonce = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

export const createSignInInput = (
  policy: SiwsPolicy,
  address: string,
  now = new Date(),
): SignInInput => ({
  domain: policy.domain,
  address,
  statement: policy.statement,
  uri: policy.uri,
  version: "1",
  chainId: policy.chainId,
  nonce: randomNonce(),
  issuedAt: now.toISOString(),
  expirationTime: new Date(
    now.getTime() + policy.ttlSeconds * 1000,
  ).toISOString(),
});

export const formatMessage = (input: SignInInput) =>
  [
    `${input.domain} wants you to sign in with your Solana account:`,
    input.address,
    "",
    input.statement,
    "",
    `URI: ${input.uri}`,
    `Version: ${input.version}`,
    `Chain ID: ${input.chainId}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt}`,
    `Expiration Time: ${input.expirationTime}`,
  ].join("\n");

const HEADER = / wants you to sign in with your Solana account:$/;

const FIELDS: Record<string, keyof SignInInput> = {
  URI: "uri",
  Version: "version",
  "Chain ID": "chainId",
  Nonce: "nonce",
  "Issued At": "issuedAt",
  "Expiration Time": "expirationTime",
};

export const parseMessage = (message: string): Partial<SignInInput> => {
  const lines = message.split("\n");
  const header = lines[0] ?? "";
  if (!HEADER.test(header)) throw new SiwsError("not a sign in message");

  const parsed: Partial<SignInInput> = {
    domain: header.replace(HEADER, ""),
    address: lines[1] ?? "",
  };

  const statement: string[] = [];
  for (const line of lines.slice(2)) {
    const match = /^([A-Za-z ]+): (.*)$/.exec(line);
    const field = match && FIELDS[match[1]!];
    if (field) parsed[field] = match[2]!;
    else if (line !== "" && !parsed.uri) statement.push(line);
  }
  if (statement.length) parsed.statement = statement.join("\n");
  return parsed;
};

export const verifySignature = (
  message: Uint8Array,
  signature: Uint8Array,
  address: string,
) => {
  try {
    return ed25519.verify(signature, message, new PublicKey(address).toBytes());
  } catch {
    return false;
  }
};

export interface VerifyParams {
  message: Uint8Array;
  signature: Uint8Array;
  address: string;
  policy: SiwsPolicy;
  takeNonce: (nonce: string) => Promise<string | null>;
  now?: Date;
}

export const verifySignIn = async ({
  message,
  signature,
  address,
  policy,
  takeNonce,
  now = new Date(),
}: VerifyParams) => {
  const fields = parseMessage(new TextDecoder().decode(message));

  if (fields.address !== address) throw new SiwsError("address mismatch");
  if (!verifySignature(message, signature, address)) {
    throw new SiwsError("invalid signature");
  }
  if (fields.domain !== policy.domain) throw new SiwsError("wrong domain");
  if (fields.uri !== policy.uri) throw new SiwsError("wrong uri");
  if (fields.chainId !== policy.chainId) throw new SiwsError("wrong chain");
  if (!fields.nonce) throw new SiwsError("missing nonce");

  const expires = Date.parse(fields.expirationTime ?? "");
  const issued = Date.parse(fields.issuedAt ?? "");
  if (Number.isNaN(expires) || expires <= now.getTime()) {
    throw new SiwsError("message expired");
  }
  if (Number.isNaN(issued) || issued > now.getTime() + 60_000) {
    throw new SiwsError("issued in the future");
  }

  if ((await takeNonce(fields.nonce)) !== address) {
    throw new SiwsError("unknown or used nonce");
  }
  return address;
};
