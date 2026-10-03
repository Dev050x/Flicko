import { PublicKey } from "@solana/web3.js";

import type { MemeState } from "../quote/quote";

/*
 * The Meme account decoded by hand (see state/meme.rs), for apps whose JS engine can't
 * run Anchor's coder. Borsh layout after the 8-byte discriminator: creator, mint,
 * parent Option<Pubkey> (1-byte tag, then 32 bytes only when Some, so later offsets
 * move), image_hash [u8; 32], phase u8, total/sale/pool supply u64, virtual_skr,
 * curve_skr, curve_tokens u128, tokens_sold, real_skr, pool_skr, pool_tokens,
 * creator_fees u64, created_at i64, bump u8. Integers are little-endian.
 */
export interface MemeAccountDecoded extends MemeState {
  creator: PublicKey;
  mint: PublicKey;
  parent: PublicKey | null;
  imageHash: Uint8Array;
  /** unix seconds */
  createdAt: bigint;
  bump: number;
}

export const decodeMemeAccount = (data: Uint8Array): MemeAccountDecoded => {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let o = 8;
  const need = (n: number) => {
    if (o + n > data.length) {
      throw new Error(`meme account is ${data.length} bytes, too short at offset ${o}`);
    }
  };
  const key = () => {
    need(32);
    const k = new PublicKey(data.slice(o, o + 32));
    o += 32;
    return k;
  };
  // Two u32 halves rather than getBigUint64, which not every JS engine has.
  const u64 = () => {
    need(8);
    const v = (BigInt(view.getUint32(o + 4, true)) << 32n) | BigInt(view.getUint32(o, true));
    o += 8;
    return v;
  };
  const u128 = () => {
    const lo = u64();
    const hi = u64();
    return (hi << 64n) | lo;
  };
  const u8 = () => {
    need(1);
    return view.getUint8(o++);
  };

  const creator = key();
  const mint = key();
  const parent = u8() === 1 ? key() : null;
  need(32);
  const imageHash = data.slice(o, o + 32);
  o += 32;
  const phase = u8() === 1 ? "graduated" : "launch";
  const totalSupply = u64();
  const saleSupply = u64();
  const poolSupply = u64();
  const virtualSkr = u128();
  const curveSkr = u128();
  const curveTokens = u128();
  const tokensSold = u64();
  const realSkr = u64();
  const poolSkr = u64();
  const poolTokens = u64();
  const creatorFees = u64();
  const createdRaw = u64();
  const createdAt = createdRaw >= 1n << 63n ? createdRaw - (1n << 64n) : createdRaw;
  const bump = u8();
  return {
    creator,
    mint,
    parent,
    imageHash,
    phase,
    totalSupply,
    saleSupply,
    poolSupply,
    virtualSkr,
    curveSkr,
    curveTokens,
    tokensSold,
    realSkr,
    poolSkr,
    poolTokens,
    creatorFees,
    createdAt,
    bump,
  };
};
