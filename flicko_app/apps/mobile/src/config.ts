/*
 * Runtime config from EXPO_PUBLIC_* env (see .env.example). Nothing network-specific is
 * hard-coded in screens.
 */
/*
 * Expo inlines EXPO_PUBLIC_* only when read literally, so each one is spelled out below.
 */
const env = (value: string | undefined, fallback: string) =>
  value?.trim() || fallback;

export const config = {
  apiUrl: env(process.env.EXPO_PUBLIC_API_URL, "http://localhost:3000").replace(
    /\/$/,
    "",
  ),
  cluster: env(process.env.EXPO_PUBLIC_CLUSTER, "devnet"),
  rpcUrl: env(process.env.EXPO_PUBLIC_RPC_URL, "https://api.devnet.solana.com"),
  /*
   * Seeker Genesis Token: its mint carries TokenGroupMember and MetadataPointer
   * extensions pointing here (docs.solanamobile.com, "Engaging Seeker users"). SGTs only
   * exist on mainnet, so the Verified Seeker card never shows on devnet.
   */
  seekerGenesisGroup: env(
    process.env.EXPO_PUBLIC_SGT_GROUP,
    "GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te",
  ),
  identity: {
    name: "Flicko",
    uri: env(process.env.EXPO_PUBLIC_IDENTITY_URI, "https://flicko.app"),
    icon: "favicon.png",
  },
  wallets: [
    { name: "Phantom", playId: "app.phantom" },
    { name: "Solflare", playId: "com.solflare.mobile" },
  ],
} as const;

export const chain = `solana:${config.cluster}` as const;
