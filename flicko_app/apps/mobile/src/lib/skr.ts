/*
 * Resolves a wallet's .skr name (Seeker's naming service). Not wired up yet: it returns
 * null, so the username field starts empty.
 * TODO: resolve via the .skr naming service once its resolver is chosen.
 */
export const resolveSkrName = async (_wallet: string): Promise<string | null> =>
  null;
