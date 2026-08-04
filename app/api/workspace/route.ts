import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "../../../db";
import { masterWorkspaces } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";
import { isWorkspaceV2 } from "../../domain/migrate-workspace";
import { validateWorkspace } from "../../domain/validate-workspace";

export const dynamic = "force-dynamic";

const INSTALLATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getUserKey() {
  const user = await getChatGPTUser();
  if (user?.email) return user.email;
  const installationId = (await headers()).get("x-master-installation-id");
  if (installationId && INSTALLATION_ID_PATTERN.test(installationId)) {
    return `android:${installationId}`;
  }
  if (process.env.NODE_ENV === "development") return "preview@master.local";
  return null;
}

export async function GET() {
  const userKey = await getUserKey();
  if (!userKey) {
    return Response.json({ error: "请先登录后使用永久保存。" }, { status: 401 });
  }
  try {
    const db = getDb();
    const [record] = await db
      .select()
      .from(masterWorkspaces)
      .where(eq(masterWorkspaces.userKey, userKey))
      .limit(1);
    return Response.json({
      state: record ? JSON.parse(record.stateJson) : null,
      updatedAt: record?.updatedAt ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("no such table")) {
      return Response.json(
        { error: "数据空间正在初始化，请稍后重试。" },
        { status: 503 },
      );
    }
    return Response.json({ error: "暂时无法读取数据。" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const userKey = await getUserKey();
  if (!userKey) {
    return Response.json({ error: "请先登录后保存。" }, { status: 401 });
  }
  try {
    const payload = (await request.json()) as {
      state?: unknown;
      baseUpdatedAt?: string | null;
    };
    if (!isWorkspaceV2(payload.state)) {
      return Response.json({ error: "保存内容无效。" }, { status: 400 });
    }
    const validation = validateWorkspace(payload.state);
    if (!validation.ok) {
      return Response.json(
        { error: "工作区数据校验失败，请检查后重试。" },
        { status: 400 },
      );
    }
    const db = getDb();
    const [current] = await db
      .select()
      .from(masterWorkspaces)
      .where(eq(masterWorkspaces.userKey, userKey))
      .limit(1);
    if (current && current.updatedAt !== payload.baseUpdatedAt) {
      return Response.json(
        {
          error: "数据已在另一个页面更新，请刷新后继续。",
          updatedAt: current.updatedAt,
        },
        { status: 409 },
      );
    }
    let stateToSave = payload.state;
    if (current) {
      const previous = JSON.parse(current.stateJson) as { version?: number };
      if (previous.version === 1 && !payload.state.migration?.legacyV1) {
        stateToSave = {
          ...payload.state,
          migration: {
            ...(payload.state.migration ?? {}),
            migratedAt: new Date().toISOString(),
            sourceVersion: 1,
            legacyV1: previous,
          },
        };
      }
    }
    const stateJson = JSON.stringify(stateToSave);
    if (stateJson.length > 500_000) {
      return Response.json({ error: "当前目标内容过大。" }, { status: 413 });
    }
    const updatedAt = new Date().toISOString();
    if (current) {
      const result = await db
        .update(masterWorkspaces)
        .set({ stateJson, updatedAt })
        .where(
          and(
            eq(masterWorkspaces.userKey, userKey),
            eq(masterWorkspaces.updatedAt, current.updatedAt),
          ),
        );
      if ((result.meta.changes ?? 0) !== 1) {
        return Response.json(
          { error: "数据已更新，请刷新后继续。" },
          { status: 409 },
        );
      }
    } else {
      if (payload.baseUpdatedAt) {
        return Response.json(
          { error: "数据状态已变化，请刷新后继续。" },
          { status: 409 },
        );
      }
      const result = await db
        .insert(masterWorkspaces)
        .values({ userKey, stateJson, updatedAt })
        .onConflictDoNothing();
      if ((result.meta.changes ?? 0) !== 1) {
        return Response.json(
          { error: "数据已在另一个页面创建，请刷新。" },
          { status: 409 },
        );
      }
    }
    return Response.json({ saved: true, updatedAt });
  } catch {
    return Response.json({ error: "暂时无法保存，请稍后重试。" }, { status: 500 });
  }
}
