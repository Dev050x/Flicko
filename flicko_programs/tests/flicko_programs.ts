import * as anchor from "@anchor-lang/core";
import { BN, Program } from "@anchor-lang/core";
import {
  createAssociatedTokenAccount,
  createMint,
  getAccount,
  getMetadataPointerState,
  getMint,
  getTokenMetadata,
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

describe("flicko_programs", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.flickoPrograms as Program<FlickoPrograms>;
  const connection = provider.connection;
  const admin = (provider.wallet as anchor.Wallet).payer;

  const ONE = new BN(1_000_000);
  const CREATION_FEE = new BN(10).mul(ONE);
  const MIN_SUPPLY = new BN(1_000).mul(ONE);
  const MAX_SUPPLY = new BN(1_000_000_000).mul(ONE);
  const MIN_START_PRICE = new BN(1);
  const MAX_START_PRICE = new BN(1_000_000_000);

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );
  const [programData] = PublicKey.findProgramAddressSync(
    [program.programId.toBuffer()],
    new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
  );

  const creator = Keypair.generate();
  let skrMint: PublicKey;
  let creatorSkr: PublicKey;

  /*
   * Derives the meme PDA and both vault PDAs for a given meme mint.
   */
  const memePdas = (mint: PublicKey) => {
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

  /*
   * Sends create_meme with a fresh mint keypair and returns the mint.
   */
  const createMeme = async (
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
        skrMint,
        creatorSkrAccount: creatorSkr,
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
   * Runs an async call that must fail and returns the anchor error code.
   */
  const expectError = async (call: () => Promise<unknown>) => {
    try {
      await call();
    } catch (err) {
      return (err as anchor.AnchorError).error?.errorCode?.code;
    }
    expect.fail("expected the transaction to fail");
  };

  before(async () => {
    /*
     * Fund the creator, create a classic SPL test SKR mint and give the creator 1,000 SKR.
     */
    const sig = await connection.requestAirdrop(
      creator.publicKey,
      10 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(sig, "confirmed");

    skrMint = await createMint(connection, admin, admin.publicKey, null, 6);
    creatorSkr = await createAssociatedTokenAccount(
      connection,
      admin,
      skrMint,
      creator.publicKey
    );
    await mintTo(
      connection,
      admin,
      skrMint,
      creatorSkr,
      admin,
      BigInt(1_000 * 1_000_000)
    );
  });

  const configArgs = {
    creatorFeeBps: 200,
    burnBps: 50,
    creationFee: CREATION_FEE,
    minSupply: MIN_SUPPLY,
    maxSupply: MAX_SUPPLY,
    minStartPrice: MIN_START_PRICE,
    maxStartPrice: MAX_START_PRICE,
  };

  it("rejects initialize_config from a non upgrade authority", async () => {
    const stranger = Keypair.generate();
    const sig = await connection.requestAirdrop(
      stranger.publicKey,
      LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(sig, "confirmed");

    const code = await expectError(() =>
      program.methods
        .initializeConfig(configArgs)
        .accountsPartial({
          admin: stranger.publicKey,
          skrMint,
          config: configPda,
          programData,
        })
        .signers([stranger])
        .rpc()
    );
    expect(code).to.equal("Unauthorized");
  });

  it("initializes config", async () => {
    await program.methods
      .initializeConfig(configArgs)
      .accountsPartial({
        admin: admin.publicKey,
        skrMint,
        config: configPda,
        programData,
      })
      .rpc();

    const config = await program.account.config.fetch(configPda);
    expect(config.admin.toBase58()).to.equal(admin.publicKey.toBase58());
    expect(config.skrMint.toBase58()).to.equal(skrMint.toBase58());
    expect(config.creatorFeeBps).to.equal(200);
    expect(config.burnBps).to.equal(50);
    expect(config.creationFee.toString()).to.equal(CREATION_FEE.toString());
    expect(config.minSupply.toString()).to.equal(MIN_SUPPLY.toString());
    expect(config.maxSupply.toString()).to.equal(MAX_SUPPLY.toString());
  });

  it("creates a meme", async () => {
    /*
     * 1,000,000 tokens at 0.001 SKR each (1,000 SKR base units per whole token).
     */
    const supply = new BN(1_000_000).mul(ONE);
    const startPrice = new BN(1_000);
    const imageHash = createHash("sha256").update("gm-ser.jpg").digest();
    const skrBefore = (await getAccount(connection, creatorSkr)).amount;

    const mint = await createMeme(supply, startPrice);
    const { meme, tokenVault, skrVault } = memePdas(mint);

    /*
     * Mint: 6 decimals, full supply minted, no mint or freeze authority left.
     */
    const mintInfo = await getMint(
      connection,
      mint,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(mintInfo.decimals).to.equal(6);
    expect(mintInfo.supply.toString()).to.equal(supply.toString());
    expect(mintInfo.mintAuthority).to.equal(null);
    expect(mintInfo.freezeAuthority).to.equal(null);

    /*
     * Metadata lives on the mint, the pointer is locked and the meme PDA owns updates.
     */
    const pointer = getMetadataPointerState(mintInfo);
    expect(pointer.metadataAddress.toBase58()).to.equal(mint.toBase58());
    expect(pointer.authority).to.equal(null);

    const metadata = await getTokenMetadata(
      connection,
      mint,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(metadata.name).to.equal("Gm Ser");
    expect(metadata.symbol).to.equal("GMSER");
    expect(metadata.uri).to.equal("https://r2.flicko.app/memes/gm-ser.json");
    expect(metadata.updateAuthority.toBase58()).to.equal(meme.toBase58());

    /*
     * Vaults: token vault holds the whole supply, SKR vault starts empty, both owned by the meme PDA.
     */
    const tokenVaultInfo = await getAccount(
      connection,
      tokenVault,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(tokenVaultInfo.amount.toString()).to.equal(supply.toString());
    expect(tokenVaultInfo.owner.toBase58()).to.equal(meme.toBase58());

    const skrVaultInfo = await getAccount(connection, skrVault);
    expect(skrVaultInfo.amount.toString()).to.equal("0");
    expect(skrVaultInfo.owner.toBase58()).to.equal(meme.toBase58());

    /*
     * Creation fee is burned from the creator.
     */
    const skrAfter = (await getAccount(connection, creatorSkr)).amount;
    expect((skrBefore - skrAfter).toString()).to.equal(CREATION_FEE.toString());

    /*
     * Meme state: T0 = S * 16 / 15, V0 = p0 * T0 / 1e6, R = 80% of S, Q = 20% of S.
     */
    const virtualTokens = supply.muln(16).divn(15);
    const virtualSkr = startPrice.mul(virtualTokens).div(ONE);
    const memeAccount = await program.account.meme.fetch(meme);
    expect(memeAccount.creator.toBase58()).to.equal(
      creator.publicKey.toBase58()
    );
    expect(memeAccount.mint.toBase58()).to.equal(mint.toBase58());
    expect(memeAccount.parent).to.equal(null);
    expect(Buffer.from(memeAccount.imageHash).equals(imageHash)).to.equal(true);
    expect(memeAccount.phase).to.deep.equal({ launch: {} });
    expect(memeAccount.totalSupply.toString()).to.equal(supply.toString());
    expect(memeAccount.saleSupply.toString()).to.equal(
      supply.muln(4).divn(5).toString()
    );
    expect(memeAccount.poolSupply.toString()).to.equal(
      supply.divn(5).toString()
    );
    expect(memeAccount.virtualSkr.toString()).to.equal(virtualSkr.toString());
    expect(memeAccount.curveSkr.toString()).to.equal(virtualSkr.toString());
    expect(memeAccount.curveTokens.toString()).to.equal(
      virtualTokens.toString()
    );
    expect(memeAccount.tokensSold.toString()).to.equal("0");
    expect(memeAccount.realSkr.toString()).to.equal("0");
  });

  it("rejects supply outside the config range", async () => {
    const code = await expectError(() =>
      createMeme(MIN_SUPPLY.subn(5), new BN(1_000))
    );
    expect(code).to.equal("SupplyOutOfRange");
  });

  it("rejects start price outside the config range", async () => {
    const code = await expectError(() =>
      createMeme(new BN(1_000_000).mul(ONE), MAX_START_PRICE.addn(1))
    );
    expect(code).to.equal("PriceOutOfRange");
  });

  it("rejects supply not divisible by 5", async () => {
    const code = await expectError(() =>
      createMeme(new BN(1_000_000).mul(ONE).addn(1), new BN(1_000))
    );
    expect(code).to.equal("InvalidSupply");
  });

  it("rejects a symbol that is too long", async () => {
    const code = await expectError(() =>
      createMeme(
        new BN(1_000_000).mul(ONE),
        new BN(1_000),
        "Gm Ser",
        "TOOLONGSYMBOL"
      )
    );
    expect(code).to.equal("InvalidMetadata");
  });
});
