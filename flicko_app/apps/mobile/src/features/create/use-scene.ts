import { useMemo } from "react";

import type { Scene } from "./scene";
import { captionOf, useCreateStore } from "./store";

/*
 * The current scene from the create store, memoised so canvases only redraw on change.
 * `withCaption` adds the chosen caption (Caption, Launch, Live).
 */
export const useScene = ({ withCaption = false } = {}): Scene | null => {
  const photo = useCreateStore((s) => s.photo);
  const edits = useCreateStore((s) => s.edits);
  const faces = useCreateStore((s) => s.faces);
  const suggestions = useCreateStore((s) => s.suggestions);
  const choice = useCreateStore((s) => s.choice);
  const custom = useCreateStore((s) => s.custom);

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
