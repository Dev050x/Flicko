import { describe, expect, test } from "bun:test";
import { BN } from "@anchor-lang/core";
import { Connection, Keypair } from "@solana/web3.js";
import { decodeConfigAccount } from "../src/accounts/config";
import { getReadonlyProgram } from "../src/core/program";

describe("decodeConfigAccount", () => {
  test("matches Anchor's coder", async () => {
    const program = getReadonlyProgram(new Connection("http://127.0.0.1:1"));
    const values = {
      admin: Keypair.generate().publicKey,
      skrMint: Keypair.generate().publicKey,
      creatorFeeBps: 200,
      burnBps: 50,
      creationFee: new BN("1000000"),
      minSupply: new BN("1000000000"),
      maxSupply: new BN("1000000000000000"),
      minStartPrice: new BN(1),
      maxStartPrice: new BN("1000000000"),
      bump: 254,
    };
    const data = await program.coder.accounts.encode("config", values);
    const decoded = decodeConfigAccount(data);
    expect(decoded.admin.equals(values.admin)).toBe(true);
    expect(decoded.skrMint.equals(values.skrMint)).toBe(true);
    expect(decoded).toMatchObject({
      creatorFeeBps: 200,
      burnBps: 50,
      creationFee: 1_000_000n,
      minSupply: 1_000_000_000n,
      maxSupply: 1_000_000_000_000_000n,
      minStartPrice: 1n,
      maxStartPrice: 1_000_000_000n,
      bump: 254,
    });
  });
});
