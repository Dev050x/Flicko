use anchor_lang::prelude::*;

use crate::{error::ErrorCode, math::to_u64, PRICE_SCALE};

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

impl Meme {
    pub fn price(&self) -> Result<u64> {
        let (skr, tokens) = match self.phase {
            Phase::Launch => (self.curve_skr, self.curve_tokens),
            Phase::Graduated => (self.pool_skr as u128, self.pool_tokens as u128),
        };
        to_u64(
            skr.checked_mul(PRICE_SCALE)
                .and_then(|v| v.checked_div(tokens))
                .ok_or(ErrorCode::MathOverflow)?,
        )
    }
}
