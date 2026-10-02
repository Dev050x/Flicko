import { describe, expect, test } from "bun:test";
import { PublicKey } from "@solana/web3.js";
import { attestationMessage } from "../src/attestation/attestation";

/*
 * Same layout the program's attestation.rs unit test checks:
 * prefix | creator | image hash | expires_at (i64 LE) | len-prefixed name, symbol, uri.
 */
const fields = {
  creator: new PublicKey(new Uint8Array(32).fill(2)),
  imageHash: new Uint8Array(32).fill(3),
  expiresAt: 1_800_000_000,
  name: "Gm Ser",
  symbol: "GMS",
  uri: "https://x/m.json",
};

describe("attestationMessage", () => {
  test("matches the program's byte layout", () => {
    const message = attestationMessage(fields);
    expect(new TextDecoder().decode(message.subarray(0, 16))).toBe(
      "flicko:create:v1",
    );
    expect([...message.subarray(16, 48)]).toEqual(Array(32).fill(2));
    expect([...message.subarray(48, 80)]).toEqual(Array(32).fill(3));
    expect(new DataView(message.buffer, 80, 8).getBigInt64(0, true)).toBe(
      1_800_000_000n,
    );
    expect(message[88]).toBe(6);
    expect(new TextDecoder().decode(message.subarray(89, 95))).toBe("Gm Ser");
    expect(message[95]).toBe(3);
    expect(message.length).toBe(88 + 1 + 6 + 1 + 3 + 1 + 16);
  });

  test("counts utf-8 bytes, not characters", () => {
    const message = attestationMessage({ ...fields, name: "gm 😀" });
    expect(message[88]).toBe(7);
  });

  test("rejects a hash that is not 32 bytes", () => {
    expect(() =>
      attestationMessage({ ...fields, imageHash: new Uint8Array(31) }),
    ).toThrow("image hash must be 32 bytes");
  });
});
