use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

use crate::{error::ErrorCode, program::FlickoPrograms, Config, BPS_DENOMINATOR, CONFIG_SEED};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ConfigArgs {
    pub creator_fee_bps: u16,
    pub burn_bps: u16,
    pub creation_fee: u64,
    pub min_supply: u64,
    pub max_supply: u64,
    pub min_start_price: u64,
    pub max_start_price: u64,
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    pub skr_mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = admin,
        seeds = [CONFIG_SEED],
        bump,
        space = 8 + Config::INIT_SPACE
    )]
    pub config: Account<'info, Config>,

    #[account(
        constraint = program.programdata_address()? == Some(program_data.key()) @ ErrorCode::Unauthorized
    )]
    pub program: Program<'info, FlickoPrograms>,

    #[account(
        constraint = program_data.upgrade_authority_address == Some(admin.key()) @ ErrorCode::Unauthorized
    )]
    pub program_data: Account<'info, ProgramData>,

    pub system_program: Program<'info, System>,
}

impl<'info> InitializeConfig<'info> {
    pub fn init_config(&mut self, args: ConfigArgs, bumps: &InitializeConfigBumps) -> Result<()> {
        let fee_total = (args.creator_fee_bps as u32) + (args.burn_bps as u32);
        require!(fee_total < BPS_DENOMINATOR as u32, ErrorCode::InvalidConfig);
        require!(
            args.min_supply > 0 && args.min_supply <= args.max_supply,
            ErrorCode::InvalidConfig
        );
        require!(
            args.min_start_price > 0 && args.min_start_price <= args.max_start_price,
            ErrorCode::InvalidConfig
        );

        self.config.set_inner(Config {
            admin: self.admin.key(),
            skr_mint: self.skr_mint.key(),
            creator_fee_bps: args.creator_fee_bps,
            burn_bps: args.burn_bps,
            creation_fee: args.creation_fee,
            min_supply: args.min_supply,
            max_supply: args.max_supply,
            min_start_price: args.min_start_price,
            max_start_price: args.max_start_price,
            bump: bumps.config,
        });

        Ok(())
    }
}
