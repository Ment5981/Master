import { and, eq } from "drizzle-orm";
import { getDb } from "./index";
import { masterWorkspaces } from "./schema";

export type WorkspaceRecord = {
  userKey: string;
  stateJson: string;
  updatedAt: string;
};

export interface WorkspaceStore {
  get(userKey: string): Promise<WorkspaceRecord | null>;
  updateIfCurrent(
    userKey: string,
    expectedUpdatedAt: string,
    stateJson: string,
    updatedAt: string,
  ): Promise<boolean>;
  insertIfAbsent(
    userKey: string,
    stateJson: string,
    updatedAt: string,
  ): Promise<boolean>;
}

function createCloudflareStore(): WorkspaceStore {
  return {
    async get(userKey) {
      const db = getDb();
      const [record] = await db
        .select()
        .from(masterWorkspaces)
        .where(eq(masterWorkspaces.userKey, userKey))
        .limit(1);
      return record ?? null;
    },
    async updateIfCurrent(userKey, expectedUpdatedAt, stateJson, updatedAt) {
      const db = getDb();
      const result = await db
        .update(masterWorkspaces)
        .set({ stateJson, updatedAt })
        .where(
          and(
            eq(masterWorkspaces.userKey, userKey),
            eq(masterWorkspaces.updatedAt, expectedUpdatedAt),
          ),
        );
      return (result.meta.changes ?? 0) === 1;
    },
    async insertIfAbsent(userKey, stateJson, updatedAt) {
      const db = getDb();
      const result = await db
        .insert(masterWorkspaces)
        .values({ userKey, stateJson, updatedAt })
        .onConflictDoNothing();
      return (result.meta.changes ?? 0) === 1;
    },
  };
}

/**
 * Select the persistence backend at request time. The SQLite module is loaded
 * lazily so the Cloudflare build never initializes a Node-only database driver.
 */
export async function getWorkspaceStore(): Promise<WorkspaceStore> {
  if (process.env.MASTER_SELF_HOSTED === "1") {
    const sqliteModule = await import("./sqlite-workspace-store");
    return sqliteModule.getSQLiteWorkspaceStore();
  }
  return createCloudflareStore();
}
