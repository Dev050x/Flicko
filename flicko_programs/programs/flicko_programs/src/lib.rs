#![allow(unexpected_cfgs)]
#![allow(deprecated)]

pub mod attestation;
pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod math;
pub mod state;

use anchor_lang::prelude::*;
#[cfg(not(feature = "no-entrypoint"))]
use solana_security_txt::security_txt;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("4BfMnkmQheerNffcJtEusXxVC16uhGExrRevBLUcZgBD");

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
    name: "Flicko",
    project_url: "https://github.com/Dev050x/Flicko",
    contacts: "link:https://github.com/Dev050x/Flicko/issues",
    policy: "https://github.com/Dev050x/Flicko/security",
    preferred_languages: "en",
    source_code: "https://github.com/Dev050x/Flicko"
}

#[program]
pub mod flicko_programs {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>, args: ConfigArgs) -> Result<()> {
        ctx.accounts.init_config(args, &ctx.bumps)
    }

    pub fn update_config(ctx: Context<UpdateConfig>, args: ConfigArgs) -> Result<()> {
        ctx.accounts.update_config(args)
    }

    pub fn set_attestor(ctx: Context<SetAttestor>, authority: Pubkey) -> Result<()> {
        ctx.accounts.set_attestor(authority, &ctx.bumps)
    }

    pub fn create_meme(
        ctx: Context<CreateMeme>,
        name: String,
        symbol: String,
        uri: String,
        image_hash: [u8; 32],
        supply: u64,
        start_price: u64,
        expires_at: i64,
    ) -> Result<()> {
        ctx.accounts
            .validate(&name, &symbol, &uri, supply, start_price)?;
        ctx.accounts
            .verify_attestation(&name, &symbol, &uri, &image_hash, expires_at)?;
        ctx.accounts.burn_creation_fee()?;
        ctx.accounts.init_metadata(&name, &symbol, &uri)?;
        ctx.accounts.mint_supply(supply)?;
        ctx.accounts.revoke_authorities()?;
        ctx.accounts
            .init_meme(image_hash, supply, start_price, &ctx.bumps)?;
        ctx.accounts.emit_created(name, symbol, uri, start_price)
    }

    pub fn buy(ctx: Context<Buy>, skr_in: u64, min_tokens_out: u64) -> Result<()> {
        let quote = ctx.accounts.quote(skr_in, min_tokens_out)?;
        ctx.accounts.deposit_skr(&quote)?;
        ctx.accounts.burn_fee(&quote)?;
        ctx.accounts.send_tokens(&quote)?;
        ctx.accounts.record_trade(&quote)?;
        ctx.accounts.emit_events(&quote)
    }

    pub fn sell(ctx: Context<Sell>, tokens_in: u64, min_skr_out: u64) -> Result<()> {
        let quote = ctx.accounts.quote(tokens_in, min_skr_out)?;
        ctx.accounts.receive_tokens(tokens_in)?;
        ctx.accounts.pay_skr(&quote)?;
        ctx.accounts.burn_fee(&quote)?;
        ctx.accounts.record_trade(tokens_in, &quote)?;
        ctx.accounts.emit_trade(tokens_in, &quote)
    }

    pub fn claim_creator_fees(ctx: Context<ClaimCreatorFees>) -> Result<()> {
        ctx.accounts.validate()?;
        ctx.accounts.pay_creator()?;
        ctx.accounts.emit_claimed()?;
        ctx.accounts.reset_fees()
    }
}
