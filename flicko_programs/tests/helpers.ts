import * as anchor from "@anchor-lang/core";
import { BN, Program } from "@anchor-lang/core";
import {
  createAssociatedTokenAccount,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
  mintTo,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { createHash } from "crypto";
import { expect } from "chai";
import { FlickoPrograms } from "../target/types/flicko_programs";

export const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

export const program = anchor.workspace
  .flickoPrograms as Program<FlickoPrograms>;
export const connection = provider.connection;
export const admin = (provider.wallet as anchor.Wallet).payer;

export const ONE = new BN(1_000_000);
export const CREATION_FEE = new BN(10).mul(ONE);
export const MIN_SUPPLY = new BN(1_000).mul(ONE);
export const MAX_SUPPLY = new BN(1_000_000_000).mul(ONE);
export const MIN_START_PRICE = new BN(1);
export const MAX_START_PRICE = new BN(1_000_000_000);
export const CREATOR_FEE_BPS = 200;
export const BURN_BPS = 50;

export const configArgs = {
  creatorFeeBps: CREATOR_FEE_BPS,
  burnBps: BURN_BPS,
  creationFee: CREATION_FEE,
  minSupply: MIN_SUPPLY,
  maxSupply: MAX_SUPPLY,
  minStartPrice: MIN_START_PRICE,
  maxStartPrice: MAX_START_PRICE,
};

export const [configPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("config")],
  program.programId
);
export const [programData] = PublicKey.findProgramAddressSync(
  [program.programId.toBuffer()],
  new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
);

export const creator = Keypair.generate();
export const trader = Keypair.generate();

/*
 * Accounts created once by setup() and shared by every test file.
 */
export const env = {
  skrMint: PublicKey.default,
  creatorSkr: PublicKey.default,
  traderSkr: PublicKey.default,
};

const fund = async (wallet: PublicKey) => {
  const sig = await connection.requestAirdrop(wallet, 10 * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, "confirmed");
};

const giveSkr = async (owner: PublicKey, amount: number) => {
  const account = await createAssociatedTokenAccount(
    connection,
    admin,
    env.skrMint,
    owner
  );
  await mintTo(
    connection,
    admin,
    env.skrMint,
    account,
    admin,
    BigInt(amount) * BigInt(1_000_000)
  );
  return account;
};

let ready: Promise<void> | undefined;

/*
 * Funds the creator and trader, creates a classic SPL test SKR mint,
 * gives the creator 1,000 SKR and the trader 100,000 SKR. Runs only once.
 */
export const setup = () => {
  ready ??= (async () => {
    await fund(creator.publicKey);
    await fund(trader.publicKey);
    env.skrMint = await createMint(connection, admin, admin.publicKey, null, 6);
    env.creatorSkr = await giveSkr(creator.publicKey, 1_000);
    env.traderSkr = await giveSkr(trader.publicKey, 100_000);
  })();
  return ready;
};

/*
 * Derives the meme PDA and both vault PDAs for a given meme mint.
 */
export const memePdas = (mint: PublicKey) => {
  const [meme] = PublicKey.findProgramAddressSync(
    [Buffer.from("meme"), mint.toBuffer()],
    program.programId
  );
  const [tokenVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_vault"), meme.toBuffer()],
    program.programId
  );
  const [skrVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("skr_vault"), meme.toBuffer()],
    program.programId
  );
  return { meme, tokenVault, skrVault };
};

export const traderTokenAccount = (mint: PublicKey) =>
  getAssociatedTokenAddressSync(
    mint,
    trader.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );

/*
 * Sends create_meme with a fresh mint keypair and returns the mint.
 */
