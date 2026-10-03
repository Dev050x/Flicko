import { PublicKey } from "@solana/web3.js";

/*
 * The Config account decoded by hand (fixed layout, see state/config.rs), so apps can
 * read it without Anchor's coder, which needs runtime features some React Native
 * engines lack. Offsets: 8-byte discriminator, admin, skr_mint, creator_fee_bps u16,
 * burn_bps u16, creation_fee, min_supply, max_supply, min_start_price,
 * max_start_price (u64, little-endian), bump u8.
 */
export interface ConfigValuesDecoded {
  admin: PublicKey;
  skrMint: PublicKey;
  creatorFeeBps: number;
  burnBps: number;
  creationFee: bigint;
  minSupply: bigint;
  maxSupply: bigint;
  minStartPrice: bigint;
  maxStartPrice: bigint;
  bump: number;
}

export const CONFIG_ACCOUNT_SIZE = 117;

export const decodeConfigAccount = (data: Uint8Array): ConfigValuesDecoded => {
  if (data.length < CONFIG_ACCOUNT_SIZE) {
    throw new Error(`config account is ${data.length} bytes, expected ${CONFIG_ACCOUNT_SIZE}`);
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  // Two u32 halves rather than getBigUint64, which not every JS engine has.
  const u64 = (offset: number) =>
    (BigInt(view.getUint32(offset + 4, true)) << 32n) |
    BigInt(view.getUint32(offset, true));
  return {
    admin: new PublicKey(data.slice(8, 40)),
    skrMint: new PublicKey(data.slice(40, 72)),
    creatorFeeBps: view.getUint16(72, true),
    burnBps: view.getUint16(74, true),
    creationFee: u64(76),
    minSupply: u64(84),
    maxSupply: u64(92),
    minStartPrice: u64(100),
    maxStartPrice: u64(108),
    bump: view.getUint8(116),
  };
};
