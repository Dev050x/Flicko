#![allow(unexpected_cfgs)]
#![allow(deprecated)]

pub mod constants;
pub mod error;
pub mod instructions;
pub mod math;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("4BfMnkmQheerNffcJtEusXxVC16uhGExrRevBLUcZgBD");

#[program]
pub mod flicko_programs {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>, args: ConfigArgs) -> Result<()> {
        ctx.accounts.init_config(args, &ctx.bumps)
    }

    pub fn create_meme(
        ctx: Context<CreateMeme>,
        name: String,
        symbol: String,
        uri: String,
        image_hash: [u8; 32],
        supply: u64,
        start_price: u64,
    ) -> Result<()> {
        ctx.accounts
            .validate(&name, &symbol, &uri, supply, start_price)?;
        ctx.accounts.burn_creation_fee()?;
        ctx.accounts.init_metadata(name, symbol, uri)?;
        ctx.accounts.mint_supply(supply)?;
        ctx.accounts.revoke_authorities()?;
        ctx.accounts
            .init_meme(image_hash, supply, start_price, &ctx.bumps)
    }
}
