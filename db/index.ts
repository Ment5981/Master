import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  const runtime = globalThis as typeof globalThis & {
    __MASTER_DB__?: D1Database;
  };

  if (!runtime.__MASTER_DB__) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(runtime.__MASTER_DB__, { schema });
}
