/*
 * web3.js and the wallet adapter need crypto.getRandomValues and a global Buffer.
 * Imported first by the root layout.
 */
import "react-native-get-random-values";
import { Buffer } from "buffer";

const scope = globalThis as unknown as { Buffer?: typeof Buffer };
scope.Buffer ??= Buffer;
