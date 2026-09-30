import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { expect } from "chai";
import {
  admin,
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
} from "./helpers";

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
