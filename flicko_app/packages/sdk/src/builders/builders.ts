import { BN } from "@anchor-lang/core";
import {
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { configPda, memeAccounts } from "../pda/pda";
import type { FlickoProgram } from "../core/program";

export const BPF_LOADER_UPGRADEABLE = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111",
);

const bn = (value: bigint) => new BN(value.toString());

export const programDataAddress = (programId: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [programId.toBuffer()],
    BPF_LOADER_UPGRADEABLE,
  )[0];

export const memeTokenAccount = (owner: PublicKey, mint: PublicKey) =>
  getAssociatedTokenAddressSync(mint, owner, true, TOKEN_2022_PROGRAM_ID);

export const skrTokenAccount = (
  owner: PublicKey,
  skrMint: PublicKey,
  skrTokenProgram: PublicKey = TOKEN_PROGRAM_ID,
) => getAssociatedTokenAddressSync(skrMint, owner, true, skrTokenProgram);

export interface ConfigValues {
  creatorFeeBps: number;
  burnBps: number;
  creationFee: bigint;
  minSupply: bigint;
  maxSupply: bigint;
  minStartPrice: bigint;
  maxStartPrice: bigint;
}

const configArgs = (values: ConfigValues) => ({
  creatorFeeBps: values.creatorFeeBps,
  burnBps: values.burnBps,
  creationFee: bn(values.creationFee),
  minSupply: bn(values.minSupply),
  maxSupply: bn(values.maxSupply),
  minStartPrice: bn(values.minStartPrice),
  maxStartPrice: bn(values.maxStartPrice),
});

export const initializeConfigInstruction = (
  program: FlickoProgram,
  params: { admin: PublicKey; skrMint: PublicKey; config: ConfigValues },
) =>
  program.methods
    .initializeConfig(configArgs(params.config))
    .accountsPartial({
      admin: params.admin,
      skrMint: params.skrMint,
      config: configPda(program.programId),
      program: program.programId,
      programData: programDataAddress(program.programId),
      systemProgram: SystemProgram.programId,
    })
    .instruction();

export const updateConfigInstruction = (
  program: FlickoProgram,
  params: { admin: PublicKey; config: ConfigValues },
) =>
  program.methods
    .updateConfig(configArgs(params.config))
    .accountsPartial({
      admin: params.admin,
      config: configPda(program.programId),
    })
    .instruction();

export interface CreateMemeParams {
  creator: PublicKey;
  mint: PublicKey;
  skrMint: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  imageHash: Uint8Array | number[];
  supply: bigint;
  startPrice: bigint;
  skrTokenProgram?: PublicKey;
}

export const createMemeInstruction = (
  program: FlickoProgram,
  params: CreateMemeParams,
) => {
  const skrTokenProgram = params.skrTokenProgram ?? TOKEN_PROGRAM_ID;
  const { meme, tokenVault, skrVault } = memeAccounts(
    params.mint,
    program.programId,
  );

  return program.methods
    .createMeme(
      params.name,
      params.symbol,
      params.uri,
      Array.from(params.imageHash),
      bn(params.supply),
      bn(params.startPrice),
    )
    .accountsPartial({
      creator: params.creator,
      config: configPda(program.programId),
      skrMint: params.skrMint,
      creatorSkrAccount: skrTokenAccount(
        params.creator,
        params.skrMint,
        skrTokenProgram,
      ),
      mint: params.mint,
      meme,
      tokenVault,
      skrVault,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      skrTokenProgram,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
};

export interface TradeParams {
  trader: PublicKey;
  mint: PublicKey;
  skrMint: PublicKey;
  skrTokenProgram?: PublicKey;
}

export const buyInstruction = (
  program: FlickoProgram,
  params: TradeParams & { skrIn: bigint; minTokensOut: bigint },
) => {
  const skrTokenProgram = params.skrTokenProgram ?? TOKEN_PROGRAM_ID;
  const { meme, tokenVault, skrVault } = memeAccounts(
    params.mint,
    program.programId,
  );

  return program.methods
    .buy(bn(params.skrIn), bn(params.minTokensOut))
    .accountsPartial({
      buyer: params.trader,
      config: configPda(program.programId),
      skrMint: params.skrMint,
      mint: params.mint,
      meme,
      tokenVault,
      skrVault,
      buyerSkrAccount: skrTokenAccount(
        params.trader,
        params.skrMint,
        skrTokenProgram,
      ),
      buyerTokenAccount: memeTokenAccount(params.trader, params.mint),
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      skrTokenProgram,
    })
    .instruction();
};

export const sellInstruction = (
  program: FlickoProgram,
  params: TradeParams & { tokensIn: bigint; minSkrOut: bigint },
) => {
  const skrTokenProgram = params.skrTokenProgram ?? TOKEN_PROGRAM_ID;
  const { meme, tokenVault, skrVault } = memeAccounts(
    params.mint,
    program.programId,
  );

  return program.methods
    .sell(bn(params.tokensIn), bn(params.minSkrOut))
    .accountsPartial({
      seller: params.trader,
      config: configPda(program.programId),
      skrMint: params.skrMint,
      mint: params.mint,
      meme,
      tokenVault,
      skrVault,
      sellerSkrAccount: skrTokenAccount(
        params.trader,
        params.skrMint,
        skrTokenProgram,
      ),
      sellerTokenAccount: memeTokenAccount(params.trader, params.mint),
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      skrTokenProgram,
    })
    .instruction();
};

export const claimCreatorFeesInstruction = (
  program: FlickoProgram,
  params: {
    creator: PublicKey;
    mint: PublicKey;
    skrMint: PublicKey;
    skrTokenProgram?: PublicKey;
  },
) => {
  const skrTokenProgram = params.skrTokenProgram ?? TOKEN_PROGRAM_ID;
  const { meme, skrVault } = memeAccounts(params.mint, program.programId);

  return program.methods
    .claimCreatorFees()
    .accountsPartial({
      creator: params.creator,
      config: configPda(program.programId),
      skrMint: params.skrMint,
      meme,
      skrVault,
      creatorSkrAccount: skrTokenAccount(
        params.creator,
        params.skrMint,
        skrTokenProgram,
      ),
      skrTokenProgram,
    })
    .instruction();
};
