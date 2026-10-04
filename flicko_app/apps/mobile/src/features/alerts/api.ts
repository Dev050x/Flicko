import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { config } from "@/config";
import { skrOf } from "@/features/markets/api";
import { api } from "@/lib/api";
import { useSession } from "@/store/session";

/*
 * Price alerts for one meme (GET/POST/DELETE /me/alerts). Prices travel as SKR base
 * units per token; the app works in whole SKR.
 */
export type AlertDirection = "above" | "below";

export interface PriceAlert {
  id: string;
  /** SKR per token */
  price: number;
  direction: AlertDirection;
  triggered: boolean;
}

interface ServerAlert {
  id: string;
  price: string;
  direction: AlertDirection;
  triggeredAt: string | null;
}

/** "0.0021" → 2100n base units (6 decimals); null if it isn't a positive number */
export const toBaseUnits = (text: string): bigint | null => {
  const clean = text.trim().replace(",", ".");
  if (!/^\d*\.?\d*$/.test(clean) || clean === "" || clean === ".") return null;
  const [whole, frac = ""] = clean.split(".");
  if (frac.length > config.skrDecimals) return null;
  const units =
    BigInt(whole || "0") * 10n ** BigInt(config.skrDecimals) +
    BigInt(frac.padEnd(config.skrDecimals, "0") || "0");
  return units > 0n ? units : null;
};

const key = (mint: string, wallet: string | undefined) =>
  ["alerts", mint, wallet] as const;

export const useAlerts = (mint: string) => {
  const session = useSession((s) => s.session);
  return useQuery({
    queryKey: key(mint, session?.wallet),
    enabled: !!session && !config.useMocks,
    queryFn: async (): Promise<PriceAlert[]> => {
      const res = await api<{ items: ServerAlert[] }>(
        `/me/alerts?mint=${mint}`,
        {
          token: session!.token,
        },
      );
      return res.items.map((a) => ({
        id: a.id,
        price: skrOf(a.price),
        direction: a.direction,
        triggered: a.triggeredAt !== null,
      }));
    },
  });
};

export const useCreateAlert = (mint: string) => {
  const client = useQueryClient();
  const session = useSession((s) => s.session);
  return useMutation({
    mutationFn: async ({
      price,
      direction,
    }: {
      price: bigint;
      direction: AlertDirection;
    }) => {
      if (!session) throw new Error("not signed in");
      await api("/me/alerts", {
        method: "POST",
        body: { mint, price: price.toString(), direction },
        token: session.token,
      });
    },
    onSettled: () =>
      client.invalidateQueries({ queryKey: key(mint, session?.wallet) }),
  });
};

export const useDeleteAlert = (mint: string) => {
  const client = useQueryClient();
  const session = useSession((s) => s.session);
  const k = key(mint, session?.wallet);
  return useMutation({
    mutationFn: async (id: string) => {
      if (!session) throw new Error("not signed in");
      await api(`/me/alerts/${id}`, { method: "DELETE", token: session.token });
    },
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: k });
      const before = client.getQueryData<PriceAlert[]>(k);
      client.setQueryData<PriceAlert[]>(k, (list = []) =>
        list.filter((a) => a.id !== id),
      );
      return { before };
    },
    onError: (_e, _id, ctx) => client.setQueryData(k, ctx?.before),
    onSettled: () => client.invalidateQueries({ queryKey: k }),
  });
};
