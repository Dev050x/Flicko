import { ApiError } from "./api";
import { NotSubmittedError, WalletProblem } from "./mwa";

/*
 * One readable sentence for anything a wallet action can throw, so no screen shows a bare
 * "something went wrong" when we know better. `fallback` is used for the unknown rest.
 */
const offline = (err: unknown) =>
  err instanceof TypeError &&
  /network request failed|failed to fetch|fetch failed|network error/i.test(err.message);

const expired = (err: unknown) =>
  err instanceof Error &&
  /blockhash not found|block height exceeded|has expired|timed out|timeout/i.test(err.message);

export const friendlyError = (err: unknown, fallback: string): string => {
  if (err instanceof WalletProblem) return err.message;
  if (err instanceof NotSubmittedError) {
    return "Your wallet couldn't send it: the network turned it down. Check you have a little SOL and enough SKR, then try again.";
  }
  if (offline(err)) return "Can't reach the network. Check your internet connection and try again.";
  if (expired(err)) return "The network took too long to confirm. Try again.";
  if (err instanceof ApiError) {
    if (err.status === 401) return "Your session expired. Sign in again.";
    if (err.status === 429) return "Too many tries. Wait a moment and try again.";
    if (err.status >= 500) return "Flicko's server is having trouble. Try again in a minute.";
  }
  return fallback;
};
