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
}
