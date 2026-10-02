use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Supply is outside the allowed range")]
    SupplyOutOfRange,
    #[msg("Start price is outside the allowed range")]
    PriceOutOfRange,
    #[msg("Supply must be divisible by 5")]
    InvalidSupply,
    #[msg("Name, symbol or uri is empty or too long")]
    InvalidMetadata,
    #[msg("Config values are invalid")]
    InvalidConfig,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid mint")]
    InvalidMint,
    #[msg("Amount is zero or too small to cover fees")]
    ZeroAmount,
    #[msg("Slippage limit exceeded")]
    SlippageExceeded,
    #[msg("Not enough liquidity for this trade")]
    InsufficientLiquidity,
    #[msg("No creator fees to claim")]
    NothingToClaim,
    #[msg("Missing the attestor signature instruction")]
    MissingAttestation,
    #[msg("Attestor signature does not match this meme")]
    InvalidAttestation,
    #[msg("Attestation has expired")]
    AttestationExpired,
}
