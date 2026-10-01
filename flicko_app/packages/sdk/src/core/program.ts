import { Program, type Provider } from "@anchor-lang/core";
import { Connection, PublicKey } from "@solana/web3.js";
import { IDL } from "./idl";
import type { FlickoPrograms } from "../idl/flicko_programs";

const idlFor = (programId?: PublicKey): FlickoPrograms =>
  programId
    ? ({ ...IDL, address: programId.toBase58() } as FlickoPrograms)
    : IDL;

export type FlickoProgram = Program<FlickoPrograms>;

export const getProgram = (provider: Provider, programId?: PublicKey) =>
  new Program<FlickoPrograms>(idlFor(programId), provider);

export const getReadonlyProgram = (
  connection: Connection,
  programId?: PublicKey,
) => new Program<FlickoPrograms>(idlFor(programId), { connection });
