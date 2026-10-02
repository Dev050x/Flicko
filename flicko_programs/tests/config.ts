import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { expect } from "chai";
import {
  admin,
  attestor,
  attestorPda,
  configArgs,
  configPda,
  connection,
  CREATION_FEE,
  env,
  expectError,
  MAX_SUPPLY,
  MIN_SUPPLY,
  program,
  programData,
  setup,
  trader,
} from "./helpers";

/*
 * Sends update_config signed by the given wallet (the admin by default).
 */
const updateConfig = (args: typeof configArgs, signer: Keypair = admin) =>
  program.methods
    .updateConfig(args)
    .accountsPartial({ admin: signer.publicKey, config: configPda })
    .signers(signer === admin ? [] : [signer])
    .rpc({ commitment: "confirmed" });

describe("initialize_config", () => {
  before(setup);

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
          skrMint: env.skrMint,
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
        skrMint: env.skrMint,
        config: configPda,
        programData,
      })
      .rpc({ commitment: "confirmed" });

    const config = await program.account.config.fetch(configPda);
    expect(config.admin.toBase58()).to.equal(admin.publicKey.toBase58());
    expect(config.skrMint.toBase58()).to.equal(env.skrMint.toBase58());
    expect(config.creatorFeeBps).to.equal(200);
    expect(config.burnBps).to.equal(50);
    expect(config.creationFee.toString()).to.equal(CREATION_FEE.toString());
    expect(config.minSupply.toString()).to.equal(MIN_SUPPLY.toString());
    expect(config.maxSupply.toString()).to.equal(MAX_SUPPLY.toString());
  });
});

describe("update_config", () => {
  before(setup);

  it("lets the admin change fees and ranges", async () => {
    const args = {
      ...configArgs,
      creatorFeeBps: 150,
      burnBps: 100,
      creationFee: CREATION_FEE.muln(2),
      maxSupply: MAX_SUPPLY.divn(2),
    };

    await updateConfig(args);

    const config = await program.account.config.fetch(configPda);
    expect(config.creatorFeeBps).to.equal(150);
    expect(config.burnBps).to.equal(100);
    expect(config.creationFee.toString()).to.equal(
      CREATION_FEE.muln(2).toString()
    );
    expect(config.maxSupply.toString()).to.equal(MAX_SUPPLY.divn(2).toString());

    /*
     * Admin and SKR mint cannot be changed by an update.
     */
    expect(config.admin.toBase58()).to.equal(admin.publicKey.toBase58());
    expect(config.skrMint.toBase58()).to.equal(env.skrMint.toBase58());

    /*
     * Restore the original values for the other test files.
     */
    await updateConfig(configArgs);
    const restored = await program.account.config.fetch(configPda);
    expect(restored.creatorFeeBps).to.equal(configArgs.creatorFeeBps);
    expect(restored.burnBps).to.equal(configArgs.burnBps);
  });

  it("rejects an update from someone other than the admin", async () => {
    const code = await expectError(() =>
      updateConfig({ ...configArgs, burnBps: 0 }, trader)
    );
    expect(code).to.equal("Unauthorized");
  });

  it("rejects fees that add up to 100% or more", async () => {
    const code = await expectError(() =>
      updateConfig({ ...configArgs, creatorFeeBps: 9_950, burnBps: 50 })
    );
    expect(code).to.equal("InvalidConfig");
  });

  it("rejects a min supply above the max supply", async () => {
    const code = await expectError(() =>
      updateConfig({ ...configArgs, minSupply: MAX_SUPPLY.addn(5) })
    );
    expect(code).to.equal("InvalidConfig");
  });

  it("rejects a zero min start price", async () => {
    const code = await expectError(() =>
      updateConfig({
        ...configArgs,
        minStartPrice: configArgs.minStartPrice.subn(1),
      })
    );
    expect(code).to.equal("InvalidConfig");
  });
});

describe("set_attestor", () => {
  before(setup);

  const setAttestor = (authority: Keypair["publicKey"], signer = admin) =>
    program.methods
      .setAttestor(authority)
      .accountsPartial({
        admin: signer.publicKey,
        config: configPda,
        attestor: attestorPda,
      })
      .signers(signer === admin ? [] : [signer])
      .rpc({ commitment: "confirmed" });

  it("rejects set_attestor from someone other than the admin", async () => {
    const code = await expectError(() => setAttestor(trader.publicKey, trader));
    expect(code).to.equal("Unauthorized");
  });

  it("lets the admin set and rotate the attestor", async () => {
    await setAttestor(Keypair.generate().publicKey);
    await setAttestor(attestor.publicKey);
    const account = await program.account.attestor.fetch(attestorPda);
    expect(account.authority.toBase58()).to.equal(
      attestor.publicKey.toBase58()
    );
  });
});
