use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub skr_mint: Pubkey,
    pub creator_fee_bps: u16,
    pub burn_bps: u16,
    pub creation_fee: u64,
    pub min_supply: u64,
    pub max_supply: u64,
    pub min_start_price: u64,
    pub max_start_price: u64,
    pub bump: u8,
}
