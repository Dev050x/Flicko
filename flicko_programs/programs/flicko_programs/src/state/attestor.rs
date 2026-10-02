use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Attestor {
    pub authority: Pubkey,
    pub bump: u8,
}
