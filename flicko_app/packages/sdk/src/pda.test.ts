import { describe, expect, test } from "bun:test";
import { Keypair, PublicKey } from "@solana/web3.js";
import idlJson from "./idl/flicko_programs.json";
import {
  CONFIG_SEED,
  MEME_DECIMALS,
  MEME_SEED,
  PROGRAM_ID,
  SKR_VAULT_SEED,
  TOKEN_VAULT_SEED,
} from "./constants";
import { configPda, memeAccounts, memePda } from "./pda";

/*
 * The IDL stores byte-string constants as "[b1, b2, ...]" and numbers as strings.
 */
const idlConstant = (name: string) =>
  idlJson.constants.find((c) => c.name === name)!.value;
const idlSeed = (name: string) =>
  Buffer.from(JSON.parse(idlConstant(name)) as number[]).toString();

describe("constants", () => {
  test("seeds and decimals match the program IDL", () => {
    expect(idlSeed("CONFIG_SEED")).toBe(CONFIG_SEED);
    expect(idlSeed("MEME_SEED")).toBe(MEME_SEED);
    expect(idlSeed("SKR_VAULT_SEED")).toBe(SKR_VAULT_SEED);
    expect(idlSeed("TOKEN_VAULT_SEED")).toBe(TOKEN_VAULT_SEED);
    expect(Number(idlConstant("MEME_DECIMALS"))).toBe(MEME_DECIMALS);
  });

  test("program id comes from the IDL", () => {
    expect(PROGRAM_ID.toBase58()).toBe(
      "4BfMnkmQheerNffcJtEusXxVC16uhGExrRevBLUcZgBD",
    );
  });
});

describe("pdas", () => {
  test("derive with the program seeds", () => {
    const mint = Keypair.generate().publicKey;
    const [expectedMeme] = PublicKey.findProgramAddressSync(
      [Buffer.from("meme"), mint.toBuffer()],
      PROGRAM_ID,
    );
    const { meme, tokenVault, skrVault } = memeAccounts(mint);

    expect(memePda(mint).equals(expectedMeme)).toBe(true);
    expect(meme.equals(expectedMeme)).toBe(true);
    expect(
      tokenVault.equals(
        PublicKey.findProgramAddressSync(
          [Buffer.from("token_vault"), meme.toBuffer()],
          PROGRAM_ID,
        )[0],
      ),
    ).toBe(true);
    expect(
      skrVault.equals(
        PublicKey.findProgramAddressSync(
          [Buffer.from("skr_vault"), meme.toBuffer()],
          PROGRAM_ID,
        )[0],
      ),
    ).toBe(true);
  });

  test("accept another program id", () => {
    const other = Keypair.generate().publicKey;
    expect(configPda(other).equals(configPda())).toBe(false);
  });
});
