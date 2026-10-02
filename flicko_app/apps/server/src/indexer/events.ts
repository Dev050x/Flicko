import { BorshCoder, EventParser } from "@anchor-lang/core";
import { IDL } from "@flicko/sdk";
import type { PublicKey } from "@solana/web3.js";

export type Phase = "launch" | "graduated";

export type FlickoEvent =
  | {
      kind: "memeCreated";
      meme: string;
      mint: string;
      creator: string;
      name: string;
      symbol: string;
      uri: string;
      imageHash: string;
      totalSupply: string;
      startPrice: string;
      createdAt: number;
    }
  | {
      kind: "trade";
      meme: string;
      trader: string;
      isBuy: boolean;
      skrAmount: string;
      tokenAmount: string;
      creatorFee: string;
      burned: string;
      priceAfter: string;
      phase: Phase;
    }
  | {
      kind: "graduated";
      meme: string;
      poolSkr: string;
      poolTokens: string;
      graduatedAt: number;
    }
  | {
      kind: "creatorFeesClaimed";
      meme: string;
      creator: string;
      amount: string;
    };

type Raw = Record<string, unknown>;

const key = (value: unknown) => (value as PublicKey).toBase58();
const amount = (value: unknown) => (value as { toString(): string }).toString();
const seconds = (value: unknown) => Number(amount(value));
const phaseOf = (value: unknown): Phase =>
  "graduated" in (value as object) ? "graduated" : "launch";
const hex = (bytes: unknown) => Buffer.from(bytes as number[]).toString("hex");

const decoders: Record<string, (data: Raw) => FlickoEvent> = {
  MemeCreated: (d) => ({
    kind: "memeCreated",
    meme: key(d.meme),
    mint: key(d.mint),
    creator: key(d.creator),
    name: d.name as string,
    symbol: d.symbol as string,
    uri: d.uri as string,
    imageHash: hex(d.image_hash),
    totalSupply: amount(d.total_supply),
    startPrice: amount(d.start_price),
    createdAt: seconds(d.created_at),
  }),
  Trade: (d) => ({
    kind: "trade",
    meme: key(d.meme),
    trader: key(d.trader),
    isBuy: d.is_buy as boolean,
    skrAmount: amount(d.skr_amount),
    tokenAmount: amount(d.token_amount),
    creatorFee: amount(d.creator_fee),
    burned: amount(d.burned),
    priceAfter: amount(d.price_after),
    phase: phaseOf(d.phase),
  }),
  Graduated: (d) => ({
    kind: "graduated",
    meme: key(d.meme),
    poolSkr: amount(d.pool_skr),
    poolTokens: amount(d.pool_tokens),
    graduatedAt: seconds(d.graduated_at),
  }),
  CreatorFeesClaimed: (d) => ({
    kind: "creatorFeesClaimed",
    meme: key(d.meme),
    creator: key(d.creator),
    amount: amount(d.amount),
  }),
};

export const createEventDecoder = (programId: PublicKey) => {
  const parser = new EventParser(programId, new BorshCoder(IDL));
  return (logs: string[]): FlickoEvent[] => {
    const events: FlickoEvent[] = [];
    for (const event of parser.parseLogs(logs)) {
      const decode = decoders[event.name];
      if (decode) events.push(decode(event.data as Raw));
    }
    return events;
  };
};
