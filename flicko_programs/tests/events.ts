import { BN } from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import { createHash } from "crypto";
import { expect } from "chai";
import {
  buy,
  claimCreatorFees,
  createMemeTx,
  creator,
  eventsOf,
  fee,
  memePdas,
  MIN_SUPPLY,
  ONE,
  program,
  quoteBuy,
  quoteSell,
  sell,
  setup,
  splitFees,
  tokenBalance,
  trader,
  traderTokenAccount,
} from "./helpers";

describe("events", () => {
  const startPrice = new BN(1_000);
  let mint: PublicKey;
  let meme: PublicKey;

  before(async () => {
    await setup();
  });

  it("emits MemeCreated", async () => {
    const created = await createMemeTx(MIN_SUPPLY, startPrice);
    mint = created.mint;
    meme = memePdas(mint).meme;

    const events = await eventsOf(created.signature);
    expect(events.map((e) => e.name)).to.deep.equal(["memeCreated"]);

    const data = events[0].data;
    const state = await program.account.meme.fetch(meme);
    expect(data.meme.toBase58()).to.equal(meme.toBase58());
    expect(data.mint.toBase58()).to.equal(mint.toBase58());
    expect(data.creator.toBase58()).to.equal(creator.publicKey.toBase58());
    expect(data.name).to.equal("Gm Ser");
    expect(data.symbol).to.equal("GMSER");
    expect(data.uri).to.equal("https://r2.flicko.app/memes/gm-ser.json");
    expect(
      Buffer.from(data.imageHash).equals(
        createHash("sha256").update("gm-ser.jpg").digest()
      )
    ).to.equal(true);
    expect(data.totalSupply.toString()).to.equal(MIN_SUPPLY.toString());
    expect(data.startPrice.toString()).to.equal(startPrice.toString());
    expect(data.createdAt.toString()).to.equal(state.createdAt.toString());
  });

  it("emits Trade for a buy on the curve", async () => {
    const before = await program.account.meme.fetch(meme);
    const skrIn = ONE;
    const quote = quoteBuy(before.curveSkr, before.curveTokens, skrIn);

    const events = await eventsOf(await buy(mint, skrIn));
    expect(events.map((e) => e.name)).to.deep.equal(["trade"]);

    const data = events[0].data;
    const after = await program.account.meme.fetch(meme);
    expect(data.meme.toBase58()).to.equal(meme.toBase58());
    expect(data.trader.toBase58()).to.equal(trader.publicKey.toBase58());
    expect(data.isBuy).to.equal(true);
    expect(data.skrAmount.toString()).to.equal(skrIn.toString());
    expect(data.tokenAmount.toString()).to.equal(quote.tokensOut.toString());
    expect(data.creatorFee.toString()).to.equal(quote.creatorFee.toString());
    expect(data.burned.toString()).to.equal(quote.burn.toString());
    expect(data.priceAfter.toString()).to.equal(
      after.curveSkr.mul(ONE).div(after.curveTokens).toString()
    );
    expect(data.phase).to.deep.equal({ launch: {} });
  });

  it("emits Trade for a sell with the SKR received", async () => {
    const before = await program.account.meme.fetch(meme);
    const tokensIn = (await tokenBalance(traderTokenAccount(mint))).divn(2);
    const quote = quoteSell(before.curveSkr, before.curveTokens, tokensIn);

    const events = await eventsOf(await sell(mint, tokensIn));
    expect(events.map((e) => e.name)).to.deep.equal(["trade"]);

    const data = events[0].data;
    expect(data.isBuy).to.equal(false);
    expect(data.skrAmount.toString()).to.equal(quote.net.toString());
    expect(data.tokenAmount.toString()).to.equal(tokensIn.toString());
    expect(data.creatorFee.toString()).to.equal(quote.creatorFee.toString());
    expect(data.burned.toString()).to.equal(quote.burn.toString());
    expect(data.priceAfter.toString()).to.equal(
      quote.skrAfter.mul(ONE).div(before.curveTokens.add(tokensIn)).toString()
    );
  });

  it("emits Trade and Graduated for the sell-out buy", async () => {
    const skrIn = new BN(100).mul(ONE);
    const events = await eventsOf(await buy(mint, skrIn));
    expect(events.map((e) => e.name)).to.deep.equal(["trade", "graduated"]);

    const state = await program.account.meme.fetch(meme);
    const [trade, graduated] = events.map((e) => e.data);

    /*
     * The trade reports only the SKR actually charged, not the full skr_in.
     */
    expect(trade.skrAmount.lt(skrIn)).to.equal(true);
    expect(trade.creatorFee.toString()).to.equal(
      fee(trade.skrAmount, 200).toString()
    );
    expect(trade.burned.toString()).to.equal(
      fee(trade.skrAmount, 50).toString()
    );
    expect(trade.phase).to.deep.equal({ graduated: {} });
    expect(trade.priceAfter.toString()).to.equal(
      state.poolSkr.mul(ONE).div(state.poolTokens).toString()
    );

    expect(graduated.meme.toBase58()).to.equal(meme.toBase58());
    expect(graduated.poolSkr.toString()).to.equal(state.poolSkr.toString());
    expect(graduated.poolTokens.toString()).to.equal(
      state.poolTokens.toString()
    );
    expect(graduated.graduatedAt.toNumber()).to.be.greaterThan(0);
  });

  it("emits Trade in the pool phase", async () => {
    const skrIn = ONE;
    const events = await eventsOf(await buy(mint, skrIn));
    const data = events[0].data;
    const state = await program.account.meme.fetch(meme);

    expect(events.map((e) => e.name)).to.deep.equal(["trade"]);
    expect(data.skrAmount.toString()).to.equal(skrIn.toString());
    expect(data.creatorFee.toString()).to.equal(
      splitFees(skrIn).creatorFee.toString()
    );
    expect(data.phase).to.deep.equal({ graduated: {} });
    expect(data.priceAfter.toString()).to.equal(
      state.poolSkr.mul(ONE).div(state.poolTokens).toString()
    );
  });

  it("emits CreatorFeesClaimed", async () => {
    const accrued = (await program.account.meme.fetch(meme)).creatorFees;

    const events = await eventsOf(await claimCreatorFees(mint));
    expect(events.map((e) => e.name)).to.deep.equal(["creatorFeesClaimed"]);

    const data = events[0].data;
    expect(data.meme.toBase58()).to.equal(meme.toBase58());
    expect(data.creator.toBase58()).to.equal(creator.publicKey.toBase58());
    expect(data.amount.toString()).to.equal(accrued.toString());
  });
});
