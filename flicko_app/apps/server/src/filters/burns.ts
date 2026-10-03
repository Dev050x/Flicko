import type {
  Connection,
  ParsedInstruction,
  ParsedTransactionWithMeta,
  PartiallyDecodedInstruction,
} from "@solana/web3.js";

/*
 * Checks a filter-unlock payment: how much of `mint` the `owner` burned in a confirmed
 * transaction (SPL Token or Token-2022 `burn` / `burnChecked`, inner instructions
 * included). null when the transaction is missing or failed.
 */
export interface BurnVerifier {
  burnedBy: (
    signature: string,
    owner: string,
    mint: string,
  ) => Promise<bigint | null>;
}

const TOKEN_PROGRAMS = new Set(["spl-token", "spl-token-2022"]);

type Instruction = ParsedInstruction | PartiallyDecodedInstruction;

interface BurnInfo {
  account: string;
  authority?: string;
  multisigAuthority?: string;
  mint?: string;
  amount?: string;
  tokenAmount?: { amount: string };
}

export const sumBurns = (
  tx: ParsedTransactionWithMeta,
  owner: string,
  mint: string,
): bigint => {
  const keys = tx.transaction.message.accountKeys.map((k) =>
    k.pubkey.toBase58(),
  );
  const balances = [
    ...(tx.meta?.preTokenBalances ?? []),
    ...(tx.meta?.postTokenBalances ?? []),
  ];
  const mintOf = (account: string) =>
    balances.find((b) => keys[b.accountIndex] === account)?.mint;

  const instructions: Instruction[] = [
    ...tx.transaction.message.instructions,
    ...(tx.meta?.innerInstructions ?? []).flatMap((inner) => inner.instructions),
  ];

  let total = 0n;
  for (const ix of instructions) {
    if (!("parsed" in ix) || !TOKEN_PROGRAMS.has(ix.program)) continue;
    const { type, info } = ix.parsed as { type: string; info: BurnInfo };
    if (type !== "burn" && type !== "burnChecked") continue;
    if ((info.authority ?? info.multisigAuthority) !== owner) continue;
    if ((info.mint ?? mintOf(info.account)) !== mint) continue;
    total += BigInt(info.tokenAmount?.amount ?? info.amount ?? 0);
  }
  return total;
};

export const rpcBurnVerifier = (connection: Connection): BurnVerifier => ({
  burnedBy: async (signature, owner, mint) => {
    const tx = await connection.getParsedTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!tx || tx.meta?.err) return null;
    return sumBurns(tx, owner, mint);
  },
});
