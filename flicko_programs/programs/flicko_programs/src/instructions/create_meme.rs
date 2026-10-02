use anchor_lang::{
    prelude::*,
    system_program::{transfer, Transfer},
};
use anchor_spl::{
    token_2022::{
        set_authority, spl_token_2022::instruction::AuthorityType, SetAuthority, Token2022,
    },
    token_2022_extensions::{
        spl_token_metadata_interface::state::TokenMetadata, token_metadata_initialize,
        TokenMetadataInitialize,
    },
    token_interface::{burn, mint_to, Burn, Mint, MintTo, TokenAccount, TokenInterface},
};

use solana_instructions_sysvar::{load_current_index_checked, load_instruction_at_checked};

use crate::{
    attestation::{attestation_message, check_ed25519_data},
    error::ErrorCode,
    events::MemeCreated,
    math::launch_params,
    Attestor, Config, Meme, Phase, ATTESTOR_SEED, CONFIG_SEED, MAX_NAME_LEN, MAX_SYMBOL_LEN,
    MAX_URI_LEN, MEME_DECIMALS, MEME_SEED, SKR_VAULT_SEED, TOKEN_VAULT_SEED,
};

#[derive(Accounts)]
pub struct CreateMeme<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = skr_mint @ ErrorCode::InvalidMint
    )]
    pub config: Account<'info, Config>,

    #[account(seeds = [ATTESTOR_SEED], bump = attestor.bump)]
    pub attestor: Account<'info, Attestor>,

    /// CHECK: the instructions sysvar, pinned by address
    #[account(address = solana_sdk_ids::sysvar::instructions::ID)]
    pub instructions: UncheckedAccount<'info>,

    #[account(
        mut,
        mint::token_program = skr_token_program
    )]
    pub skr_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = skr_mint,
        token::authority = creator,
        token::token_program = skr_token_program
    )]
    pub creator_skr_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer = creator,
        mint::decimals = MEME_DECIMALS,
        mint::authority = creator,
        mint::token_program = token_program,
        extensions::metadata_pointer::authority = creator,
        extensions::metadata_pointer::metadata_address = mint
    )]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        init,
        payer = creator,
        seeds = [MEME_SEED, mint.key().as_ref()],
        bump,
        space = 8 + Meme::INIT_SPACE
    )]
    pub meme: Box<Account<'info, Meme>>,

    #[account(
        init,
        payer = creator,
        seeds = [TOKEN_VAULT_SEED, meme.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = meme,
        token::token_program = token_program
    )]
    pub token_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init,
        payer = creator,
        seeds = [SKR_VAULT_SEED, meme.key().as_ref()],
        bump,
        token::mint = skr_mint,
        token::authority = meme,
        token::token_program = skr_token_program
    )]
    pub skr_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Program<'info, Token2022>,
    pub skr_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

impl<'info> CreateMeme<'info> {
    pub fn validate(
        &self,
        name: &str,
        symbol: &str,
        uri: &str,
        supply: u64,
        start_price: u64,
    ) -> Result<()> {
        require!(
            !name.is_empty() && name.len() <= MAX_NAME_LEN,
            ErrorCode::InvalidMetadata
        );
        require!(
            !symbol.is_empty() && symbol.len() <= MAX_SYMBOL_LEN,
            ErrorCode::InvalidMetadata
        );
        require!(
            !uri.is_empty() && uri.len() <= MAX_URI_LEN,
            ErrorCode::InvalidMetadata
        );
        require!(
            supply >= self.config.min_supply && supply <= self.config.max_supply,
            ErrorCode::SupplyOutOfRange
        );
        require!(
            start_price >= self.config.min_start_price
                && start_price <= self.config.max_start_price,
            ErrorCode::PriceOutOfRange
        );
        Ok(())
    }

    pub fn verify_attestation(
        &self,
        name: &str,
        symbol: &str,
        uri: &str,
        image_hash: &[u8; 32],
        expires_at: i64,
    ) -> Result<()> {
        require!(
            Clock::get()?.unix_timestamp <= expires_at,
            ErrorCode::AttestationExpired
        );

        let sysvar = self.instructions.to_account_info();
        let current = load_current_index_checked(&sysvar)?;
        require!(current > 0, ErrorCode::MissingAttestation);
        let previous = load_instruction_at_checked(current as usize - 1, &sysvar)?;
        require_keys_eq!(
            previous.program_id,
            solana_sdk_ids::ed25519_program::ID,
            ErrorCode::MissingAttestation
        );

        let message = attestation_message(
            &self.creator.key(),
            image_hash,
            expires_at,
            name,
            symbol,
            uri,
        );
        check_ed25519_data(&previous.data, &self.attestor.authority, &message)
    }

