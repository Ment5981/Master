import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSQLiteWorkspaceStore } from "../db/sqlite-workspace-store";

test("SQLite 工作区保存、读取和乐观并发保护", async () => {
  const directory = mkdtempSync(join(tmpdir(), "master-sqlite-test-"));
  const store = createSQLiteWorkspaceStore(join(directory, "master.sqlite"));

  assert.equal(await store.get("installation:test"), null);
  assert.equal(
    await store.insertIfAbsent("installation:test", '{"version":2}', "v1"),
    true,
  );
  assert.equal(
    await store.insertIfAbsent("installation:test", '{"version":2}', "v2"),
    false,
  );
  assert.deepEqual(await store.get("installation:test"), {
    userKey: "installation:test",
    stateJson: '{"version":2}',
    updatedAt: "v1",
  });
  assert.equal(
    await store.updateIfCurrent(
      "installation:test",
      "stale",
      '{"version":3}',
      "v3",
    ),
    false,
  );
  assert.equal(
    await store.updateIfCurrent(
      "installation:test",
      "v1",
      '{"version":3}',
      "v3",
    ),
    true,
  );
  assert.equal((await store.get("installation:test"))?.updatedAt, "v3");
  store.close();
});
