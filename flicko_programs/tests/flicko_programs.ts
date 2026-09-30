import * as anchor from "@anchor-lang/core";
import { BN, Program } from "@anchor-lang/core";
import {
  createAssociatedTokenAccount,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
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
  const buyer = Keypair.generate();
  let skrMint: PublicKey;
  let creatorSkr: PublicKey;
  let buyerSkr: PublicKey;

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
   * Mirrors the on-chain fee and constant-product math so tests can check exact amounts.
   */
  const ceilDiv = (a: BN, b: BN) => {
    const q = a.div(b);
    return a.mod(b).isZero() ? q : q.addn(1);
  };
  const fee = (amount: BN, bps: number) =>
    ceilDiv(amount.muln(bps), new BN(10_000));
  const splitFees = (gross: BN) => {
    const creatorFee = fee(gross, 200);
    const burn = fee(gross, 50);
    return { creatorFee, burn, net: gross.sub(creatorFee).sub(burn) };
  };
  const quoteBuy = (skrReserve: BN, tokenReserve: BN, skrIn: BN) => {
    const fees = splitFees(skrIn);
    const k = skrReserve.mul(tokenReserve);
    const tokensAfter = ceilDiv(k, skrReserve.add(fees.net));
    return { ...fees, tokensOut: tokenReserve.sub(tokensAfter) };
  };

  /*
   * Sends buy for the buyer and returns the buyer's meme token account.
   */
  const buy = async (mint: PublicKey, skrIn: BN, minTokensOut = new BN(0)) => {
    const { meme, tokenVault, skrVault } = memePdas(mint);
    const buyerTokenAccount = getAssociatedTokenAddressSync(
      mint,
      buyer.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    await program.methods
      .buy(skrIn, minTokensOut)
      .accountsPartial({
        buyer: buyer.publicKey,
        config: configPda,
        skrMint,
        mint,
        meme,
        tokenVault,
        skrVault,
        buyerSkrAccount: buyerSkr,
        buyerTokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        skrTokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc({ commitment: "confirmed" });

    return buyerTokenAccount;
  };

  const skrBalance = async (account: PublicKey) =>
    new BN(
      (await getAccount(connection, account, "confirmed")).amount.toString()
    );

  const skrSupply = async () =>
    new BN((await getMint(connection, skrMint, "confirmed")).supply.toString());

  const tokenBalance = async (account: PublicKey) =>
    new BN(
      (
        await getAccount(
          connection,
          account,
          "confirmed",
          TOKEN_2022_PROGRAM_ID
        )
      ).amount.toString()
    );

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
     * Fund the creator and buyer, create a classic SPL test SKR mint,
     * give the creator 1,000 SKR and the buyer 100,000 SKR.
     */
    for (const wallet of [creator, buyer]) {
      const sig = await connection.requestAirdrop(
        wallet.publicKey,
        10 * LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(sig, "confirmed");
    }

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

    buyerSkr = await createAssociatedTokenAccount(
      connection,
      admin,
      skrMint,
      buyer.publicKey
    );
    await mintTo(
      connection,
      admin,
      skrMint,
      buyerSkr,
      admin,
      BigInt(100_000 * 1_000_000)
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
    expect(pointer!.metadataAddress!.toBase58()).to.equal(mint.toBase58());
    expect(pointer!.authority).to.equal(null);

    const metadata = await getTokenMetadata(
      connection,
      mint,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(metadata!.name).to.equal("Gm Ser");
    expect(metadata!.symbol).to.equal("GMSER");
    expect(metadata!.uri).to.equal("https://r2.flicko.app/memes/gm-ser.json");
    expect(metadata!.updateAuthority!.toBase58()).to.equal(meme.toBase58());

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

  describe("buy", () => {
    const supply = new BN(1_000_000).mul(ONE);
    const startPrice = new BN(1_000);
    let mint: PublicKey;

    before(async () => {
      mint = await createMeme(supply, startPrice);
    });

    it("buys tokens on the launch curve", async () => {
      const { meme, skrVault } = memePdas(mint);
      const before = await program.account.meme.fetch(meme);
      const skrIn = new BN(100).mul(ONE);
      const quote = quoteBuy(before.curveSkr, before.curveTokens, skrIn);
      const buyerSkrBefore = await skrBalance(buyerSkr);
      const supplyBefore = await skrSupply();

      const buyerTokenAccount = await buy(mint, skrIn, quote.tokensOut);

      /*
       * Buyer pays skr_in: net + creator fee go to the vault, the burn share is burned.
       */
      expect((await tokenBalance(buyerTokenAccount)).toString()).to.equal(
        quote.tokensOut.toString()
      );
      expect(
        buyerSkrBefore.sub(await skrBalance(buyerSkr)).toString()
      ).to.equal(skrIn.toString());
      expect((await skrBalance(skrVault)).toString()).to.equal(
        quote.net.add(quote.creatorFee).toString()
      );
      expect(supplyBefore.sub(await skrSupply()).toString()).to.equal(
        quote.burn.toString()
      );

      const after = await program.account.meme.fetch(meme);
      expect(after.phase).to.deep.equal({ launch: {} });
      expect(after.tokensSold.toString()).to.equal(quote.tokensOut.toString());
      expect(after.realSkr.toString()).to.equal(quote.net.toString());
      expect(after.creatorFees.toString()).to.equal(
        quote.creatorFee.toString()
      );
      expect(after.curveSkr.toString()).to.equal(
        before.curveSkr.add(quote.net).toString()
      );
      expect(after.curveTokens.toString()).to.equal(
        before.curveTokens.sub(quote.tokensOut).toString()
      );
    });

    it("rejects a buy below min_tokens_out", async () => {
      const { meme } = memePdas(mint);
      const state = await program.account.meme.fetch(meme);
      const skrIn = new BN(10).mul(ONE);
      const quote = quoteBuy(state.curveSkr, state.curveTokens, skrIn);

      const code = await expectError(() =>
        buy(mint, skrIn, quote.tokensOut.addn(1))
      );
      expect(code).to.equal("SlippageExceeded");
    });

    it("rejects a zero amount", async () => {
      const code = await expectError(() => buy(mint, new BN(0)));
      expect(code).to.equal("ZeroAmount");
    });

    it("rejects an amount too small to buy a token", async () => {
      const code = await expectError(() => buy(mint, new BN(1)));
      expect(code).to.equal("ZeroAmount");
    });

    it("fills the sell-out buy to the sale supply, refunds the rest and graduates", async () => {
      /*
       * 1,000 tokens at 0.001 SKR raise about 3.2 SKR, so a 100 SKR buy sells out.
       */
      const small = await createMeme(MIN_SUPPLY, startPrice);
      const { meme, tokenVault, skrVault } = memePdas(small);
      const launch = await program.account.meme.fetch(meme);
      const skrIn = new BN(100).mul(ONE);
      const buyerSkrBefore = await skrBalance(buyerSkr);
      const supplyBefore = await skrSupply();

      const buyerTokenAccount = await buy(small, skrIn);

      const state = await program.account.meme.fetch(meme);
      const paid = buyerSkrBefore.sub(await skrBalance(buyerSkr));
      const burned = supplyBefore.sub(await skrSupply());

      expect(state.phase).to.deep.equal({ graduated: {} });
      expect((await tokenBalance(buyerTokenAccount)).toString()).to.equal(
        launch.saleSupply.toString()
      );
      expect(state.tokensSold.toString()).to.equal(
        launch.saleSupply.toString()
      );
      expect((await tokenBalance(tokenVault)).toString()).to.equal(
        launch.poolSupply.toString()
      );

      /*
       * Only the SKR needed for the remaining tokens is charged, fees included.
       */
      expect(paid.lt(skrIn)).to.equal(true);
      expect(paid.toString()).to.equal(
        state.realSkr.add(state.creatorFees).add(burned).toString()
      );
      expect(state.creatorFees.toString()).to.equal(fee(paid, 200).toString());
      expect(burned.toString()).to.equal(fee(paid, 50).toString());

      /*
       * Launch raises about 3 * V0 and the pool opens with it plus Q tokens.
       */
      const threeV0 = launch.virtualSkr.muln(3);
      expect(state.realSkr.gte(threeV0)).to.equal(true);
      expect(state.realSkr.lte(threeV0.addn(1))).to.equal(true);
      expect(state.poolSkr.toString()).to.equal(state.realSkr.toString());
      expect(state.poolTokens.toString()).to.equal(
        launch.poolSupply.toString()
      );
      expect((await skrBalance(skrVault)).toString()).to.equal(
        state.poolSkr.add(state.creatorFees).toString()
      );
    });

    it("buys from the pool after graduation", async () => {
      const small = await createMeme(MIN_SUPPLY, startPrice);
      const { meme, skrVault } = memePdas(small);
      const buyerTokenAccount = await buy(small, new BN(100).mul(ONE));

      const before = await program.account.meme.fetch(meme);
      const tokensBefore = await tokenBalance(buyerTokenAccount);
      const skrIn = new BN(1).mul(ONE);
      const quote = quoteBuy(before.poolSkr, before.poolTokens, skrIn);

      await buy(small, skrIn, quote.tokensOut);

      const after = await program.account.meme.fetch(meme);
      expect(after.phase).to.deep.equal({ graduated: {} });
      expect(
        (await tokenBalance(buyerTokenAccount)).sub(tokensBefore).toString()
      ).to.equal(quote.tokensOut.toString());
      expect(after.poolSkr.toString()).to.equal(
        before.poolSkr.add(quote.net).toString()
      );
      expect(after.poolTokens.toString()).to.equal(
        before.poolTokens.sub(quote.tokensOut).toString()
      );
      expect(after.creatorFees.toString()).to.equal(
        before.creatorFees.add(quote.creatorFee).toString()
      );
      expect((await skrBalance(skrVault)).toString()).to.equal(
        after.poolSkr.add(after.creatorFees).toString()
      );
    });
  });
});
