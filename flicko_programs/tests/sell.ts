import { BN } from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import {
  buy,
  createMeme,
  env,
  expectError,
  memePdas,
  MIN_SUPPLY,
  ONE,
  program,
  quoteSell,
  sell,
  setup,
  skrBalance,
  skrSupply,
  tokenBalance,
  traderTokenAccount,
} from "./helpers";

describe("sell", () => {
  const startPrice = new BN(1_000);
  let mint: PublicKey;

  before(async () => {
    await setup();
    mint = await createMeme(new BN(1_000_000).mul(ONE), startPrice);
    await buy(mint, new BN(500).mul(ONE));
  });

  it("sells tokens back to the launch curve", async () => {
    const { meme, skrVault } = memePdas(mint);
    const before = await program.account.meme.fetch(meme);
    const held = await tokenBalance(traderTokenAccount(mint));
    const tokensIn = held.divn(2);
    const quote = quoteSell(before.curveSkr, before.curveTokens, tokensIn);
    const skrBefore = await skrBalance(env.traderSkr);
    const vaultBefore = await skrBalance(skrVault);
    const supplyBefore = await skrSupply();

    await sell(mint, tokensIn, quote.net);

    /*
     * Trader gets SKR out minus fees, the creator fee stays in the vault and the burn share is burned from it.
     */
    expect((await tokenBalance(traderTokenAccount(mint))).toString()).to.equal(
      held.sub(tokensIn).toString()
    );
    expect(
      (await skrBalance(env.traderSkr)).sub(skrBefore).toString()
    ).to.equal(quote.net.toString());
    expect(vaultBefore.sub(await skrBalance(skrVault)).toString()).to.equal(
      quote.net.add(quote.burn).toString()
    );
    expect(supplyBefore.sub(await skrSupply()).toString()).to.equal(
      quote.burn.toString()
    );

    const after = await program.account.meme.fetch(meme);
    expect(after.phase).to.deep.equal({ launch: {} });
    expect(after.tokensSold.toString()).to.equal(
      before.tokensSold.sub(tokensIn).toString()
    );
    expect(after.curveSkr.toString()).to.equal(quote.skrAfter.toString());
    expect(after.curveTokens.toString()).to.equal(
      before.curveTokens.add(tokensIn).toString()
    );
    expect(after.realSkr.toString()).to.equal(
      quote.skrAfter.sub(after.virtualSkr).toString()
    );
    expect(after.creatorFees.toString()).to.equal(
      before.creatorFees.add(quote.creatorFee).toString()
    );
    expect((await skrBalance(skrVault)).toString()).to.equal(
      after.realSkr.add(after.creatorFees).toString()
    );
  });

  it("never returns more SKR than a buy paid", async () => {
    const fresh = await createMeme(new BN(1_000_000).mul(ONE), startPrice);
    const skrIn = new BN(250).mul(ONE);
    const skrBefore = await skrBalance(env.traderSkr);

    await buy(fresh, skrIn);
    await sell(fresh, await tokenBalance(traderTokenAccount(fresh)));

    const skrAfter = await skrBalance(env.traderSkr);
    expect(skrAfter.lt(skrBefore)).to.equal(true);
    expect((await tokenBalance(traderTokenAccount(fresh))).toString()).to.equal(
      "0"
    );

    const state = await program.account.meme.fetch(memePdas(fresh).meme);
    expect(state.tokensSold.toString()).to.equal("0");
    expect(state.curveSkr.gte(state.virtualSkr)).to.equal(true);
  });

  it("rejects a sell below min_skr_out", async () => {
    const { meme } = memePdas(mint);
    const state = await program.account.meme.fetch(meme);
    const tokensIn = new BN(1_000).mul(ONE);
    const quote = quoteSell(state.curveSkr, state.curveTokens, tokensIn);

    const code = await expectError(() =>
      sell(mint, tokensIn, quote.net.addn(1))
    );
    expect(code).to.equal("SlippageExceeded");
  });

  it("rejects a zero amount", async () => {
    const code = await expectError(() => sell(mint, new BN(0)));
    expect(code).to.equal("ZeroAmount");
  });

  it("rejects an amount too small to pay out SKR", async () => {
    const code = await expectError(() => sell(mint, new BN(1)));
    expect(code).to.equal("ZeroAmount");
  });

  it("sells into the pool after graduation", async () => {
    const small = await createMeme(MIN_SUPPLY, startPrice);
    const { meme, skrVault } = memePdas(small);
    await buy(small, new BN(100).mul(ONE));

    const before = await program.account.meme.fetch(meme);
    const held = await tokenBalance(traderTokenAccount(small));
    const tokensIn = held.divn(4);
    const quote = quoteSell(before.poolSkr, before.poolTokens, tokensIn);
    const skrBefore = await skrBalance(env.traderSkr);

    await sell(small, tokensIn, quote.net);

    const after = await program.account.meme.fetch(meme);
    expect(after.phase).to.deep.equal({ graduated: {} });
    expect(
      (await skrBalance(env.traderSkr)).sub(skrBefore).toString()
    ).to.equal(quote.net.toString());
    expect(after.poolSkr.toString()).to.equal(quote.skrAfter.toString());
    expect(after.poolTokens.toString()).to.equal(
      before.poolTokens.add(tokensIn).toString()
    );
    expect(after.tokensSold.toString()).to.equal(before.tokensSold.toString());
    expect(after.creatorFees.toString()).to.equal(
      before.creatorFees.add(quote.creatorFee).toString()
    );
    expect((await skrBalance(skrVault)).toString()).to.equal(
      after.poolSkr.add(after.creatorFees).toString()
    );
  });
});
