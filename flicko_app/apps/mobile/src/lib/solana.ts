import { Connection } from "@solana/web3.js";

import { config } from "@/config";

/*
 * One RPC connection for the app (EXPO_PUBLIC_RPC_URL).
 */
export const connection = new Connection(config.rpcUrl, "confirmed");
