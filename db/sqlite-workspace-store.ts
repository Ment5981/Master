import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { WorkspaceRecord, WorkspaceStore } from "./workspace-store";

const DEFAULT_PATH = "/data/master.sqlite";

type SQLiteResult = { changes: number | bigint };

function normalizeResult(
  row: Record<string, unknown> | undefined,
): WorkspaceRecord | null {
  if (!row) return null;
  return {
    userKey: String(row.user_key),
    stateJson: String(row.state_json),
    updatedAt: String(row.updated_at),
  };
}

export function createSQLiteWorkspaceStore(
  databasePath = process.env.MASTER_SQLITE_PATH ?? DEFAULT_PATH,
): WorkspaceStore & { close: () => void } {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS master_workspaces (
      user_key TEXT PRIMARY KEY NOT NULL,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const getStatement = database.prepare(
    "SELECT user_key, state_json, updated_at FROM master_workspaces WHERE user_key = ? LIMIT 1",
  );
  const updateStatement = database.prepare(
    "UPDATE master_workspaces SET state_json = ?, updated_at = ? WHERE user_key = ? AND updated_at = ?",
  );
  const insertStatement = database.prepare(
    "INSERT OR IGNORE INTO master_workspaces (user_key, state_json, updated_at) VALUES (?, ?, ?)",
  );

  return {
    async get(userKey) {
      return normalizeResult(
        getStatement.get(userKey) as Record<string, unknown> | undefined,
      );
    },
    async updateIfCurrent(userKey, expectedUpdatedAt, stateJson, updatedAt) {
      const result = updateStatement.run(
        stateJson,
        updatedAt,
        userKey,
        expectedUpdatedAt,
      ) as SQLiteResult;
      return Number(result.changes) === 1;
    },
    async insertIfAbsent(userKey, stateJson, updatedAt) {
      const result = insertStatement.run(
        userKey,
        stateJson,
        updatedAt,
      ) as SQLiteResult;
      return Number(result.changes) === 1;
    },
    close() {
      database.close();
    },
  };
}

let singleton: (WorkspaceStore & { close: () => void }) | null = null;
let singletonPath: string | null = null;

export function getSQLiteWorkspaceStore(): WorkspaceStore {
  const databasePath = process.env.MASTER_SQLITE_PATH ?? DEFAULT_PATH;
  if (!singleton || singletonPath !== databasePath) {
    singleton?.close();
    singleton = createSQLiteWorkspaceStore(databasePath);
    singletonPath = databasePath;
  }
  return singleton;
}
