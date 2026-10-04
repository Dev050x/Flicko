import { api } from "./api";

/*
 * Sign In With Solana against the server. The nonce is requested without an address so
 * the wallet fills it in and connect + sign-in take one MWA approval.
 */
export interface SignInInput {
  domain: string;
  statement: string;
  uri: string;
  version: string;
  chainId: string;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
}

export interface User {
  wallet: string;
  username: string | null;
  avatarId: string | null;
  avatarUrl: string | null;
  displayName: string | null;
  bio: string | null;
  createdAt: string;
}

export const fetchSignInInput = async () =>
  (
    await api<{ input: SignInInput }>("/auth/nonce", {
      method: "POST",
      body: {},
    })
  ).input;

export const verifySignIn = (body: {
  address: string;
  message: string;
  signature: string;
}) =>
  api<{ token: string; expiresAt: string; user: User }>("/auth/siws", {
    method: "POST",
    body,
  });

export const checkUsername = (name: string, token?: string) =>
  api<{ username: string; available: boolean; reason?: "taken" | "invalid" }>(
    `/usernames/${encodeURIComponent(name)}`,
    { token },
  );

export const saveProfile = (
  body: {
    username?: string;
    avatarId?: string | null;
    displayName?: string;
    bio?: string;
  },
  token: string,
) => api<{ user: User }>("/me", { method: "PATCH", body, token });
