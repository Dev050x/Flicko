import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";

import { PROGRAM_ID } from "../core/constants";
import { IDL } from "../core/idl";
import { configPda, memeAccounts } from "../pda/pda";
import { memeTokenAccount, skrTokenAccount, type TradeParams } from "./builders";

/*
 * buy / sell instructions built without Anchor (same accounts and data as
 * `buyInstruction` / `sellInstruction`), for apps whose JS engine can't run Anchor's
 * coder. Data = 8-byte discriminator from the IDL, then two u64 little-endian args.
 */
const discriminator = (name: string) => {
  const ix = IDL.instructions.find((i) => i.name === name);
  if (!ix) throw new Error(`no ${name} instruction in the IDL`);
  return Uint8Array.from(ix.discriminator);
};

const U64_MAX = (1n << 64n) - 1n;

const data = (name: string, a: bigint, b: bigint) => {
  const out = new Uint8Array(24);
  out.set(discriminator(name), 0);
  const view = new DataView(out.buffer);
  for (const [i, v] of [a, b].entries()) {
    if (v < 0n || v > U64_MAX) throw new Error(`${name} argument out of u64 range`);
    view.setUint32(8 + i * 8, Number(v & 0xffffffffn), true);
    view.setUint32(12 + i * 8, Number(v >> 32n), true);
  }
  return Buffer.from(out);
};

const tradeKeys = (params: TradeParams, programId: PublicKey) => {
  const skrTokenProgram = params.skrTokenProgram ?? TOKEN_PROGRAM_ID;
  const { meme, tokenVault, skrVault } = memeAccounts(params.mint, programId);
  const w = (pubkey: PublicKey) => ({ pubkey, isSigner: false, isWritable: true });
  const r = (pubkey: PublicKey) => ({ pubkey, isSigner: false, isWritable: false });
  return {
    skrTokenProgram,
    middle: [
      r(configPda(programId)),
      w(params.skrMint),
      r(params.mint),
      w(meme),
      w(tokenVault),
      w(skrVault),
      w(skrTokenAccount(params.trader, params.skrMint, skrTokenProgram)),
      w(memeTokenAccount(params.trader, params.mint)),
      r(TOKEN_2022_PROGRAM_ID),
      r(skrTokenProgram),
    ],
    r,
  };
};

export const buyInstructionRaw = (
  params: TradeParams & { skrIn: bigint; minTokensOut: bigint },
  programId: PublicKey = PROGRAM_ID,
) => {
  const { middle, r } = tradeKeys(params, programId);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: params.trader, isSigner: true, isWritable: true },
      ...middle,
      r(ASSOCIATED_TOKEN_PROGRAM_ID),
      r(SystemProgram.programId),
    ],
    data: data("buy", params.skrIn, params.minTokensOut),
  });
};

export const sellInstructionRaw = (
  params: TradeParams & { tokensIn: bigint; minSkrOut: bigint },
  programId: PublicKey = PROGRAM_ID,
) => {
  const { middle } = tradeKeys(params, programId);
  return new TransactionInstruction({
    programId,
    keys: [{ pubkey: params.trader, isSigner: true, isWritable: false }, ...middle],
    data: data("sell", params.tokensIn, params.minSkrOut),
  });
};
