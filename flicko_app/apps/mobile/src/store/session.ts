import { create } from "zustand";

import { secureStore } from "@/lib/native";

/*
 * Who is using the app. `token` is the server session (SIWS, 7 days); `mwaAuthToken`
 * lets later transactions reauthorize with the wallet without a new approval. Everything
 * is persisted in SecureStore and restored before the splash hides.
 */
export interface Session {
  wallet: string;
  token: string;
  expiresAt: string;
  mwaAuthToken: string;
  walletLabel?: string;
}

interface SessionState {
  hydrated: boolean;
  session: Session | null;
  isGuest: boolean;
  onboardingDone: boolean;
  avatarUri: string | null;
  hydrate: () => Promise<void>;
  signIn: (session: Session) => void;
  setMwaAuthToken: (authToken: string) => void;
  browseAsGuest: () => void;
  finishOnboarding: () => void;
  setAvatar: (uri: string | null) => void;
  signOut: () => void;
}

const KEYS = {
  session: "flicko.session",
  guest: "flicko.guest",
  onboarding: "flicko.onboarding",
  avatar: "flicko.avatar",
} as const;

/*
 * SecureStore when the build has it; otherwise the values only live for this run.
 */
const memory = new Map<string, string>();

const save = (key: string, value: string | null) => {
  const store = secureStore();
  if (!store) {
    if (value === null) memory.delete(key);
    else memory.set(key, value);
    return;
  }
  const write =
    value === null
      ? store.deleteItemAsync(key)
      : store.setItemAsync(key, value);
  write.catch((err) => console.warn("[session] save failed", key, err));
};

const read = async (key: string) => {
  const store = secureStore();
  if (!store) return memory.get(key) ?? null;
  try {
    return await store.getItemAsync(key);
  } catch {
    return null;
  }
};

const parseSession = (raw: string | null): Session | null => {
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as Session;
    return Date.parse(session.expiresAt) > Date.now() ? session : null;
  } catch {
    return null;
  }
};

export const useSession = create<SessionState>((set, get) => ({
  hydrated: false,
  session: null,
  isGuest: false,
  onboardingDone: false,
  avatarUri: null,

  /*
   * An expired session is dropped, so the user lands on the welcome screen again.
   */
  hydrate: async () => {
    const [session, guest, onboarding, avatar] = await Promise.all([
      read(KEYS.session),
      read(KEYS.guest),
      read(KEYS.onboarding),
      read(KEYS.avatar),
    ]);
    const restored = parseSession(session);
    if (session && !restored) save(KEYS.session, null);
    set({
      hydrated: true,
      session: restored,
      isGuest: !restored && guest === "1",
      onboardingDone: onboarding === "1",
      avatarUri: avatar,
    });
  },

  signIn: (session) => {
    save(KEYS.session, JSON.stringify(session));
    save(KEYS.guest, null);
    set({ session, isGuest: false });
  },

  /*
   * The wallet may hand back a new auth_token when it reauthorizes.
   */
  setMwaAuthToken: (authToken) => {
    const session = get().session;
    if (!session || session.mwaAuthToken === authToken) return;
    const next = { ...session, mwaAuthToken: authToken };
    save(KEYS.session, JSON.stringify(next));
    set({ session: next });
  },

  browseAsGuest: () => {
    save(KEYS.guest, "1");
    set({ isGuest: true });
  },

  finishOnboarding: () => {
    save(KEYS.onboarding, "1");
    set({ onboardingDone: true });
  },

  setAvatar: (uri) => {
    save(KEYS.avatar, uri);
    set({ avatarUri: uri });
  },

  signOut: () => {
    for (const key of Object.values(KEYS)) save(key, null);
    set({
      session: null,
      isGuest: false,
      onboardingDone: false,
      avatarUri: null,
    });
  },
}));
