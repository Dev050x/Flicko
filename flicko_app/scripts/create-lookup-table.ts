import { createMemeLookupAddresses } from "@flicko/sdk";
import { AddressLookupTableProgram, PublicKey } from "@solana/web3.js";
import {
  connection,
  payer,
  programId,
  readNetworkConfig,
  requireSkrMint,
  send,
  txUrl,
  writeNetworkConfig,
} from "./lib/network";

/*
 * The address lookup table the app's create_meme transactions use (see
 * createMemeLookupAddresses). Idempotent: an existing table from the network config is
 * extended with anything missing.
 */
const config = readNetworkConfig();
const wanted = createMemeLookupAddresses(requireSkrMint(config), programId);

let table = config.lookupTable ? new PublicKey(config.lookupTable) : null;
const existing = table
  ? (await connection.getAddressLookupTable(table)).value
  : null;

if (!table || !existing) {
  const slot = await connection.getSlot("finalized");
  const [create, address] = AddressLookupTableProgram.createLookupTable({
    authority: payer.publicKey,
    payer: payer.publicKey,
    recentSlot: slot,
  });
  console.log(txUrl(await send([create])));
  table = address;
  console.log(`created lookup table ${table.toBase58()}`);
}

const have = new Set(existing?.state.addresses.map((a) => a.toBase58()) ?? []);
const missing = wanted.filter((a) => !have.has(a.toBase58()));
if (missing.length) {
  console.log(
    txUrl(
      await send([
        AddressLookupTableProgram.extendLookupTable({
          lookupTable: table,
          authority: payer.publicKey,
          payer: payer.publicKey,
          addresses: missing,
        }),
      ]),
    ),
  );
  console.log(`added ${missing.length} addresses`);
} else {
  console.log("lookup table already has every address");
}

writeNetworkConfig({ ...readNetworkConfig(), lookupTable: table.toBase58() });
