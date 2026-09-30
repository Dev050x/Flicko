use anchor_lang::prelude::*;

use crate::{error::ErrorCode, BPS_DENOMINATOR, PRICE_SCALE};

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
    virtual_skr
        .checked_mul(virtual_tokens)
        .ok_or(ErrorCode::MathOverflow)?;
    to_u64(virtual_skr.checked_mul(4).ok_or(ErrorCode::MathOverflow)?)?;

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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Fees {
    pub creator: u64,
    pub burn: u64,
    pub net: u64,
}

impl Fees {
    pub fn gross(&self) -> Result<u64> {
        self.creator
            .checked_add(self.burn)
            .and_then(|v| v.checked_add(self.net))
            .ok_or(ErrorCode::MathOverflow.into())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BuyQuote {
    pub fees: Fees,
    pub tokens_out: u64,
    pub skr_reserve: u128,
    pub token_reserve: u128,
    pub graduates: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SellQuote {
    pub fees: Fees,
    pub skr_reserve: u128,
    pub token_reserve: u128,
}

pub fn to_u64(value: u128) -> Result<u64> {
    u64::try_from(value).map_err(|_| ErrorCode::MathOverflow.into())
}

pub fn ceil_div(numerator: u128, denominator: u128) -> Result<u128> {
    require!(denominator > 0, ErrorCode::MathOverflow);
    let quotient = numerator / denominator;
    Ok(if numerator % denominator == 0 {
        quotient
    } else {
        quotient + 1
    })
}

pub fn fee(amount: u64, bps: u16) -> Result<u64> {
    let scaled = (amount as u128)
        .checked_mul(bps as u128)
        .ok_or(ErrorCode::MathOverflow)?;
    to_u64(ceil_div(scaled, BPS_DENOMINATOR as u128)?)
}

pub fn split_fees(gross: u64, creator_bps: u16, burn_bps: u16) -> Result<Fees> {
    let creator = fee(gross, creator_bps)?;
    let burn = fee(gross, burn_bps)?;
    let net = gross
        .checked_sub(creator)
        .and_then(|v| v.checked_sub(burn))
        .ok_or(ErrorCode::ZeroAmount)?;
    Ok(Fees { creator, burn, net })
}

pub fn fees_for_net(net: u64, creator_bps: u16, burn_bps: u16) -> Result<Fees> {
    let keep = BPS_DENOMINATOR
        .checked_sub(creator_bps)
        .and_then(|v| v.checked_sub(burn_bps))
        .filter(|v| *v > 0)
        .ok_or(ErrorCode::MathOverflow)?;
    let mut gross = to_u64((net as u128) * (BPS_DENOMINATOR as u128) / (keep as u128))?;

    loop {
        let creator = fee(gross, creator_bps)?;
        let burn = fee(gross, burn_bps)?;
        let left = gross.saturating_sub(creator).saturating_sub(burn);
        if left >= net {
            return Ok(Fees {
                creator,
                burn,
                net: left,
            });
        }
        gross = gross.checked_add(1).ok_or(ErrorCode::MathOverflow)?;
    }
}

pub fn curve_buy(
    curve_skr: u128,
    curve_tokens: u128,
    tokens_left: u64,
    skr_in: u64,
    creator_bps: u16,
    burn_bps: u16,
) -> Result<BuyQuote> {
    let fees = split_fees(skr_in, creator_bps, burn_bps)?;
    require!(fees.net > 0, ErrorCode::ZeroAmount);

    let k = curve_skr
        .checked_mul(curve_tokens)
        .ok_or(ErrorCode::MathOverflow)?;
    let skr_after = curve_skr
        .checked_add(fees.net as u128)
        .ok_or(ErrorCode::MathOverflow)?;
    let tokens_after = ceil_div(k, skr_after)?;
    let tokens_out = curve_tokens
        .checked_sub(tokens_after)
        .ok_or(ErrorCode::MathOverflow)?;

    if tokens_out < tokens_left as u128 {
        require!(tokens_out > 0, ErrorCode::ZeroAmount);
        return Ok(BuyQuote {
            fees,
            tokens_out: to_u64(tokens_out)?,
            skr_reserve: skr_after,
            token_reserve: tokens_after,
            graduates: false,
        });
    }

    let token_reserve = curve_tokens
        .checked_sub(tokens_left as u128)
        .ok_or(ErrorCode::MathOverflow)?;
    let skr_reserve = ceil_div(k, token_reserve)?;
    let net = to_u64(
        skr_reserve
            .checked_sub(curve_skr)
            .ok_or(ErrorCode::MathOverflow)?,
    )?;

    Ok(BuyQuote {
        fees: fees_for_net(net, creator_bps, burn_bps)?,
        tokens_out: tokens_left,
        skr_reserve,
        token_reserve,
        graduates: true,
    })
}

pub fn pool_buy(
    pool_skr: u64,
    pool_tokens: u64,
    skr_in: u64,
    creator_bps: u16,
    burn_bps: u16,
) -> Result<BuyQuote> {
    let fees = split_fees(skr_in, creator_bps, burn_bps)?;
    require!(fees.net > 0, ErrorCode::ZeroAmount);

    let k = (pool_skr as u128)
        .checked_mul(pool_tokens as u128)
        .ok_or(ErrorCode::MathOverflow)?;
    let skr_after = (pool_skr as u128)
        .checked_add(fees.net as u128)
        .ok_or(ErrorCode::MathOverflow)?;
    let tokens_after = ceil_div(k, skr_after)?;
    let tokens_out = (pool_tokens as u128)
        .checked_sub(tokens_after)
        .ok_or(ErrorCode::MathOverflow)?;
    require!(tokens_out > 0, ErrorCode::ZeroAmount);

    Ok(BuyQuote {
        fees,
        tokens_out: to_u64(tokens_out)?,
        skr_reserve: skr_after,
        token_reserve: tokens_after,
        graduates: false,
    })
}

pub fn curve_sell(
    curve_skr: u128,
    curve_tokens: u128,
    tokens_sold: u64,
    tokens_in: u64,
    creator_bps: u16,
    burn_bps: u16,
) -> Result<SellQuote> {
    require!(tokens_in > 0, ErrorCode::ZeroAmount);
    require!(tokens_in <= tokens_sold, ErrorCode::InsufficientLiquidity);
    sell_against(curve_skr, curve_tokens, tokens_in, creator_bps, burn_bps)
}

pub fn pool_sell(
    pool_skr: u64,
    pool_tokens: u64,
    tokens_in: u64,
    creator_bps: u16,
    burn_bps: u16,
) -> Result<SellQuote> {
    require!(tokens_in > 0, ErrorCode::ZeroAmount);
    sell_against(
        pool_skr as u128,
        pool_tokens as u128,
        tokens_in,
        creator_bps,
        burn_bps,
    )
}

fn sell_against(
    skr_reserve: u128,
    token_reserve: u128,
    tokens_in: u64,
    creator_bps: u16,
    burn_bps: u16,
) -> Result<SellQuote> {
    let k = skr_reserve
        .checked_mul(token_reserve)
        .ok_or(ErrorCode::MathOverflow)?;
    let tokens_after = token_reserve
        .checked_add(tokens_in as u128)
        .ok_or(ErrorCode::MathOverflow)?;
    let skr_after = ceil_div(k, tokens_after)?;
    let skr_out = to_u64(
        skr_reserve
            .checked_sub(skr_after)
            .ok_or(ErrorCode::MathOverflow)?,
    )?;

    let fees = split_fees(skr_out, creator_bps, burn_bps)?;
    require!(fees.net > 0, ErrorCode::ZeroAmount);

    Ok(SellQuote {
        fees,
        skr_reserve: skr_after,
        token_reserve: tokens_after,
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
        assert!(launch_params(supply, 1_000).is_ok());
    }

    #[test]
    fn rejects_overflowing_reserves() {
        let supply = u64::MAX - (u64::MAX % 5);
        assert!(launch_params(supply, u64::MAX).is_err());
    }

    fn launch() -> LaunchParams {
        launch_params(1_000_000 * ONE, 1_000).unwrap()
    }

    #[test]
    fn fee_rounds_up() {
        assert_eq!(fee(0, 200).unwrap(), 0);
        assert_eq!(fee(1, 200).unwrap(), 1);
        assert_eq!(fee(10_000, 200).unwrap(), 200);
        assert_eq!(fee(10_001, 200).unwrap(), 201);
    }

    #[test]
    fn split_fees_adds_up_to_gross() {
        for gross in [100u64, 12_345, 99 * ONE, 1_000_003] {
            let fees = split_fees(gross, 200, 50).unwrap();
            assert_eq!(fees.gross().unwrap(), gross);
            assert_eq!(fees.creator, fee(gross, 200).unwrap());
            assert_eq!(fees.burn, fee(gross, 50).unwrap());
        }
    }

    #[test]
    fn split_fees_rejects_dust() {
        assert!(split_fees(1, 200, 50).is_err());
    }

    #[test]
    fn fees_for_net_finds_smallest_gross() {
        for net in 1u64..5_000 {
            let fees = fees_for_net(net, 200, 50).unwrap();
            let gross = fees.gross().unwrap();
            assert_eq!(fees.net, net);
            assert_eq!(split_fees(gross, 200, 50).unwrap(), fees);
            if let Ok(smaller) = split_fees(gross - 1, 200, 50) {
                assert!(smaller.net < net);
            }
        }
    }

    #[test]
    fn curve_buy_follows_constant_product() {
        let p = launch();
        let skr_in = 100 * ONE;
        let q = curve_buy(
            p.virtual_skr,
            p.virtual_tokens,
            p.sale_supply,
            skr_in,
            200,
            50,
        )
        .unwrap();
        let fees = split_fees(skr_in, 200, 50).unwrap();
        let k = p.virtual_skr * p.virtual_tokens;
        let skr_after = p.virtual_skr + fees.net as u128;
        let tokens_after = ceil_div(k, skr_after).unwrap();

        assert_eq!(q.fees, fees);
        assert!(!q.graduates);
        assert_eq!(q.tokens_out as u128, p.virtual_tokens - tokens_after);
        assert_eq!(q.skr_reserve, skr_after);
        assert_eq!(q.token_reserve, tokens_after);
        assert!(q.skr_reserve * q.token_reserve >= k);
    }

    #[test]
    fn curve_buy_rounds_in_pool_favour() {
        let p = launch();
        let mut skr = p.virtual_skr;
        let mut tokens = p.virtual_tokens;
        let mut sold = 0u64;
        let k = skr * tokens;
        for i in 1..200u64 {
            let q = curve_buy(skr, tokens, p.sale_supply - sold, i * 7_919, 200, 50).unwrap();
            skr = q.skr_reserve;
            tokens = q.token_reserve;
            sold += q.tokens_out;
            assert!(skr * tokens >= k);
            assert_eq!(tokens + sold as u128, p.virtual_tokens);
        }
    }

    #[test]
    fn sell_out_buy_fills_to_sale_supply_and_refunds() {
        let p = launch();
        let skr_in = 10_000 * ONE;
        let q = curve_buy(
            p.virtual_skr,
            p.virtual_tokens,
            p.sale_supply,
            skr_in,
            200,
            50,
        )
        .unwrap();
        let real_skr = q.skr_reserve - p.virtual_skr;

        assert!(q.graduates);
        assert_eq!(q.tokens_out, p.sale_supply);
        assert_eq!(q.token_reserve, p.virtual_tokens - p.sale_supply as u128);
        assert_eq!(q.fees.net as u128, real_skr);
        assert!(q.fees.gross().unwrap() < skr_in);
        assert!(real_skr >= 3 * p.virtual_skr && real_skr <= 3 * p.virtual_skr + 1);
    }

    #[test]
    fn exact_sell_out_amount_graduates() {
        let p = launch();
        let first = curve_buy(
            p.virtual_skr,
            p.virtual_tokens,
            p.sale_supply,
            10_000 * ONE,
            200,
            50,
        )
        .unwrap();
        let gross = first.fees.gross().unwrap();
        let q = curve_buy(
            p.virtual_skr,
            p.virtual_tokens,
            p.sale_supply,
            gross,
            200,
            50,
        )
        .unwrap();
        assert!(q.graduates);
        assert_eq!(q, first);
    }

    #[test]
    fn pool_opens_at_sell_out_price() {
        let p = launch();
        let q = curve_buy(
            p.virtual_skr,
            p.virtual_tokens,
            p.sale_supply,
            10_000 * ONE,
            200,
            50,
        )
        .unwrap();
        let real_skr = q.skr_reserve - p.virtual_skr;
        let curve_price = q.skr_reserve * PRICE_SCALE / q.token_reserve;
        let pool_price = real_skr * PRICE_SCALE / p.pool_supply as u128;
        assert!(curve_price.abs_diff(pool_price) <= 1);
        assert!(pool_price.abs_diff(16_000) <= 1);
    }

    #[test]
    fn pool_buy_follows_constant_product() {
        let skr_in = 50 * ONE;
        let q = pool_buy(3_200 * ONE, 200_000 * ONE, skr_in, 200, 50).unwrap();
        let fees = split_fees(skr_in, 200, 50).unwrap();
        let k = (3_200 * ONE) as u128 * (200_000 * ONE) as u128;
        let tokens_after = ceil_div(k, (3_200 * ONE + fees.net) as u128).unwrap();

        assert_eq!(q.fees, fees);
        assert_eq!(q.tokens_out as u128, (200_000 * ONE) as u128 - tokens_after);
        assert!(q.skr_reserve * q.token_reserve >= k);
    }

    #[test]
    fn buy_rejects_amount_too_small_for_tokens() {
        let p = launch();
        assert!(curve_buy(p.virtual_skr, p.virtual_tokens, p.sale_supply, 1, 200, 50).is_err());
        assert!(pool_buy(ONE, 10, 2, 0, 0).is_err());
    }

    #[test]
    fn curve_sell_follows_constant_product() {
        let p = launch();
        let bought = curve_buy(
            p.virtual_skr,
            p.virtual_tokens,
            p.sale_supply,
            500 * ONE,
            200,
            50,
        )
        .unwrap();
        let tokens_in = bought.tokens_out / 2;
        let q = curve_sell(
            bought.skr_reserve,
            bought.token_reserve,
            bought.tokens_out,
            tokens_in,
            200,
            50,
        )
        .unwrap();
        let k = bought.skr_reserve * bought.token_reserve;
        let tokens_after = bought.token_reserve + tokens_in as u128;
        let skr_after = ceil_div(k, tokens_after).unwrap();
        let skr_out = (bought.skr_reserve - skr_after) as u64;

        assert_eq!(q.fees, split_fees(skr_out, 200, 50).unwrap());
        assert_eq!(q.skr_reserve, skr_after);
        assert_eq!(q.token_reserve, tokens_after);
        assert!(q.skr_reserve * q.token_reserve >= k);
    }

    #[test]
    fn buy_then_sell_never_returns_more_than_paid() {
        let p = launch();
        for skr_in in [ONE, 7 * ONE + 3, 250 * ONE, 3_399 * ONE] {
            let b = curve_buy(
                p.virtual_skr,
                p.virtual_tokens,
                p.sale_supply,
                skr_in,
                200,
                50,
            )
            .unwrap();
            let s = curve_sell(
                b.skr_reserve,
                b.token_reserve,
                b.tokens_out,
                b.tokens_out,
                200,
                50,
            )
            .unwrap();
            assert!(s.fees.net < skr_in);
            assert!(s.skr_reserve >= p.virtual_skr);

            let b = pool_buy(3_200 * ONE, 200_000 * ONE, skr_in, 200, 50).unwrap();
            let s = pool_sell(
                to_u64(b.skr_reserve).unwrap(),
                to_u64(b.token_reserve).unwrap(),
                b.tokens_out,
                200,
                50,
            )
            .unwrap();
            assert!(s.fees.net < skr_in);
            assert!(s.skr_reserve >= 3_200 * ONE as u128);
        }
    }

    #[test]
    fn curve_sell_rejects_more_than_sold() {
        let p = launch();
        assert!(curve_sell(p.virtual_skr, p.virtual_tokens, 0, ONE, 200, 50).is_err());
        assert!(curve_sell(p.virtual_skr, p.virtual_tokens, ONE, 0, 200, 50).is_err());
    }

    #[test]
    fn sell_rejects_dust() {
        let p = launch();
        let b = curve_buy(
            p.virtual_skr,
            p.virtual_tokens,
            p.sale_supply,
            100 * ONE,
            200,
            50,
        )
        .unwrap();
        assert!(curve_sell(b.skr_reserve, b.token_reserve, b.tokens_out, 1, 200, 50).is_err());
    }

    #[test]
    fn random_trades_keep_vault_solvent() {
        let p = launch_params(1_000 * ONE, 1_000).unwrap();
        let mut seed = 0x2545_f491_4f6c_dd1du64;
        let mut next = |max: u64| {
            seed ^= seed << 13;
            seed ^= seed >> 7;
            seed ^= seed << 17;
            seed % max + 1
        };

        let (mut curve_skr, mut curve_tokens) = (p.virtual_skr, p.virtual_tokens);
        let (mut sold, mut real_skr) = (0u64, 0u64);
        let (mut pool_skr, mut pool_tokens) = (0u64, 0u64);
        let (mut vault, mut creator_fees, mut held) = (0u64, 0u64, 0u64);
        let mut graduated = false;

        for _ in 0..5_000 {
            if held == 0 || next(2) == 1 {
                let skr_in = next(ONE);
                let q = if graduated {
                    pool_buy(pool_skr, pool_tokens, skr_in, 200, 50)
                } else {
                    curve_buy(
                        curve_skr,
                        curve_tokens,
                        p.sale_supply - sold,
                        skr_in,
                        200,
                        50,
                    )
                };
                let Ok(q) = q else { continue };
                vault += q.fees.net + q.fees.creator;
                creator_fees += q.fees.creator;
                held += q.tokens_out;
                if graduated {
                    pool_skr = to_u64(q.skr_reserve).unwrap();
                    pool_tokens = to_u64(q.token_reserve).unwrap();
                } else {
                    curve_skr = q.skr_reserve;
                    curve_tokens = q.token_reserve;
                    sold += q.tokens_out;
                    real_skr = to_u64(curve_skr - p.virtual_skr).unwrap();
                    if q.graduates {
                        graduated = true;
                        pool_skr = real_skr;
                        pool_tokens = p.pool_supply;
                    }
                }
            } else {
                let tokens_in = next(held);
                let q = if graduated {
                    pool_sell(pool_skr, pool_tokens, tokens_in, 200, 50)
                } else {
                    curve_sell(curve_skr, curve_tokens, sold, tokens_in, 200, 50)
                };
                let Ok(q) = q else { continue };
                vault -= q.fees.net + q.fees.burn;
                creator_fees += q.fees.creator;
                held -= tokens_in;
                if graduated {
                    pool_skr = to_u64(q.skr_reserve).unwrap();
                    pool_tokens = to_u64(q.token_reserve).unwrap();
                } else {
                    curve_skr = q.skr_reserve;
                    curve_tokens = q.token_reserve;
                    sold -= tokens_in;
                    real_skr = to_u64(curve_skr - p.virtual_skr).unwrap();
                }
            }

            let reserve = if graduated { pool_skr } else { real_skr };
            assert!(vault >= reserve + creator_fees);
        }
        assert!(graduated);
    }
}
