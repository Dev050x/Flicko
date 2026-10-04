import type { ImageSource } from "expo-image";

import { useSession } from "@/store/session";

/*
 * The bundled avatars (from flicko-avatars, round 512px). The server only stores the id,
 * so the list and ids must match the server's AVATAR_IDS.
 */
export const AVATARS = [
  {
    id: "bobo",
    name: "Bobo",
    source: require("../../../assets/avatars/bobo.png"),
  },
  {
    id: "bobo-shades",
    name: "Bobo Shades",
    source: require("../../../assets/avatars/bobo-shades.png"),
  },
  {
    id: "froggo",
    name: "Froggo",
    source: require("../../../assets/avatars/froggo.png"),
  },
  {
    id: "astro-froggo",
    name: "Astro Froggo",
    source: require("../../../assets/avatars/astro-froggo.png"),
  },
  {
    id: "penny",
    name: "Penny",
    source: require("../../../assets/avatars/penny.png"),
  },
  {
    id: "dj-penny",
    name: "DJ Penny",
    source: require("../../../assets/avatars/dj-penny.png"),
  },
  {
    id: "pup",
    name: "Pup",
    source: require("../../../assets/avatars/pup.png"),
  },
  {
    id: "laser-pup",
    name: "Laser Pup",
    source: require("../../../assets/avatars/laser-pup.png"),
  },
] as const satisfies readonly {
  id: string;
  name: string;
  source: ImageSource;
}[];

export type AvatarId = (typeof AVATARS)[number]["id"];

export const DEFAULT_AVATAR: AvatarId = "bobo";

export const avatarById = (id: string | null | undefined) =>
  AVATARS.find((a) => a.id === id);

/* A random avatar, never the one passed in (so Shuffle always changes it). */
export const randomAvatarId = (not?: string | null): AvatarId => {
  const pool = AVATARS.filter((a) => a.id !== not);
  return pool[Math.floor(Math.random() * pool.length)].id;
};

const brandAvatar = require("../../../assets/brand/flicko-pfp-dark-ring-1024.png");

/* What to draw for an avatar: a photo url, a bundled avatar, or the Flicko mark. */
export const avatarSource = (
  uri: string | null | undefined,
  id: string | null | undefined,
): ImageSource => (uri ? { uri } : (avatarById(id)?.source ?? brandAvatar));

/* Someone else's avatar from the server's id/url pair, or null when they have none. */
export const profileAvatar = (
  url: string | null | undefined,
  id: string | null | undefined,
): ImageSource | null =>
  url ? { uri: url } : (avatarById(id)?.source ?? null);

/* Your own avatar; guests and anyone who hasn't picked one see the Flicko mark. */
export const useMyAvatar = () => {
  const uri = useSession((s) => s.avatarUri);
  const id = useSession((s) => s.avatarId);
  return avatarSource(uri, id);
};
