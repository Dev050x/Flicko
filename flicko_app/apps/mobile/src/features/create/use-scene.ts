import { useIsFocused } from "expo-router";
import { useEffect, useMemo, useState } from "react";

import type { Scene } from "./scene";
import { captionOf, type CreateState, useCreateStore } from "./store";

const pick = (s: CreateState) => ({
  photo: s.photo,
  edits: s.edits,
  faces: s.faces,
  suggestions: s.suggestions,
  choice: s.choice,
  custom: s.custom,
});
type Snapshot = ReturnType<typeof pick>;

const changed = (a: Snapshot, b: Snapshot) =>
  (Object.keys(a) as (keyof Snapshot)[]).some((key) => a[key] !== b[key]);

/*
 * The current scene from the create store, memoised so canvases only redraw on change.
 * `withCaption` adds the chosen caption (Caption, Launch, Live).
 *
 * A screen only follows the store while it is focused: Preview stays mounted under the
 * editor, and redrawing it on every drag step made dragging lag. It catches up on return.
 */
export const useScene = ({ withCaption = false } = {}): Scene | null => {
  const focused = useIsFocused();
  const [snap, setSnap] = useState(() => pick(useCreateStore.getState()));

  useEffect(() => {
    if (!focused) return;
    setSnap((prev) => {
      const now = pick(useCreateStore.getState());
      return changed(now, prev) ? now : prev;
    });
    return useCreateStore.subscribe((state) => {
      setSnap((prev) => {
        const now = pick(state);
        return changed(now, prev) ? now : prev;
      });
    });
  }, [focused]);

  const { photo, edits, faces, suggestions, choice, custom } = snap;
  return useMemo(() => {
    if (!photo) return null;
    return {
      photo,
      edits,
      faces: faces ?? [],
      ...(withCaption
        ? { caption: captionOf({ suggestions, choice, custom }) }
        : {}),
    };
  }, [photo, edits, faces, withCaption, suggestions, choice, custom]);
};

/* Width x height that fits `aspect` inside a box. */
export const fitIn = (aspect: number, box: { width: number; height: number }) =>
  box.width / box.height > aspect
    ? { width: box.height * aspect, height: box.height }
    : { width: box.width, height: box.width / aspect };
