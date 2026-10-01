import idlJson from "./idl/flicko_programs.json";
import type { FlickoPrograms } from "./idl/flicko_programs";

export type { FlickoPrograms } from "./idl/flicko_programs";
export {
  FlickoProgramsErrorCode,
  type FlickoProgramsErrorName,
} from "./idl/flicko_programs_errors";

export const IDL = idlJson as FlickoPrograms;
