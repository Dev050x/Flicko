use anchor_lang::prelude::*;

use crate::{error::ErrorCode, Config, ConfigArgs, CONFIG_SEED};

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ ErrorCode::Unauthorized
    )]
    pub config: Account<'info, Config>,
}

impl<'info> UpdateConfig<'info> {
    pub fn update_config(&mut self, args: ConfigArgs) -> Result<()> {
        args.validate()?;

        let config = &mut self.config;
        config.creator_fee_bps = args.creator_fee_bps;
        config.burn_bps = args.burn_bps;
        config.creation_fee = args.creation_fee;
        config.min_supply = args.min_supply;
        config.max_supply = args.max_supply;
        config.min_start_price = args.min_start_price;
        config.max_start_price = args.max_start_price;

        Ok(())
    }
}
