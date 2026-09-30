use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::Token2022,
    token_interface::{
        burn, transfer_checked, Burn, Mint, TokenAccount, TokenInterface, TransferChecked,
    },
};

use crate::{
    error::ErrorCode,
    events::Trade,
    math::{curve_sell, pool_sell, to_u64, SellQuote},
    Config, Meme, Phase, CONFIG_SEED, MEME_SEED, SKR_VAULT_SEED, TOKEN_VAULT_SEED,
};

#[derive(Accounts)]
pub struct Sell<'info> {
    pub seller: Signer<'info>,

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
        token::authority = seller,
        token::token_program = skr_token_program
    )]
    pub seller_skr_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = seller,
        token::token_program = token_program
    )]
    pub seller_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Program<'info, Token2022>,
    pub skr_token_program: Interface<'info, TokenInterface>,
}

impl<'info> Sell<'info> {
    pub fn quote(&self, tokens_in: u64, min_skr_out: u64) -> Result<SellQuote> {
        let meme = &self.meme;
        let quote = match meme.phase {
            Phase::Launch => curve_sell(
                meme.curve_skr,
                meme.curve_tokens,
                meme.tokens_sold,
                tokens_in,
                self.config.creator_fee_bps,
                self.config.burn_bps,
            )?,
            Phase::Graduated => pool_sell(
                meme.pool_skr,
                meme.pool_tokens,
                tokens_in,
                self.config.creator_fee_bps,
                self.config.burn_bps,
            )?,
        };

        require!(quote.fees.net >= min_skr_out, ErrorCode::SlippageExceeded);
        Ok(quote)
    }

    pub fn receive_tokens(&self, tokens_in: u64) -> Result<()> {
        let cpi_ctx = CpiContext::new(
            self.token_program.key(),
            TransferChecked {
                from: self.seller_token_account.to_account_info(),
                mint: self.mint.to_account_info(),
                to: self.token_vault.to_account_info(),
                authority: self.seller.to_account_info(),
            },
        );

        transfer_checked(cpi_ctx, tokens_in, self.mint.decimals)
    }

    pub fn pay_skr(&self, quote: &SellQuote) -> Result<()> {
        let mint_key = self.mint.key();
        let signer_seeds: &[&[&[u8]]] = &[&[MEME_SEED, mint_key.as_ref(), &[self.meme.bump]]];

        let cpi_ctx = CpiContext::new_with_signer(
            self.skr_token_program.key(),
            TransferChecked {
                from: self.skr_vault.to_account_info(),
                mint: self.skr_mint.to_account_info(),
                to: self.seller_skr_account.to_account_info(),
                authority: self.meme.to_account_info(),
            },
            signer_seeds,
        );

        transfer_checked(cpi_ctx, quote.fees.net, self.skr_mint.decimals)
    }

    pub fn burn_fee(&self, quote: &SellQuote) -> Result<()> {
        if quote.fees.burn == 0 {
            return Ok(());
        }

        let mint_key = self.mint.key();
        let signer_seeds: &[&[&[u8]]] = &[&[MEME_SEED, mint_key.as_ref(), &[self.meme.bump]]];

        let cpi_ctx = CpiContext::new_with_signer(
            self.skr_token_program.key(),
            Burn {
                mint: self.skr_mint.to_account_info(),
                from: self.skr_vault.to_account_info(),
                authority: self.meme.to_account_info(),
            },
            signer_seeds,
        );

        burn(cpi_ctx, quote.fees.burn)
    }

    pub fn record_trade(&mut self, tokens_in: u64, quote: &SellQuote) -> Result<()> {
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
                    .checked_sub(tokens_in)
                    .ok_or(ErrorCode::MathOverflow)?;
                meme.real_skr = to_u64(
                    quote
                        .skr_reserve
                        .checked_sub(meme.virtual_skr)
                        .ok_or(ErrorCode::MathOverflow)?,
                )?;
            }
            Phase::Graduated => {
                meme.pool_skr = to_u64(quote.skr_reserve)?;
                meme.pool_tokens = to_u64(quote.token_reserve)?;
            }
        }

        Ok(())
    }

    pub fn emit_trade(&self, tokens_in: u64, quote: &SellQuote) -> Result<()> {
        emit!(Trade {
            meme: self.meme.key(),
            trader: self.seller.key(),
            is_buy: false,
            skr_amount: quote.fees.net,
            token_amount: tokens_in,
            creator_fee: quote.fees.creator,
            burned: quote.fees.burn,
            price_after: self.meme.price()?,
            phase: self.meme.phase,
        });
        Ok(())
    }
}
