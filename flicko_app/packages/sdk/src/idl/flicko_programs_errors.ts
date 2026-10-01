
export const FlickoProgramsErrorCode = {
  SupplyOutOfRange: 6000,
  PriceOutOfRange: 6001,
  InvalidSupply: 6002,
  InvalidMetadata: 6003,
  InvalidConfig: 6004,
  MathOverflow: 6005,
  Unauthorized: 6006,
  InvalidMint: 6007,
  ZeroAmount: 6008,
  SlippageExceeded: 6009,
  InsufficientLiquidity: 6010,
  NothingToClaim: 6011
};

export type FlickoProgramsErrorName = keyof typeof FlickoProgramsErrorCode;
