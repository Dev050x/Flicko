export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushSender {
  send(messages: PushMessage[]): Promise<{ invalidTokens: string[] }>;
}

export const EXPO_TOKEN = /^Expo(nent)?PushToken\[[^\]]+\]$/;

const ENDPOINT = "https://exp.host/--/api/v2/push/send";
const BATCH = 100;

interface Ticket {
  status: "ok" | "error";
  details?: { error?: string };
}

export const expoPushSender = (
  opts: { accessToken?: string; fetch?: typeof fetch } = {},
): PushSender => {
  const doFetch = opts.fetch ?? fetch;
  return {
    send: async (messages) => {
      const invalidTokens: string[] = [];
      for (let i = 0; i < messages.length; i += BATCH) {
        const batch = messages.slice(i, i + BATCH);
        const res = await doFetch(ENDPOINT, {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            ...(opts.accessToken
              ? { authorization: `Bearer ${opts.accessToken}` }
              : {}),
          },
          body: JSON.stringify(
            batch.map((message) => ({ ...message, sound: "default" })),
          ),
        });
        if (!res.ok) throw new Error(`expo push returned ${res.status}`);
        const { data } = (await res.json()) as { data?: Ticket[] };
        data?.forEach((ticket, index) => {
          if (ticket.details?.error === "DeviceNotRegistered") {
            invalidTokens.push(batch[index]!.to);
          }
        });
      }
      return { invalidTokens };
    },
  };
};
