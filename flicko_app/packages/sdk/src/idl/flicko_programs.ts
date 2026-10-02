/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/flicko_programs.json`.
 */
export type FlickoPrograms = {
  "address": "4BfMnkmQheerNffcJtEusXxVC16uhGExrRevBLUcZgBD",
  "metadata": {
    "name": "flickoPrograms",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "buy",
      "discriminator": [
        102,
        6,
        61,
        18,
        1,
        218,
        235,
        234
      ],
      "accounts": [
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "skrMint",
          "writable": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "mint",
          "relations": [
            "meme"
          ]
        },
        {
          "name": "meme",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  101,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "tokenVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  107,
                  101,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "meme"
              }
            ]
          }
        },
        {
          "name": "skrVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  107,
                  114,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "meme"
              }
            ]
          }
        },
        {
          "name": "buyerSkrAccount",
          "writable": true
        },
        {
          "name": "buyerTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "buyer"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "skrTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "skrIn",
          "type": "u64"
        },
        {
          "name": "minTokensOut",
          "type": "u64"
        }
      ]
    },
    {
      "name": "claimCreatorFees",
      "discriminator": [
        0,
        23,
        125,
        234,
        156,
        118,
        134,
        89
      ],
      "accounts": [
        {
          "name": "creator",
          "signer": true,
          "relations": [
            "meme"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "skrMint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "meme",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  101,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "meme.mint",
                "account": "meme"
              }
            ]
          }
        },
        {
          "name": "skrVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  107,
                  114,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "meme"
              }
            ]
          }
        },
        {
          "name": "creatorSkrAccount",
          "writable": true
        },
        {
          "name": "skrTokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "createMeme",
      "discriminator": [
        0,
        44,
        207,
        61,
        251,
        247,
        167,
        214
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "attestor",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  116,
                  116,
                  101,
                  115,
                  116,
                  111,
                  114
                ]
              }
            ]
          }
        },
        {
          "name": "instructions",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "skrMint",
          "writable": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "creatorSkrAccount",
          "writable": true
        },
        {
          "name": "mint",
          "writable": true,
          "signer": true
        },
        {
          "name": "meme",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  101,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "tokenVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  107,
                  101,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "meme"
              }
            ]
          }
        },
        {
          "name": "skrVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  107,
                  114,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "meme"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "skrTokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "symbol",
          "type": "string"
        },
        {
          "name": "uri",
          "type": "string"
        },
        {
          "name": "imageHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "supply",
          "type": "u64"
        },
        {
          "name": "startPrice",
          "type": "u64"
        },
        {
          "name": "expiresAt",
          "type": "i64"
        }
      ]
    },
    {
      "name": "initializeConfig",
      "discriminator": [
        208,
        127,
        21,
        1,
        194,
        190,
        196,
        70
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "skrMint"
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "program",
          "address": "4BfMnkmQheerNffcJtEusXxVC16uhGExrRevBLUcZgBD"
        },
        {
          "name": "programData"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "configArgs"
            }
          }
        }
      ]
    },
    {
      "name": "sell",
      "discriminator": [
        51,
        230,
        133,
        164,
        1,
        127,
        131,
        173
      ],
      "accounts": [
        {
          "name": "seller",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "skrMint",
          "writable": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "mint",
          "relations": [
            "meme"
          ]
        },
        {
          "name": "meme",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  101,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "tokenVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  107,
                  101,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "meme"
              }
            ]
          }
        },
        {
          "name": "skrVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  107,
                  114,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "meme"
              }
            ]
          }
        },
        {
          "name": "sellerSkrAccount",
          "writable": true
        },
        {
          "name": "sellerTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "skrTokenProgram"
        }
      ],
      "args": [
        {
          "name": "tokensIn",
          "type": "u64"
        },
        {
          "name": "minSkrOut",
          "type": "u64"
        }
      ]
    },
    {
      "name": "setAttestor",
      "discriminator": [
        95,
        11,
        236,
        157,
        234,
        146,
        163,
        237
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "attestor",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  116,
                  116,
                  101,
                  115,
                  116,
                  111,
                  114
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "authority",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "updateConfig",
      "discriminator": [
        29,
        158,
        252,
        191,
        10,
        83,
        219,
        99
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "configArgs"
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "attestor",
      "discriminator": [
        253,
        240,
        76,
        196,
        16,
        53,
        239,
        173
      ]
    },
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "meme",
      "discriminator": [
        232,
        224,
        0,
        147,
        187,
        194,
        135,
        26
      ]
    }
  ],
  "events": [
    {
      "name": "creatorFeesClaimed",
      "discriminator": [
        189,
        178,
        21,
        181,
        171,
        179,
        131,
        1
      ]
    },
    {
      "name": "graduated",
      "discriminator": [
        51,
        241,
        66,
        50,
        140,
        245,
        156,
        192
      ]
    },
    {
      "name": "memeCreated",
      "discriminator": [
        165,
        136,
        21,
        146,
        231,
        151,
        44,
        73
      ]
    },
    {
      "name": "trade",
      "discriminator": [
        24,
        254,
        218,
        152,
        253,
        43,
        18,
        81
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "supplyOutOfRange",
      "msg": "Supply is outside the allowed range"
    },
    {
      "code": 6001,
      "name": "priceOutOfRange",
      "msg": "Start price is outside the allowed range"
    },
    {
      "code": 6002,
      "name": "invalidSupply",
      "msg": "Supply must be divisible by 5"
    },
    {
      "code": 6003,
      "name": "invalidMetadata",
      "msg": "Name, symbol or uri is empty or too long"
    },
    {
      "code": 6004,
      "name": "invalidConfig",
      "msg": "Config values are invalid"
    },
    {
      "code": 6005,
      "name": "mathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6006,
      "name": "unauthorized",
      "msg": "Unauthorized"
    },
    {
      "code": 6007,
      "name": "invalidMint",
      "msg": "Invalid mint"
    },
    {
      "code": 6008,
      "name": "zeroAmount",
      "msg": "Amount is zero or too small to cover fees"
    },
    {
      "code": 6009,
      "name": "slippageExceeded",
      "msg": "Slippage limit exceeded"
    },
    {
      "code": 6010,
      "name": "insufficientLiquidity",
      "msg": "Not enough liquidity for this trade"
    },
    {
      "code": 6011,
      "name": "nothingToClaim",
      "msg": "No creator fees to claim"
    },
    {
      "code": 6012,
      "name": "missingAttestation",
      "msg": "Missing the attestor signature instruction"
    },
    {
      "code": 6013,
      "name": "invalidAttestation",
      "msg": "Attestor signature does not match this meme"
    },
    {
      "code": 6014,
      "name": "attestationExpired",
      "msg": "Attestation has expired"
    }
  ],
  "types": [
    {
      "name": "attestor",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "config",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "skrMint",
            "type": "pubkey"
          },
          {
            "name": "creatorFeeBps",
            "type": "u16"
          },
          {
            "name": "burnBps",
            "type": "u16"
          },
          {
            "name": "creationFee",
            "type": "u64"
          },
          {
            "name": "minSupply",
            "type": "u64"
          },
          {
            "name": "maxSupply",
            "type": "u64"
          },
          {
            "name": "minStartPrice",
            "type": "u64"
          },
          {
            "name": "maxStartPrice",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "configArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creatorFeeBps",
            "type": "u16"
          },
          {
            "name": "burnBps",
            "type": "u16"
          },
          {
            "name": "creationFee",
            "type": "u64"
          },
          {
            "name": "minSupply",
            "type": "u64"
          },
          {
            "name": "maxSupply",
            "type": "u64"
          },
          {
            "name": "minStartPrice",
            "type": "u64"
          },
          {
            "name": "maxStartPrice",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "creatorFeesClaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "meme",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "graduated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "meme",
            "type": "pubkey"
          },
          {
            "name": "poolSkr",
            "type": "u64"
          },
          {
            "name": "poolTokens",
            "type": "u64"
          },
          {
            "name": "graduatedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "meme",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "parent",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "imageHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "phase",
            "type": {
              "defined": {
                "name": "phase"
              }
            }
          },
          {
            "name": "totalSupply",
            "type": "u64"
          },
          {
            "name": "saleSupply",
            "type": "u64"
          },
          {
            "name": "poolSupply",
            "type": "u64"
          },
          {
            "name": "virtualSkr",
            "type": "u128"
          },
          {
            "name": "curveSkr",
            "type": "u128"
          },
          {
            "name": "curveTokens",
            "type": "u128"
          },
          {
            "name": "tokensSold",
            "type": "u64"
          },
          {
            "name": "realSkr",
            "type": "u64"
          },
          {
            "name": "poolSkr",
            "type": "u64"
          },
          {
            "name": "poolTokens",
            "type": "u64"
          },
          {
            "name": "creatorFees",
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "memeCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "meme",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "symbol",
            "type": "string"
          },
          {
            "name": "uri",
            "type": "string"
          },
          {
            "name": "imageHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "totalSupply",
            "type": "u64"
          },
          {
            "name": "startPrice",
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "phase",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "launch"
          },
          {
            "name": "graduated"
          }
        ]
      }
    },
    {
      "name": "trade",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "meme",
            "type": "pubkey"
          },
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "isBuy",
            "type": "bool"
          },
          {
            "name": "skrAmount",
            "type": "u64"
          },
          {
            "name": "tokenAmount",
            "type": "u64"
          },
          {
            "name": "creatorFee",
            "type": "u64"
          },
          {
            "name": "burned",
            "type": "u64"
          },
          {
            "name": "priceAfter",
            "type": "u64"
          },
          {
            "name": "phase",
            "type": {
              "defined": {
                "name": "phase"
              }
            }
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "attestationPrefix",
      "type": "bytes",
      "value": "[102, 108, 105, 99, 107, 111, 58, 99, 114, 101, 97, 116, 101, 58, 118, 49]"
    },
    {
      "name": "attestorSeed",
      "type": "bytes",
      "value": "[97, 116, 116, 101, 115, 116, 111, 114]"
    },
    {
      "name": "configSeed",
      "type": "bytes",
      "value": "[99, 111, 110, 102, 105, 103]"
    },
    {
      "name": "memeDecimals",
      "type": "u8",
      "value": "6"
    },
    {
      "name": "memeSeed",
      "type": "bytes",
      "value": "[109, 101, 109, 101]"
    },
    {
      "name": "skrVaultSeed",
      "type": "bytes",
      "value": "[115, 107, 114, 95, 118, 97, 117, 108, 116]"
    },
    {
      "name": "tokenVaultSeed",
      "type": "bytes",
      "value": "[116, 111, 107, 101, 110, 95, 118, 97, 117, 108, 116]"
    }
  ]
};
