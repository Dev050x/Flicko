use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum Phase {
    Launch,
    Graduated,
}

#[account]
#[derive(InitSpace)]
pub struct Meme {
    pub creator: Pubkey,
    pub mint: Pubkey,
    pub parent: Option<Pubkey>,
    pub image_hash: [u8; 32],
    pub phase: Phase,
    pub total_supply: u64,
    pub sale_supply: u64,
    pub pool_supply: u64,
    pub virtual_skr: u128,
    pub curve_skr: u128,
    pub curve_tokens: u128,
    pub tokens_sold: u64,
    pub real_skr: u64,
    pub pool_skr: u64,
    pub pool_tokens: u64,
    pub creator_fees: u64,
    pub created_at: i64,
    pub bump: u8,
}
