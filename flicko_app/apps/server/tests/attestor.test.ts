import { describe, expect, test } from "bun:test";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { parseSecretKey } from "../src/attest/attestor";

describe("parseSecretKey", () => {
  test("reads base58 and solana-keygen json arrays", () => {
    const keypair = Keypair.generate();
    expect(parseSecretKey(bs58.encode(keypair.secretKey))).toEqual(
      keypair.secretKey,
    );
    expect(parseSecretKey(JSON.stringify([...keypair.secretKey]))).toEqual(
      keypair.secretKey,
    );
  });

  test("rejects keys that are not 64 bytes", () => {
    expect(() => parseSecretKey(bs58.encode(new Uint8Array(32)))).toThrow(
      "attestor secret key must be 64 bytes",
    );
  });
});
