export const MAX_NAME_BYTES = 32;
export const MAX_SYMBOL_BYTES = 10;

const byteLength = (text: string) => Buffer.byteLength(text, "utf8");

/* The caption's words as written (no case change), up to MAX_NAME_BYTES. */
export const suggestName = (top: string, bottom: string) => {
  const words = `${top} ${bottom}`.split(/\s+/).filter(Boolean);
  let name = "";
  for (const word of words) {
    const next = name ? `${name} ${word}` : word;
    if (byteLength(next) > MAX_NAME_BYTES) break;
    name = next;
  }
  return name || "Flicko Meme";
};

export const suggestSymbol = (top: string, bottom: string) => {
  const letters = `${top} ${bottom}`
    .toUpperCase()
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Z0-9]/g, ""))
    .filter(Boolean)
    .slice(0, 5)
    .map((word) => word[0])
    .join("");
  return (letters + "FLK".slice(0, Math.max(0, 3 - letters.length))).slice(
    0,
    MAX_SYMBOL_BYTES,
  );
};

export const fitsName = (name: string) =>
  name.length > 0 && byteLength(name) <= MAX_NAME_BYTES;
