use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::{
    error::ErrorCode, events::CreatorFeesClaimed, Config, Meme, CONFIG_SEED, MEME_SEED,
    SKR_VAULT_SEED,
};

#[derive(Accounts)]
pub struct ClaimCreatorFees<'info> {
    pub creator: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = skr_mint @ ErrorCode::InvalidMint
    )]
    pub config: Account<'info, Config>,

    #[account(
        mint::token_program = skr_token_program
    )]
    pub skr_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        seeds = [MEME_SEED, meme.mint.as_ref()],
        bump = meme.bump,
        has_one = creator @ ErrorCode::Unauthorized
    )]
    pub meme: Box<Account<'info, Meme>>,

    #[account(
        mut,
        seeds = [SKR_VAULT_SEED, meme.key().as_ref()],
        bump
    )]
    pub skr_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = skr_mint,
        token::authority = creator,
        token::token_program = skr_token_program
    )]
    pub creator_skr_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub skr_token_program: Interface<'info, TokenInterface>,
}

impl<'info> ClaimCreatorFees<'info> {
    pub fn validate(&self) -> Result<()> {
        require!(self.meme.creator_fees > 0, ErrorCode::NothingToClaim);
        Ok(())
    }

    pub fn pay_creator(&self) -> Result<()> {
        let mint_key = self.meme.mint;
        let signer_seeds: &[&[&[u8]]] = &[&[MEME_SEED, mint_key.as_ref(), &[self.meme.bump]]];

        let cpi_ctx = CpiContext::new_with_signer(
            self.skr_token_program.key(),
            TransferChecked {
                from: self.skr_vault.to_account_info(),
                mint: self.skr_mint.to_account_info(),
                to: self.creator_skr_account.to_account_info(),
                authority: self.meme.to_account_info(),
            },
            signer_seeds,
        );

        transfer_checked(cpi_ctx, self.meme.creator_fees, self.skr_mint.decimals)
    }

    pub fn emit_claimed(&self) -> Result<()> {
        emit!(CreatorFeesClaimed {
            meme: self.meme.key(),
            creator: self.creator.key(),
            amount: self.meme.creator_fees,
        });
        Ok(())
    }

    pub fn reset_fees(&mut self) -> Result<()> {
        self.meme.creator_fees = 0;
        Ok(())
    }
}
