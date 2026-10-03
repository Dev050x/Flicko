import { config } from "@/config";

const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PeQ6zQGCMDwSYk";

interface ParsedAccount {
  account: {
    data: {
      parsed: {
        info: {
          mint?: string;
          tokenAmount?: { amount: string };
          extensions?: { extension: string; state: Record<string, string> }[];
        };
      };
    };
  };
}

const rpc = async <T>(method: string, params: unknown[]): Promise<T> => {
  const res = await fetch(config.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await res.json()) as {
    result?: T;
    error?: { message: string };
  };
  if (!body.result) throw new Error(body.error?.message ?? "rpc error");
  return body.result;
};

/*
 * True when the wallet holds a Seeker Genesis Token: a non-empty Token-2022 account
 * whose mint has a TokenGroupMember extension in the SGT group and a MetadataPointer to
 * the SGT metadata address (both the same address, per Solana Mobile's docs).
 */
export const hasSeekerGenesisToken = async (wallet: string) => {
  const group = config.seekerGenesisGroup;
  if (!group) return false;
  try {
    const accounts = await rpc<{ value: ParsedAccount[] }>(
      "getTokenAccountsByOwner",
      [wallet, { programId: TOKEN_2022 }, { encoding: "jsonParsed" }],
    );
    const mints = accounts.value
      .map((a) => a.account.data.parsed.info)
      .filter((info) => info.tokenAmount?.amount !== "0" && info.mint)
      .map((info) => info.mint!);
    if (!mints.length) return false;

    const mintAccounts = await rpc<{
      value: (ParsedAccount["account"] | null)[];
    }>("getMultipleAccounts", [
      mints.slice(0, 100),
      { encoding: "jsonParsed" },
    ]);
    return mintAccounts.value.some((mint) => {
      const extensions = mint?.data.parsed.info.extensions ?? [];
      const member = extensions.find((e) => e.extension === "tokenGroupMember");
      const pointer = extensions.find((e) => e.extension === "metadataPointer");
      return (
        member?.state.group === group &&
        pointer?.state.metadataAddress === group
      );
    });
  } catch {
    return false;
  }
};
