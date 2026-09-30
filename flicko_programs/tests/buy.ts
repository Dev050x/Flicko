import { BN } from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import {
  buy,
  createMeme,
  env,
  expectError,
  fee,
  memePdas,
  MIN_SUPPLY,
  ONE,
  program,
  quoteBuy,
  setup,
  skrBalance,
  skrSupply,
  tokenBalance,
  traderTokenAccount,
} from "./helpers";

describe("buy", () => {
  const startPrice = new BN(1_000);
  let mint: PublicKey;

  before(async () => {
    await setup();
    mint = await createMeme(new BN(1_000_000).mul(ONE), startPrice);
  });

  it("buys tokens on the launch curve", async () => {
    const { meme, skrVault } = memePdas(mint);
    const before = await program.account.meme.fetch(meme);
    const skrIn = new BN(100).mul(ONE);
    const quote = quoteBuy(before.curveSkr, before.curveTokens, skrIn);
    const skrBefore = await skrBalance(env.traderSkr);
    const supplyBefore = await skrSupply();

    await buy(mint, skrIn, quote.tokensOut);

    /*
     * Trader pays skr_in: net + creator fee go to the vault, the burn share is burned.
     */
    expect((await tokenBalance(traderTokenAccount(mint))).toString()).to.equal(
      quote.tokensOut.toString()
    );
    expect(skrBefore.sub(await skrBalance(env.traderSkr)).toString()).to.equal(
      skrIn.toString()
    );
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
    expect(after.creatorFees.toString()).to.equal(quote.creatorFee.toString());
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
    const skrBefore = await skrBalance(env.traderSkr);
    const supplyBefore = await skrSupply();

    await buy(small, skrIn);

    const state = await program.account.meme.fetch(meme);
    const paid = skrBefore.sub(await skrBalance(env.traderSkr));
    const burned = supplyBefore.sub(await skrSupply());

    expect(state.phase).to.deep.equal({ graduated: {} });
    expect((await tokenBalance(traderTokenAccount(small))).toString()).to.equal(
      launch.saleSupply.toString()
    );
    expect(state.tokensSold.toString()).to.equal(launch.saleSupply.toString());
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
    expect(state.poolTokens.toString()).to.equal(launch.poolSupply.toString());
    expect((await skrBalance(skrVault)).toString()).to.equal(
      state.poolSkr.add(state.creatorFees).toString()
    );
  });

  it("buys from the pool after graduation", async () => {
    const small = await createMeme(MIN_SUPPLY, startPrice);
    const { meme, skrVault } = memePdas(small);
    await buy(small, new BN(100).mul(ONE));

    const before = await program.account.meme.fetch(meme);
    const tokensBefore = await tokenBalance(traderTokenAccount(small));
    const skrIn = new BN(1).mul(ONE);
    const quote = quoteBuy(before.poolSkr, before.poolTokens, skrIn);

    await buy(small, skrIn, quote.tokensOut);

    const after = await program.account.meme.fetch(meme);
    expect(after.phase).to.deep.equal({ graduated: {} });
    expect(
      (await tokenBalance(traderTokenAccount(small)))
        .sub(tokensBefore)
        .toString()
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
