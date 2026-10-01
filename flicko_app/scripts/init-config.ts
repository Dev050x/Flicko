import {
  configPda,
  initializeConfigInstruction,
  updateConfigInstruction,
  type ConfigValues,
} from "@flicko/sdk";
import {
  payer,
  program,
  programId,
  readNetworkConfig,
  requireSkrMint,
  send,
  txUrl,
} from "./lib/network";

const ONE = 1_000_000n;

const values: ConfigValues = {
  creatorFeeBps: 200,
  burnBps: 50,
  creationFee: 0n,
  minSupply: 1_000n * ONE,
  maxSupply: 1_000_000_000n * ONE,
  minStartPrice: 1n,
  maxStartPrice: 1_000_000_000n,
};

const show = (label: string, config: Record<string, unknown>) =>
  console.log(
    label,
    Object.fromEntries(
      Object.entries(config).map(([key, value]) => [key, String(value)]),
    ),
  );

const skrMint = requireSkrMint(readNetworkConfig());
const existing = await program.account.config.fetchNullable(
  configPda(programId),
);

if (!existing) {
  const signature = await send([
    await initializeConfigInstruction(program, {
      admin: payer.publicKey,
      skrMint,
      config: values,
    }),
  ]);
  console.log(`initialized config ${configPda(programId).toBase58()}`);
  console.log(txUrl(signature));
} else if (process.argv.includes("--update")) {
  const signature = await send([
    await updateConfigInstruction(program, {
      admin: payer.publicKey,
      config: values,
    }),
  ]);
  console.log("updated config");
  console.log(txUrl(signature));
} else {
  console.log("config already initialized, pass --update to apply new values");
}

show("on-chain config:", {
  ...(await program.account.config.fetch(configPda(programId))),
});
