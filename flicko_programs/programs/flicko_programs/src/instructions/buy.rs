use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::Token2022,
    token_interface::{
        burn, transfer_checked, Burn, Mint, TokenAccount, TokenInterface, TransferChecked,
    },
};

use crate::{
    error::ErrorCode,
    math::{curve_buy, pool_buy, to_u64, BuyQuote},
    Config, Meme, Phase, CONFIG_SEED, MEME_SEED, SKR_VAULT_SEED, TOKEN_VAULT_SEED,
};

#[derive(Accounts)]
pub struct Buy<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = skr_mint @ ErrorCode::InvalidMint
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        mint::token_program = skr_token_program
    )]
    pub skr_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mint::token_program = token_program
    )]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        seeds = [MEME_SEED, mint.key().as_ref()],
        bump = meme.bump,
        has_one = mint @ ErrorCode::InvalidMint
    )]
    pub meme: Box<Account<'info, Meme>>,

    #[account(
        mut,
        seeds = [TOKEN_VAULT_SEED, meme.key().as_ref()],
        bump
    )]
    pub token_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [SKR_VAULT_SEED, meme.key().as_ref()],
        bump
    )]
    pub skr_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = skr_mint,
        token::authority = buyer,
        token::token_program = skr_token_program
    )]
    pub buyer_skr_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = mint,
        associated_token::authority = buyer,
        associated_token::token_program = token_program
    )]
    pub buyer_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Program<'info, Token2022>,
    pub skr_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl<'info> Buy<'info> {
    pub fn quote(&self, skr_in: u64, min_tokens_out: u64) -> Result<BuyQuote> {
        require!(skr_in > 0, ErrorCode::ZeroAmount);

        let meme = &self.meme;
        let quote = match meme.phase {
            Phase::Launch => curve_buy(
                meme.curve_skr,
                meme.curve_tokens,
                meme.sale_supply
                    .checked_sub(meme.tokens_sold)
                    .ok_or(ErrorCode::MathOverflow)?,
                skr_in,
                self.config.creator_fee_bps,
                self.config.burn_bps,
            )?,
            Phase::Graduated => pool_buy(
                meme.pool_skr,
                meme.pool_tokens,
                skr_in,
                self.config.creator_fee_bps,
                self.config.burn_bps,
            )?,
        };

        require!(
            quote.tokens_out >= min_tokens_out,
            ErrorCode::SlippageExceeded
        );
        Ok(quote)
    }

    pub fn deposit_skr(&self, quote: &BuyQuote) -> Result<()> {
        let amount = quote
            .fees
            .net
            .checked_add(quote.fees.creator)
            .ok_or(ErrorCode::MathOverflow)?;

        let cpi_ctx = CpiContext::new(
            self.skr_token_program.key(),
            TransferChecked {
                from: self.buyer_skr_account.to_account_info(),
                mint: self.skr_mint.to_account_info(),
                to: self.skr_vault.to_account_info(),
                authority: self.buyer.to_account_info(),
            },
        );

        transfer_checked(cpi_ctx, amount, self.skr_mint.decimals)
    }

    pub fn burn_fee(&self, quote: &BuyQuote) -> Result<()> {
        if quote.fees.burn == 0 {
            return Ok(());
        }

        let cpi_ctx = CpiContext::new(
            self.skr_token_program.key(),
            Burn {
                mint: self.skr_mint.to_account_info(),
                from: self.buyer_skr_account.to_account_info(),
                authority: self.buyer.to_account_info(),
            },
        );

        burn(cpi_ctx, quote.fees.burn)
    }

    pub fn send_tokens(&self, quote: &BuyQuote) -> Result<()> {
        let mint_key = self.mint.key();
        let signer_seeds: &[&[&[u8]]] = &[&[MEME_SEED, mint_key.as_ref(), &[self.meme.bump]]];

        let cpi_ctx = CpiContext::new_with_signer(
            self.token_program.key(),
            TransferChecked {
                from: self.token_vault.to_account_info(),
                mint: self.mint.to_account_info(),
                to: self.buyer_token_account.to_account_info(),
                authority: self.meme.to_account_info(),
            },
            signer_seeds,
        );

        transfer_checked(cpi_ctx, quote.tokens_out, self.mint.decimals)
    }

    pub fn record_trade(&mut self, quote: &BuyQuote) -> Result<()> {
        let meme = &mut self.meme;
        meme.creator_fees = meme
            .creator_fees
            .checked_add(quote.fees.creator)
            .ok_or(ErrorCode::MathOverflow)?;

        match meme.phase {
            Phase::Launch => {
                meme.curve_skr = quote.skr_reserve;
                meme.curve_tokens = quote.token_reserve;
                meme.tokens_sold = meme
                    .tokens_sold
                    .checked_add(quote.tokens_out)
                    .ok_or(ErrorCode::MathOverflow)?;
                meme.real_skr = to_u64(
                    quote
                        .skr_reserve
                        .checked_sub(meme.virtual_skr)
                        .ok_or(ErrorCode::MathOverflow)?,
                )?;

                if quote.graduates {
                    meme.phase = Phase::Graduated;
                    meme.pool_skr = meme.real_skr;
                    meme.pool_tokens = meme.pool_supply;
                }
            }
            Phase::Graduated => {
                meme.pool_skr = to_u64(quote.skr_reserve)?;
                meme.pool_tokens = to_u64(quote.token_reserve)?;
            }
        }

        Ok(())
    }
}
