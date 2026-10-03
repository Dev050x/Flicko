import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, apiForm } from "@/lib/api";
import { useSession } from "@/store/session";

import { flatten, PREVIEW_EDGE } from "./render";
import { type Caption, useCreateStore } from "./store";

/*
 * Caption suggestions from POST /captions: the edited photo (without a caption) at
 * preview size goes to one vision-model call that also checks the photo is safe.
 */
export type CaptionStatus = "loading" | "ready" | "error" | "unsafe";

const TIMEOUT_MS = 15_000;

export const useCaptions = () => {
  const suggestions = useCreateStore((s) => s.suggestions);
  const [status, setStatus] = useState<CaptionStatus>(
    suggestions.length ? "ready" : "loading",
  );
  const attempt = useRef(0);

  const load = useCallback(async () => {
    const id = ++attempt.current;
    const { photo, edits, faces, setSuggestions } = useCreateStore.getState();
    if (!photo) return;
    setStatus("loading");
    try {
      const image = await flatten({ photo, edits, faces: faces ?? [] }, PREVIEW_EDGE);
      const { captions } = await apiForm<{ captions: Caption[] }>("/captions", {
        file: { uri: image.uri, name: "photo.jpg", type: "image/jpeg" },
        token: useSession.getState().session?.token,
        timeoutMs: TIMEOUT_MS,
      });
      if (id !== attempt.current) return;
      setSuggestions(captions.slice(0, 3));
      setStatus("ready");
    } catch (err) {
      if (id !== attempt.current) return;
      if (err instanceof ApiError && err.status === 422) {
        setStatus("unsafe");
        return;
      }
      console.warn("[create] captions failed", err);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (useCreateStore.getState().suggestions.length === 0) load();
  }, [load]);

  return { status, refresh: load };
};
