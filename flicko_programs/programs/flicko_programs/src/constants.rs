use anchor_lang::prelude::*;

#[constant]
pub const CONFIG_SEED: &[u8] = b"config";

#[constant]
pub const MEME_SEED: &[u8] = b"meme";

#[constant]
pub const SKR_VAULT_SEED: &[u8] = b"skr_vault";

#[constant]
pub const TOKEN_VAULT_SEED: &[u8] = b"token_vault";

#[constant]
pub const MEME_DECIMALS: u8 = 6;

pub const PRICE_SCALE: u128 = 1_000_000;

pub const BPS_DENOMINATOR: u16 = 10_000;

pub const MAX_NAME_LEN: usize = 32;

pub const MAX_SYMBOL_LEN: usize = 10;

pub const MAX_URI_LEN: usize = 200;
