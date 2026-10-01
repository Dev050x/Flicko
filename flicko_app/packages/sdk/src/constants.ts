import { PublicKey } from "@solana/web3.js";
import { IDL } from "./idl";

export const PROGRAM_ID = new PublicKey(IDL.address);

export const CONFIG_SEED = "config";
export const MEME_SEED = "meme";
export const SKR_VAULT_SEED = "skr_vault";
export const TOKEN_VAULT_SEED = "token_vault";

export const MEME_DECIMALS = 6;
export const PRICE_SCALE = 1_000_000n;
export const BPS_DENOMINATOR = 10_000n;

export const MAX_NAME_LEN = 32;
export const MAX_SYMBOL_LEN = 10;
export const MAX_URI_LEN = 200;
