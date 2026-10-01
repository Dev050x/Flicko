import {
  buyInstruction,
  claimCreatorFeesInstruction,
  configPda,
  createMemeInstruction,
  memePda,
  memePrice,
  memeTokenAccount,
  quoteBuy,
  quoteSell,
  sellInstruction,
  skrTokenAccount,
  toFeeConfig,
  toMemeState,
  withSlippage,
} from "@flicko/sdk";
import { getAccount, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, type PublicKey } from "@solana/web3.js";
import { createHash, randomBytes } from "node:crypto";
import {
  connection,
  payer,
  program,
  programId,
  readNetworkConfig,
  requireSkrMint,
  send,
  txUrl,
} from "./lib/network";

const ONE = 1_000_000n;
const SLIPPAGE_BPS = 100;

const skrMint = requireSkrMint(readNetworkConfig());
const user = payer.publicKey;

const check = (label: string, ok: boolean) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) process.exit(1);
};

const tokenBalance = async (owner: PublicKey, mint: PublicKey) =>
  (
    await getAccount(
      connection,
      memeTokenAccount(owner, mint),
      "confirmed",
      TOKEN_2022_PROGRAM_ID,
    )
  ).amount;

const skrBalance = async (owner: PublicKey) =>
  (await getAccount(connection, skrTokenAccount(owner, skrMint), "confirmed"))
    .amount;

const loadMeme = async (mint: PublicKey) =>
  toMemeState(await program.account.meme.fetch(memePda(mint, programId)));

const fees = toFeeConfig(
  await program.account.config.fetch(configPda(programId)),
);

const mint = Keypair.generate();
const created = await send(
  [
    await createMemeInstruction(program, {
      creator: user,
      mint: mint.publicKey,
      skrMint,
      name: "Smoke Test",
      symbol: "SMOKE",
      uri: "https://example.com/smoke.json",
      imageHash: createHash("sha256").update(randomBytes(32)).digest(),
      supply: 1_000_000n * ONE,
      startPrice: 1_000n,
    }),
  ],
  [mint],
);
console.log(`created meme ${mint.publicKey.toBase58()}`);
console.log(txUrl(created));

const skrIn = 5n * ONE;
const buyQuote = quoteBuy(await loadMeme(mint.publicKey), fees, skrIn);
const bought = await send([
  await buyInstruction(program, {
    trader: user,
    mint: mint.publicKey,
    skrMint,
    skrIn,
    minTokensOut: withSlippage(buyQuote.tokensOut, SLIPPAGE_BPS),
  }),
]);
console.log(`bought with ${skrIn / ONE} SKR`);
console.log(txUrl(bought));

const held = await tokenBalance(user, mint.publicKey);
check(
  `received exactly the quoted ${buyQuote.tokensOut} token units`,
  held === buyQuote.tokensOut,
);
const afterBuy = await loadMeme(mint.publicKey);
check(
  "curve reserves match the quote",
  afterBuy.curveSkr === buyQuote.skrReserve &&
    afterBuy.curveTokens === buyQuote.tokenReserve,
);

const tokensIn = held / 2n;
const sellQuote = quoteSell(afterBuy, fees, tokensIn);
const skrBefore = await skrBalance(user);
const sold = await send([
  await sellInstruction(program, {
    trader: user,
    mint: mint.publicKey,
    skrMint,
    tokensIn,
    minSkrOut: withSlippage(sellQuote.fees.net, SLIPPAGE_BPS),
  }),
]);
console.log(`sold ${tokensIn} token units`);
console.log(txUrl(sold));
check(
  `received exactly the quoted ${sellQuote.fees.net} SKR units`,
  (await skrBalance(user)) - skrBefore === sellQuote.fees.net,
);

const accrued = (await loadMeme(mint.publicKey)).creatorFees;
const claimed = await send([
  await claimCreatorFeesInstruction(program, {
    creator: user,
    mint: mint.publicKey,
    skrMint,
  }),
]);
console.log(`claimed ${accrued} SKR units of creator fees`);
console.log(txUrl(claimed));
check(
  "creator fees reset after claim",
  (await loadMeme(mint.publicKey)).creatorFees === 0n,
);

console.log(
  `price now ${memePrice(await loadMeme(mint.publicKey))} SKR units per token`,
);
console.log("smoke test passed");
