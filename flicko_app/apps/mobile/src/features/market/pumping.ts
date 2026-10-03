import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

/*
 * How many memes are up more than 50% in the last hour (the camera's "🔥 N pumping"
 * pill). Errors count as 0, which hides the pill.
 */
export const usePumpingCount = () =>
  useQuery({
    queryKey: ["pumping-count"],
    refetchInterval: 30_000,
    queryFn: async () => {
      try {
        return (await api<{ count: number }>("/market/pumping-count")).count;
      } catch {
        return 0;
      }
    },
  });
