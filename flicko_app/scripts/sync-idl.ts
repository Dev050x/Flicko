import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const programTarget = join(import.meta.dir, "../../flicko_programs/target");
const idlDir = join(import.meta.dir, "../packages/sdk/src/idl");

const files = [
  ["idl/flicko_programs.json", "flicko_programs.json"],
  ["types/flicko_programs.ts", "flicko_programs.ts"],
  ["types/flicko_programs_errors.ts", "flicko_programs_errors.ts"],
] as const;

for (const [from, to] of files) {
  const source = join(programTarget, from);
  if (!existsSync(source)) {
    console.error(`missing ${source}, run anchor build in flicko_programs first`);
    process.exit(1);
  }
  copyFileSync(source, join(idlDir, to));
  console.log(`synced ${from} -> packages/sdk/src/idl/${to}`);
}
