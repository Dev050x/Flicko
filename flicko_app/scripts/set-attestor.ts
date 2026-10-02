import { attestorPda, setAttestorInstruction } from "@flicko/sdk";
import {
  attestorKeypairPath,
  loadAttestor,
  payer,
  program,
  programId,
  readNetworkConfig,
  send,
  txUrl,
  writeNetworkConfig,
} from "./lib/network";

const attestor = loadAttestor({ create: true });
const authority = attestor.publicKey;
const current = await program.account.attestor
  .fetchNullable(attestorPda(programId))
  .catch(() => null);

if (current?.authority.equals(authority)) {
  console.log(`attestor already set to ${authority.toBase58()}`);
} else {
  const signature = await send([
    await setAttestorInstruction(program, {
      admin: payer.publicKey,
      authority,
    }),
  ]);
  console.log(`attestor set to ${authority.toBase58()}`);
  console.log(txUrl(signature));
}

writeNetworkConfig({ ...readNetworkConfig(), attestor: authority.toBase58() });
console.log(
  `server: put the keypair at ${attestorKeypairPath} into ATTESTOR_SECRET_KEY`,
);