export const createMeme = async (
  supply: BN,
  startPrice: BN,
  name = "Gm Ser",
  symbol = "GMSER",
  uri = "https://r2.flicko.app/memes/gm-ser.json",
  imageHash = createHash("sha256").update("gm-ser.jpg").digest()
) => {
  const mint = Keypair.generate();
  const { meme, tokenVault, skrVault } = memePdas(mint.publicKey);

  await program.methods
    .createMeme(name, symbol, uri, [...imageHash], supply, startPrice)
    .accountsPartial({
      creator: creator.publicKey,
      config: configPda,
      skrMint: env.skrMint,
      creatorSkrAccount: env.creatorSkr,
      mint: mint.publicKey,
      meme,
      tokenVault,
      skrVault,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      skrTokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([creator, mint])
    .rpc({ commitment: "confirmed" });

  return mint.publicKey;
};

/*
 * Sends buy for the trader.
 */
export const buy = async (
  mint: PublicKey,
  skrIn: BN,
  minTokensOut = new BN(0)
) => {
  const { meme, tokenVault, skrVault } = memePdas(mint);

  await program.methods
    .buy(skrIn, minTokensOut)
    .accountsPartial({
      buyer: trader.publicKey,
      config: configPda,
      skrMint: env.skrMint,
      mint,
      meme,
      tokenVault,
      skrVault,
      buyerSkrAccount: env.traderSkr,
      buyerTokenAccount: traderTokenAccount(mint),
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      skrTokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([trader])
    .rpc({ commitment: "confirmed" });
};

/*
 * Sends sell for the trader.
 */
export const sell = async (
  mint: PublicKey,
  tokensIn: BN,
  minSkrOut = new BN(0)
) => {
  const { meme, tokenVault, skrVault } = memePdas(mint);

  await program.methods
    .sell(tokensIn, minSkrOut)
    .accountsPartial({
      seller: trader.publicKey,
      config: configPda,
      skrMint: env.skrMint,
      mint,
      meme,
      tokenVault,
      skrVault,
      sellerSkrAccount: env.traderSkr,
      sellerTokenAccount: traderTokenAccount(mint),
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      skrTokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([trader])
    .rpc({ commitment: "confirmed" });
};

/*
 * Runs an async call that must fail and returns the anchor error code.
 */
export const expectError = async (call: () => Promise<unknown>) => {
  try {
    await call();
  } catch (err) {
    return (err as anchor.AnchorError).error?.errorCode?.code;
  }
  expect.fail("expected the transaction to fail");
};

export const skrBalance = async (account: PublicKey) =>
  new BN(
    (await getAccount(connection, account, "confirmed")).amount.toString()
  );

export const skrSupply = async () =>
  new BN(
    (await getMint(connection, env.skrMint, "confirmed")).supply.toString()
  );

export const tokenBalance = async (account: PublicKey) =>
  new BN(
    (
      await getAccount(connection, account, "confirmed", TOKEN_2022_PROGRAM_ID)
    ).amount.toString()
  );

/*
 * Mirrors the on-chain fee and constant-product math so tests can check exact amounts.
 */
export const ceilDiv = (a: BN, b: BN) => {
  const q = a.div(b);
  return a.mod(b).isZero() ? q : q.addn(1);
};

export const fee = (amount: BN, bps: number) =>
  ceilDiv(amount.muln(bps), new BN(10_000));

export const splitFees = (gross: BN) => {
  const creatorFee = fee(gross, CREATOR_FEE_BPS);
  const burn = fee(gross, BURN_BPS);
  return { creatorFee, burn, net: gross.sub(creatorFee).sub(burn) };
};

export const quoteBuy = (skrReserve: BN, tokenReserve: BN, skrIn: BN) => {
  const fees = splitFees(skrIn);
  const k = skrReserve.mul(tokenReserve);
  const tokensAfter = ceilDiv(k, skrReserve.add(fees.net));
  return { ...fees, tokensOut: tokenReserve.sub(tokensAfter) };
};

export const quoteSell = (skrReserve: BN, tokenReserve: BN, tokensIn: BN) => {
  const k = skrReserve.mul(tokenReserve);
  const skrAfter = ceilDiv(k, tokenReserve.add(tokensIn));
  return { ...splitFees(skrReserve.sub(skrAfter)), skrAfter };
};
