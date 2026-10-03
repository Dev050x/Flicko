import { File } from "expo-file-system";

import { config } from "@/config";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/*
 * JSON fetch against the Flicko server; non-2xx responses throw ApiError with the
 * server's `error` message.
 */
export const api = async <T>(
  path: string,
  {
    method = "GET",
    body,
    token,
  }: { method?: string; body?: unknown; token?: string } = {},
): Promise<T> => {
  const res = await fetch(`${config.apiUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText);
  return data as T;
};

/*
 * multipart/form-data POST with a local file (`image`) plus text fields. The app's fetch
 * (expo/fetch) only takes real Blob parts, not React Native's { uri, name, type }
 * objects, so the file goes in as an expo-file-system File (which is a Blob).
 */
export const apiForm = async <T>(
  path: string,
  {
    file,
    fields = {},
    token,
    timeoutMs = 30_000,
  }: {
    file: { uri: string; name: string; type: string };
    fields?: Record<string, string>;
    token?: string;
    timeoutMs?: number;
  },
): Promise<T> => {
  const form = new FormData();
  form.append("image", new File(file.uri) as unknown as Blob, file.name);
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const res = await fetch(`${config.apiUrl}${path}`, {
      method: "POST",
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: form,
      signal: abort.signal,
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText);
    return data as T;
  } finally {
    clearTimeout(timer);
  }
};
