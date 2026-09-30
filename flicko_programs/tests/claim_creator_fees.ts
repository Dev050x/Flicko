import { BN } from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import {
  buy,
  claimCreatorFees,
  createMeme,
  env,
  expectError,
  memePdas,
  MIN_SUPPLY,
  ONE,
  program,
  sell,
  setup,
  skrBalance,
  tokenBalance,
  trader,
  traderTokenAccount,
} from "./helpers";

describe("claim_creator_fees", () => {
  let mint: PublicKey;

  before(async () => {
    await setup();
    mint = await createMeme(new BN(1_000_000).mul(ONE), new BN(1_000));
    await buy(mint, new BN(300).mul(ONE));
    await sell(mint, (await tokenBalance(traderTokenAccount(mint))).divn(3));
  });

  it("rejects a claim from someone other than the creator", async () => {
    const code = await expectError(() =>
      claimCreatorFees(mint, trader, env.traderSkr)
    );
    expect(code).to.equal("Unauthorized");
  });

  it("pays the creator all accrued fees and resets the counter", async () => {
    const { meme, skrVault } = memePdas(mint);
    const before = await program.account.meme.fetch(meme);
    const creatorBefore = await skrBalance(env.creatorSkr);
    expect(before.creatorFees.gtn(0)).to.equal(true);

    await claimCreatorFees(mint);

    const after = await program.account.meme.fetch(meme);
    expect(after.creatorFees.toString()).to.equal("0");
    expect(
      (await skrBalance(env.creatorSkr)).sub(creatorBefore).toString()
    ).to.equal(before.creatorFees.toString());

    /*
     * Only the fees leave the vault; the curve reserve is untouched.
     */
    expect((await skrBalance(skrVault)).toString()).to.equal(
      after.realSkr.toString()
    );
    expect(after.realSkr.toString()).to.equal(before.realSkr.toString());
  });

  it("rejects a claim when nothing has accrued", async () => {
    const code = await expectError(() => claimCreatorFees(mint));
    expect(code).to.equal("NothingToClaim");
  });

  it("keeps the pool intact when claiming after graduation", async () => {
    const small = await createMeme(MIN_SUPPLY, new BN(1_000));
    const { meme, skrVault } = memePdas(small);
    await buy(small, new BN(100).mul(ONE));
    await buy(small, ONE);

    const before = await program.account.meme.fetch(meme);
    expect(before.phase).to.deep.equal({ graduated: {} });

    await claimCreatorFees(small);

    const after = await program.account.meme.fetch(meme);
    expect(after.creatorFees.toString()).to.equal("0");
    expect(after.poolSkr.toString()).to.equal(before.poolSkr.toString());
    expect((await skrBalance(skrVault)).toString()).to.equal(
      after.poolSkr.toString()
    );

    /*
     * The pool keeps trading after the claim.
     */
    await buy(small, ONE);
    expect(
      (await program.account.meme.fetch(meme)).creatorFees.gtn(0)
    ).to.equal(true);
  });
});
