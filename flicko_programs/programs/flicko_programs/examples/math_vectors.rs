use anchor_lang::error::Error;
use flicko_programs::math::{
    curve_buy, curve_sell, fees_for_net, launch_params, pool_buy, pool_sell, split_fees, BuyQuote,
    Fees, SellQuote,
};

struct Rng(u64);

impl Rng {
    fn next(&mut self, max: u64) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0 % max + 1
    }
}

fn code(err: Error) -> String {
    match err {
        Error::AnchorError(e) => e.error_name,
        Error::ProgramError(e) => format!("{:?}", e.program_error),
    }
}

fn fees_json(f: &Fees) -> String {
    format!(
        r#"{{"creator":"{}","burn":"{}","net":"{}"}}"#,
        f.creator, f.burn, f.net
    )
}

fn buy_json(r: anchor_lang::Result<BuyQuote>) -> String {
    match r {
        Ok(q) => format!(
            r#"{{"fees":{},"tokensOut":"{}","skrReserve":"{}","tokenReserve":"{}","graduates":{}}}"#,
            fees_json(&q.fees),
            q.tokens_out,
            q.skr_reserve,
            q.token_reserve,
            q.graduates
        ),
        Err(e) => format!(r#"{{"error":"{}"}}"#, code(e)),
    }
}

fn sell_json(r: anchor_lang::Result<SellQuote>) -> String {
    match r {
        Ok(q) => format!(
            r#"{{"fees":{},"skrReserve":"{}","tokenReserve":"{}"}}"#,
            fees_json(&q.fees),
            q.skr_reserve,
            q.token_reserve
        ),
        Err(e) => format!(r#"{{"error":"{}"}}"#, code(e)),
    }
}

fn main() {
    let mut out: Vec<String> = Vec::new();
    let mut rng = Rng(0x9e37_79b9_7f4a_7c15);
    let fee_sets: [(u16, u16); 3] = [(200, 50), (0, 0), (150, 100)];

    for i in 0..200u64 {
        let supply = match i % 4 {
            0 => rng.next(1_000_000_000) * 5 * 1_000_000 + 1,
            1 => u64::MAX - (u64::MAX % 5),
            2 => 5,
            _ => rng.next(1_000_000_000) * 5 * 1_000_000,
        };
        let price = match i % 5 {
            0 => 1,
            1 => u64::MAX / rng.next(1_000),
            _ => rng.next(1_000_000),
        };
        let result = match launch_params(supply, price) {
            Ok(p) => format!(
                r#"{{"virtualTokens":"{}","virtualSkr":"{}","saleSupply":"{}","poolSupply":"{}"}}"#,
                p.virtual_tokens, p.virtual_skr, p.sale_supply, p.pool_supply
            ),
            Err(e) => format!(r#"{{"error":"{}"}}"#, code(e)),
        };
        out.push(format!(
            r#"{{"op":"launchParams","args":["{}","{}"],"result":{}}}"#,
            supply, price, result
        ));
    }

    for amount in (0..400u64).chain([12_345, 99_000_000, u64::MAX / 10_000, u64::MAX]) {
        for (creator_bps, burn_bps) in fee_sets {
            let split = match split_fees(amount, creator_bps, burn_bps) {
                Ok(f) => fees_json(&f),
                Err(e) => format!(r#"{{"error":"{}"}}"#, code(e)),
            };
            out.push(format!(
                r#"{{"op":"splitFees","args":["{}",{},{}],"result":{}}}"#,
                amount, creator_bps, burn_bps, split
            ));
            if amount < 400 {
                let net = match fees_for_net(amount, creator_bps, burn_bps) {
                    Ok(f) => fees_json(&f),
                    Err(e) => format!(r#"{{"error":"{}"}}"#, code(e)),
                };
                out.push(format!(
                    r#"{{"op":"feesForNet","args":["{}",{},{}],"result":{}}}"#,
                    amount, creator_bps, burn_bps, net
                ));
            }
        }
    }

    for round in 0..24 {
        let supply = (rng.next(40) * 5 + 995) * 1_000_000;
        let price = rng.next(5_000);
        let Ok(p) = launch_params(supply, price) else {
            continue;
        };
        let (creator_bps, burn_bps) = fee_sets[round % fee_sets.len()];
        let (mut curve_skr, mut curve_tokens) = (p.virtual_skr, p.virtual_tokens);
        let mut sold = 0u64;
        let (mut pool_skr, mut pool_tokens) = (0u64, 0u64);
        let mut held = 0u64;
        let mut graduated = false;

        for _ in 0..130 {
            if held == 0 || rng.next(3) != 1 {
                let skr_in = if rng.next(10) == 1 {
                    rng.next(5)
                } else {
                    rng.next(price * 700)
                };
                let (op, args, r) = if graduated {
                    (
                        "poolBuy",
                        format!(
                            r#"["{}","{}","{}",{},{}]"#,
                            pool_skr, pool_tokens, skr_in, creator_bps, burn_bps
                        ),
                        pool_buy(pool_skr, pool_tokens, skr_in, creator_bps, burn_bps),
                    )
                } else {
                    (
                        "curveBuy",
                        format!(
                            r#"["{}","{}","{}","{}",{},{}]"#,
                            curve_skr,
                            curve_tokens,
                            p.sale_supply - sold,
                            skr_in,
                            creator_bps,
                            burn_bps
                        ),
                        curve_buy(
                            curve_skr,
                            curve_tokens,
                            p.sale_supply - sold,
                            skr_in,
                            creator_bps,
                            burn_bps,
                        ),
                    )
                };
                let quote = r.as_ref().ok().copied();
                out.push(format!(
                    r#"{{"op":"{}","args":{},"result":{}}}"#,
                    op,
                    args,
                    buy_json(r)
                ));
                let Some(q) = quote else { continue };
                held += q.tokens_out;
                if graduated {
                    pool_skr = q.skr_reserve as u64;
                    pool_tokens = q.token_reserve as u64;
                } else {
                    curve_skr = q.skr_reserve;
                    curve_tokens = q.token_reserve;
                    sold += q.tokens_out;
                    if q.graduates {
                        graduated = true;
                        pool_skr = (curve_skr - p.virtual_skr) as u64;
                        pool_tokens = p.pool_supply;
                    }
                }
            } else {
                let tokens_in = if rng.next(10) == 1 {
                    rng.next(5)
                } else {
                    rng.next(held)
                };
                let (op, args, r) = if graduated {
                    (
                        "poolSell",
                        format!(
                            r#"["{}","{}","{}",{},{}]"#,
                            pool_skr, pool_tokens, tokens_in, creator_bps, burn_bps
                        ),
                        pool_sell(pool_skr, pool_tokens, tokens_in, creator_bps, burn_bps),
                    )
                } else {
                    (
                        "curveSell",
                        format!(
                            r#"["{}","{}","{}","{}",{},{}]"#,
                            curve_skr, curve_tokens, sold, tokens_in, creator_bps, burn_bps
                        ),
                        curve_sell(
                            curve_skr,
                            curve_tokens,
                            sold,
                            tokens_in,
                            creator_bps,
                            burn_bps,
                        ),
                    )
                };
                let quote = r.as_ref().ok().copied();
                out.push(format!(
                    r#"{{"op":"{}","args":{},"result":{}}}"#,
                    op,
                    args,
                    sell_json(r)
                ));
                let Some(q) = quote else { continue };
                held -= tokens_in;
                if graduated {
                    pool_skr = q.skr_reserve as u64;
                    pool_tokens = q.token_reserve as u64;
                } else {
                    curve_skr = q.skr_reserve;
                    curve_tokens = q.token_reserve;
                    sold -= tokens_in;
                }
            }
        }
    }

    println!("[\n{}\n]", out.join(",\n"));
}
