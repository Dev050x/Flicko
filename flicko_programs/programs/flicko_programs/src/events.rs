use anchor_lang::prelude::*;

use crate::Phase;

#[event]
pub struct MemeCreated {
    pub meme: Pubkey,
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub image_hash: [u8; 32],
    pub total_supply: u64,
    pub start_price: u64,
    pub created_at: i64,
}

#[event]
pub struct Trade {
    pub meme: Pubkey,
    pub trader: Pubkey,
    pub is_buy: bool,
    pub skr_amount: u64,
    pub token_amount: u64,
    pub creator_fee: u64,
    pub burned: u64,
    pub price_after: u64,
    pub phase: Phase,
}

#[event]
pub struct Graduated {
    pub meme: Pubkey,
    pub pool_skr: u64,
    pub pool_tokens: u64,
    pub graduated_at: i64,
}

#[event]
pub struct CreatorFeesClaimed {
    pub meme: Pubkey,
    pub creator: Pubkey,
    pub amount: u64,
}
