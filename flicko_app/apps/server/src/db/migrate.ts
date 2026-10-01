import { migrate } from "drizzle-orm/postgres-js/migrator";
import { join } from "node:path";
import { parseEnv } from "../env";
import { createDb } from "./client";

const env = parseEnv(process.env);
const database = createDb(env.DATABASE_URL);

await migrate(database.db, {
  migrationsFolder: join(import.meta.dir, "../../drizzle"),
});
console.log("migrations applied");
await database.close();
