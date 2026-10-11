/*
 * Links into the app: share links are https://getflicko.tech/m/<mint> (and /u/<handle>,
 * which matches its route already). A meme link opens its market page.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  const meme = /^(?:https?:\/\/[^/]+)?\/?m\/([^/?#]+)/.exec(path);
  return meme ? `/meme/${meme[1]}` : path;
}
