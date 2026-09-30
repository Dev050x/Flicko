use anchor_lang::prelude::*;

use crate::{error::ErrorCode, PRICE_SCALE};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LaunchParams {
    pub virtual_tokens: u128,
    pub virtual_skr: u128,
    pub sale_supply: u64,
    pub pool_supply: u64,
}

pub fn launch_params(supply: u64, start_price: u64) -> Result<LaunchParams> {
    require!(supply % 5 == 0, ErrorCode::InvalidSupply);

    let s = supply as u128;
    let virtual_tokens = s
        .checked_mul(16)
        .and_then(|v| v.checked_div(15))
        .ok_or(ErrorCode::MathOverflow)?;
    let virtual_skr = (start_price as u128)
        .checked_mul(virtual_tokens)
        .and_then(|v| v.checked_div(PRICE_SCALE))
        .ok_or(ErrorCode::MathOverflow)?;
    require!(virtual_skr > 0, ErrorCode::PriceOutOfRange);

    let sale_supply = s
        .checked_mul(4)
        .and_then(|v| v.checked_div(5))
        .ok_or(ErrorCode::MathOverflow)?;
    let pool_supply = s.checked_sub(sale_supply).ok_or(ErrorCode::MathOverflow)?;

    Ok(LaunchParams {
        virtual_tokens,
        virtual_skr,
        sale_supply: u64::try_from(sale_supply).map_err(|_| ErrorCode::MathOverflow)?,
        pool_supply: u64::try_from(pool_supply).map_err(|_| ErrorCode::MathOverflow)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const ONE: u64 = 1_000_000;

    #[test]
    fn splits_supply_80_20() {
        let p = launch_params(1_000_000 * ONE, 1_000).unwrap();
        assert_eq!(p.sale_supply, 800_000 * ONE);
        assert_eq!(p.pool_supply, 200_000 * ONE);
        assert_eq!(p.sale_supply + p.pool_supply, 1_000_000 * ONE);
    }

    #[test]
    fn derives_virtual_reserves() {
        let supply = 1_500_000 * ONE;
        let p = launch_params(supply, 1_000).unwrap();
        assert_eq!(p.virtual_tokens, 1_600_000 * ONE as u128);
        assert_eq!(p.virtual_skr, 1_600 * ONE as u128);
    }

    #[test]
    fn sell_out_price_is_sixteen_times_start() {
        let supply = 1_500_000 * ONE;
        let p = launch_params(supply, 1_000).unwrap();
        let k = p.virtual_skr * p.virtual_tokens;
        let tokens_left = p.virtual_tokens - p.sale_supply as u128;
        let skr_at_sell_out = k / tokens_left;
        assert_eq!(skr_at_sell_out * PRICE_SCALE / tokens_left, 16_000);
        assert_eq!(skr_at_sell_out - p.virtual_skr, 3 * p.virtual_skr);
    }

    #[test]
    fn rejects_supply_not_divisible_by_5() {
        assert!(launch_params(1_000_001, 1_000).is_err());
    }

    #[test]
    fn rejects_price_that_rounds_to_zero() {
        assert!(launch_params(5, 1).is_err());
    }

    #[test]
    fn handles_u64_max_supply() {
        let supply = u64::MAX - (u64::MAX % 5);
        assert!(launch_params(supply, 1_000_000_000).is_ok());
    }

    #[test]
    fn rejects_overflowing_reserves() {
        let supply = u64::MAX - (u64::MAX % 5);
        assert!(launch_params(supply, u64::MAX).is_err());
    }
}
