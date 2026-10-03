import { Directory, File, Paths } from "expo-file-system";

/*
 * The in-progress snap as a draft on disk: the photo (copied out of the cache, which
 * Android may clear) and the flow's data as JSON. Written a moment after the last change.
 * Launch attempts are left out on purpose (they hold a mint keypair).
 */
const SAVE_DELAY_MS = 800;

let timer: ReturnType<typeof setTimeout> | undefined;
let copiedFrom: string | null = null;
let copiedTo: string | null = null;

const draftDir = () => new Directory(Paths.document, "drafts");

interface DraftSource {
  photo: { uri: string; width: number; height: number } | null;
}

const write = (state: DraftSource) => {
  if (!state.photo) return;
  const dir = draftDir();
  dir.create({ intermediates: true, idempotent: true });
  if (copiedFrom !== state.photo.uri) {
    const target = new File(dir, "photo.jpg");
    if (target.exists) target.delete();
    new File(state.photo.uri).copy(target);
    copiedFrom = state.photo.uri;
    copiedTo = target.uri;
  }
  const data = Object.fromEntries(
    Object.entries(state as object).filter(
      ([key, value]) =>
        typeof value !== "function" &&
        !["launch", "history", "index", "opened"].includes(key),
    ),
  );
  new File(dir, "draft.json").write(
    JSON.stringify({
      ...data,
      photo: { ...state.photo, uri: copiedTo },
      savedAt: new Date().toISOString(),
    }),
  );
};

export const saveDraft = (state: DraftSource) => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      write(state);
    } catch (err) {
      console.warn("[create] draft not saved", err);
    }
  }, SAVE_DELAY_MS);
};

export const clearDraft = () => {
  clearTimeout(timer);
  copiedFrom = null;
  copiedTo = null;
  try {
    const dir = draftDir();
    if (dir.exists) dir.delete();
  } catch (err) {
    console.warn("[create] draft not cleared", err);
  }
};
