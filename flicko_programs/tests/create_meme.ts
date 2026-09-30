import { BN } from "@anchor-lang/core";
import {
  getAccount,
  getMetadataPointerState,
  getMint,
  getTokenMetadata,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { createHash } from "crypto";
import { expect } from "chai";
import {
  connection,
  createMeme,
  CREATION_FEE,
  creator,
  env,
  expectError,
  MAX_START_PRICE,
  memePdas,
  MIN_SUPPLY,
  ONE,
  program,
  setup,
} from "./helpers";

describe("create_meme", () => {
  before(setup);

  it("creates a meme", async () => {
    /*
     * 1,000,000 tokens at 0.001 SKR each (1,000 SKR base units per whole token).
     */
    const supply = new BN(1_000_000).mul(ONE);
    const startPrice = new BN(1_000);
    const imageHash = createHash("sha256").update("gm-ser.jpg").digest();
    const skrBefore = (await getAccount(connection, env.creatorSkr)).amount;

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

    const skrVaultInfo = await getAccount(connection, skrVault, "confirmed");
    expect(skrVaultInfo.amount.toString()).to.equal("0");
    expect(skrVaultInfo.owner.toBase58()).to.equal(meme.toBase58());

    /*
     * Creation fee is burned from the creator.
     */
    const skrAfter = (await getAccount(connection, env.creatorSkr, "confirmed"))
      .amount;
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