    pub fn burn_creation_fee(&self) -> Result<()> {
        if self.config.creation_fee == 0 {
            return Ok(());
        }

        let cpi_ctx = CpiContext::new(
            self.skr_token_program.key(),
            Burn {
                mint: self.skr_mint.to_account_info(),
                from: self.creator_skr_account.to_account_info(),
                authority: self.creator.to_account_info(),
            },
        );

        burn(cpi_ctx, self.config.creation_fee)
    }

    pub fn init_metadata(&self, name: &str, symbol: &str, uri: &str) -> Result<()> {
        let metadata = TokenMetadata {
            update_authority: Some(self.meme.key()).try_into()?,
            mint: self.mint.key(),
            name: name.to_string(),
            symbol: symbol.to_string(),
            uri: uri.to_string(),
            additional_metadata: vec![],
        };
        let extra_space = metadata.tlv_size_of()?;
        let mint_info = self.mint.to_account_info();
        let required = Rent::get()?.minimum_balance(mint_info.data_len() + extra_space);
        let top_up = required.saturating_sub(mint_info.lamports());

        if top_up > 0 {
            transfer(
                CpiContext::new(
                    self.system_program.key(),
                    Transfer {
                        from: self.creator.to_account_info(),
                        to: mint_info.clone(),
                    },
                ),
                top_up,
            )?;
        }

        let cpi_ctx = CpiContext::new(
            self.token_program.key(),
            TokenMetadataInitialize {
                program_id: self.token_program.to_account_info(),
                metadata: mint_info.clone(),
                update_authority: self.meme.to_account_info(),
                mint: mint_info,
                mint_authority: self.creator.to_account_info(),
            },
        );

        token_metadata_initialize(
            cpi_ctx,
            name.to_string(),
            symbol.to_string(),
            uri.to_string(),
        )
    }

    pub fn mint_supply(&self, supply: u64) -> Result<()> {
        let cpi_ctx = CpiContext::new(
            self.token_program.key(),
            MintTo {
                mint: self.mint.to_account_info(),
                to: self.token_vault.to_account_info(),
                authority: self.creator.to_account_info(),
            },
        );

        mint_to(cpi_ctx, supply)
    }

    pub fn revoke_authorities(&self) -> Result<()> {
        for authority_type in [AuthorityType::MintTokens, AuthorityType::MetadataPointer] {
            let cpi_ctx = CpiContext::new(
                self.token_program.key(),
                SetAuthority {
                    current_authority: self.creator.to_account_info(),
                    account_or_mint: self.mint.to_account_info(),
                },
            );
            set_authority(cpi_ctx, authority_type, None)?;
        }
        Ok(())
    }

    pub fn init_meme(
        &mut self,
        image_hash: [u8; 32],
        supply: u64,
        start_price: u64,
        bumps: &CreateMemeBumps,
    ) -> Result<()> {
        let params = launch_params(supply, start_price)?;

        self.meme.set_inner(Meme {
            creator: self.creator.key(),
            mint: self.mint.key(),
            parent: None,
            image_hash,
            phase: Phase::Launch,
            total_supply: supply,
            sale_supply: params.sale_supply,
            pool_supply: params.pool_supply,
            virtual_skr: params.virtual_skr,
            curve_skr: params.virtual_skr,
            curve_tokens: params.virtual_tokens,
            tokens_sold: 0,
            real_skr: 0,
            pool_skr: 0,
            pool_tokens: 0,
            creator_fees: 0,
            created_at: Clock::get()?.unix_timestamp,
            bump: bumps.meme,
        });

        Ok(())
    }

    pub fn emit_created(
        &self,
        name: String,
        symbol: String,
        uri: String,
        start_price: u64,
    ) -> Result<()> {
        emit!(MemeCreated {
            meme: self.meme.key(),
            mint: self.mint.key(),
            creator: self.creator.key(),
            name,
            symbol,
            uri,
            image_hash: self.meme.image_hash,
            total_supply: self.meme.total_supply,
            start_price,
            created_at: self.meme.created_at,
        });
        Ok(())
    }
}
