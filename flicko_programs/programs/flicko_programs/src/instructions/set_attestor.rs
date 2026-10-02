use anchor_lang::prelude::*;

use crate::{error::ErrorCode, Attestor, Config, ATTESTOR_SEED, CONFIG_SEED};

#[derive(Accounts)]
pub struct SetAttestor<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ ErrorCode::Unauthorized
    )]
    pub config: Account<'info, Config>,

    #[account(
        init_if_needed,
        payer = admin,
        seeds = [ATTESTOR_SEED],
        bump,
        space = 8 + Attestor::INIT_SPACE
    )]
    pub attestor: Account<'info, Attestor>,

    pub system_program: Program<'info, System>,
}

impl<'info> SetAttestor<'info> {
    pub fn set_attestor(&mut self, authority: Pubkey, bumps: &SetAttestorBumps) -> Result<()> {
        self.attestor.set_inner(Attestor {
            authority,
            bump: bumps.attestor,
        });
        Ok(())
    }
}
