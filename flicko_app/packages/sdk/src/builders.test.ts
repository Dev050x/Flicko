import { describe, expect, test } from "bun:test";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  type TransactionInstruction,
} from "@solana/web3.js";
import idlJson from "./idl/flicko_programs.json";
import {
  buyInstruction,
  claimCreatorFeesInstruction,
  createMemeInstruction,
  initializeConfigInstruction,
  programDataAddress,
  sellInstruction,
  updateConfigInstruction,
} from "./builders";
import { PROGRAM_ID } from "./constants";
import { configPda, memeAccounts } from "./pda";
import { getReadonlyProgram } from "./program";

/*
 * Builders never touch the network; the connection points nowhere on purpose.
 */
const program = getReadonlyProgram(new Connection("http://127.0.0.1:1"));

const user = Keypair.generate().publicKey;
const mint = Keypair.generate().publicKey;
const skrMint = Keypair.generate().publicKey;
const { meme, tokenVault, skrVault } = memeAccounts(mint);
const userSkr = getAssociatedTokenAddressSync(
  skrMint,
  user,
  true,
  TOKEN_PROGRAM_ID,
);
const userTokens = getAssociatedTokenAddressSync(
  mint,
  user,
  true,
  TOKEN_2022_PROGRAM_ID,
);

const config = {
  creatorFeeBps: 200,
  burnBps: 50,
  creationFee: 0n,
  minSupply: 1_000_000_000n,
  maxSupply: 1_000_000_000_000_000n,
  minStartPrice: 1n,
  maxStartPrice: 1_000_000_000n,
};

/*
 * Checks the discriminator and that each account slot, named as in the IDL, holds the expected key.
 */
const expectInstruction = (
  ix: TransactionInstruction,
  name: string,
  expected: Record<string, PublicKey>,
) => {
  const idlIx = idlJson.instructions.find((i) => i.name === name)!;
  expect(ix.programId.equals(PROGRAM_ID)).toBe(true);
  expect([...ix.data.subarray(0, 8)]).toEqual(idlIx.discriminator);
  expect(ix.keys.length).toBe(idlIx.accounts.length);

  const keys = Object.fromEntries(
    idlIx.accounts.map((account, i) => [
      account.name,
      ix.keys[i]!.pubkey.toBase58(),
    ]),
  );
  for (const [account, key] of Object.entries(expected)) {
    expect({ account, key: keys[account] }).toEqual({
      account,
      key: key.toBase58(),
    });
  }
};

describe("instruction builders", () => {
  test("initialize_config passes the program data account", async () => {
    const ix = await initializeConfigInstruction(program, {
      admin: user,
      skrMint,
      config,
    });
    expectInstruction(ix, "initialize_config", {
      admin: user,
      skr_mint: skrMint,
      config: configPda(),
      program: PROGRAM_ID,
      program_data: programDataAddress(PROGRAM_ID),
      system_program: SystemProgram.programId,
    });
  });

  test("update_config", async () => {
    const ix = await updateConfigInstruction(program, { admin: user, config });
    expectInstruction(ix, "update_config", {
      admin: user,
      config: configPda(),
    });
  });

  test("create_meme derives the meme and vault PDAs", async () => {
    const ix = await createMemeInstruction(program, {
      creator: user,
      mint,
      skrMint,
      name: "Gm Ser",
      symbol: "GMSER",
      uri: "https://example.com/gm.json",
      imageHash: new Uint8Array(32).fill(7),
      supply: 1_000_000_000_000n,
      startPrice: 1_000n,
    });
    expectInstruction(ix, "create_meme", {
      creator: user,
      config: configPda(),
      skr_mint: skrMint,
      creator_skr_account: userSkr,
      mint,
      meme,
      token_vault: tokenVault,
      skr_vault: skrVault,
      token_program: TOKEN_2022_PROGRAM_ID,
      skr_token_program: TOKEN_PROGRAM_ID,
    });
  });

  test("buy uses the trader's associated token accounts", async () => {
    const ix = await buyInstruction(program, {
      trader: user,
      mint,
      skrMint,
      skrIn: 100_000_000n,
      minTokensOut: 1n,
    });
    expectInstruction(ix, "buy", {
      buyer: user,
      meme,
      token_vault: tokenVault,
      skr_vault: skrVault,
      buyer_skr_account: userSkr,
      buyer_token_account: userTokens,
      associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID,
    });
  });

  test("sell", async () => {
    const ix = await sellInstruction(program, {
      trader: user,
      mint,
      skrMint,
      tokensIn: 1_000_000n,
      minSkrOut: 1n,
    });
    expectInstruction(ix, "sell", {
      seller: user,
      meme,
      seller_skr_account: userSkr,
      seller_token_account: userTokens,
    });
  });

  test("claim_creator_fees", async () => {
    const ix = await claimCreatorFeesInstruction(program, {
      creator: user,
      mint,
      skrMint,
    });
    expectInstruction(ix, "claim_creator_fees", {
      creator: user,
      meme,
      skr_vault: skrVault,
      creator_skr_account: userSkr,
    });
  });
});
